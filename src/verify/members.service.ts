import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { JoinStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { CurrentUser } from '../auth/current-user';
import { groupWhere, profileWhere, scopeOf } from '../auth/scope';
import { VerifyService } from './verify.service';

/** Ce que le vérificateur fait pour NOS profils dans les groupes :
 *   - `approve`    : accepter leur demande d'adhésion en attente ;
 *   - `preapprove` : les « pré-approuver », pour que leurs posts paraissent
 *                    sans validation des modérateurs.
 *
 * Seuls les profils de la plateforme sont concernés, et ils sont désignés par
 * leur identifiant Facebook numérique (jamais par leur nom, qui se partage).
 * L'extension n'agit que sur la ligne portant EXACTEMENT cet identifiant, et
 * le serveur revérifie l'identifiant à chaque rapport. */
export const MEMBER_KINDS = ['approve', 'preapprove'] as const;
export type MemberKind = (typeof MEMBER_KINDS)[number];
export const MEMBER_OUTCOMES = [
  'done', // fait
  'already', // c'était déjà le cas
  'not_found', // pas de demande / de membre à cet identifiant sur la page
  'no_permission', // le vérificateur n'a pas l'option : ni admin ni modérateur
  'unreachable', // page illisible
] as const;
export type MemberOutcome = (typeof MEMBER_OUTCOMES)[number];

const CLAIM_MINUTES = 30;
const MAX_ATTEMPTS = 6;
const RETRY_MINUTES: Record<Exclude<MemberOutcome, 'done' | 'already'>, number> = {
  not_found: 6 * 60,
  no_permission: 24 * 60,
  unreachable: 30,
};
const PENDING_JOIN: JoinStatus[] = [JoinStatus.REQUESTED, JoinStatus.QUESTIONS];

@Injectable()
export class MembersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly verify: VerifyService,
  ) {}

  /** Ce qui reste à faire, hors réservation en cours et hors abandons. */
  private dueWhere(acting: CurrentUser | null, moderatorId: string | null, now: Date): Prisma.ProfileGroupWhereInput {
    const scope = scopeOf(acting);
    return {
      status: 'ACTIVE',
      memberAttempts: { lt: MAX_ATTEMPTS },
      AND: [
        { OR: [{ memberClaimedUntil: null }, { memberClaimedUntil: { lt: now } }] },
        {
          OR: [
            { joinStatus: { in: PENDING_JOIN }, memberApprovedAt: null },
            { joinStatus: JoinStatus.JOINED, preApprovedAt: null },
          ],
        },
      ],
      // Nos profils seulement, et seulement ceux dont on connaît le compte
      // Facebook : sans identifiant, impossible de les reconnaître sûrement.
      profile: {
        status: 'ACTIVE',
        facebookUserId: { not: null },
        ...(moderatorId ? { id: { not: moderatorId } } : {}),
        ...profileWhere(scope),
      },
      group: { status: 'ACTIVE', ...groupWhere(scope) },
    };
  }

  async claim(profileExternalId: string, limit: number, acting: CurrentUser | null, now = new Date()) {
    const moderator = await this.verify.moderator(profileExternalId, acting);
    const due = await this.prisma.profileGroup.findMany({
      where: this.dueWhere(acting, moderator.id, now),
      orderBy: { updatedAt: 'asc' },
      take: Math.max(1, Math.min(10, limit || 5)),
      select: {
        id: true,
        joinStatus: true,
        profile: { select: { name: true, facebookUserId: true, facebookName: true } },
        group: { select: { name: true, url: true } },
      },
    });
    if (due.length) {
      await this.prisma.profileGroup.updateMany({
        where: { id: { in: due.map((d) => d.id) } },
        data: { memberClaimedUntil: new Date(now.getTime() + CLAIM_MINUTES * 60_000) },
      });
    }
    return {
      tasks: due.map((d) => ({
        taskId: d.id,
        kind: (PENDING_JOIN.includes(d.joinStatus) ? 'approve' : 'preapprove') as MemberKind,
        member: {
          facebookUserId: d.profile.facebookUserId as string,
          name: d.profile.facebookName || d.profile.name,
        },
        group: d.group,
      })),
    };
  }

  async report(
    taskId: string,
    input: { profileExternalId: string; kind: MemberKind; outcome: MemberOutcome; facebookUserId: string; detail?: string },
    acting: CurrentUser | null,
    now = new Date(),
  ) {
    const moderator = await this.verify.moderator(input.profileExternalId, acting);
    const row = await this.prisma.profileGroup.findFirst({
      where: { id: taskId, profile: profileWhere(scopeOf(acting)), group: groupWhere(scopeOf(acting)) },
      select: {
        id: true,
        profileId: true,
        groupId: true,
        memberAttempts: true,
        profile: { select: { name: true, facebookUserId: true } },
        group: { select: { name: true } },
      },
    });
    if (!row) throw new NotFoundException('Tâche introuvable');
    // Le garde-fou : l'extension doit avoir agi sur NOTRE profil. Un rapport
    // pour un autre identifiant est refusé et signalé.
    if (!row.profile.facebookUserId || row.profile.facebookUserId !== input.facebookUserId) {
      await this.log(row, 'MEMBER_MISMATCH', 'ERROR', `Rapport refusé : l’identifiant ${input.facebookUserId} n’est pas celui de « ${row.profile.name} »`, moderator.name);
      throw new ForbiddenException('Cet identifiant Facebook n’est pas celui de ce profil');
    }
    const detail = (input.detail || '').slice(0, 1000);

    if (input.outcome === 'done' || input.outcome === 'already') {
      const data: Prisma.ProfileGroupUpdateInput =
        input.kind === 'approve'
          ? { joinStatus: JoinStatus.JOINED, joinCheckedAt: now, joinError: null, memberApprovedAt: now }
          : { preApprovedAt: now };
      await this.prisma.$transaction([
        this.prisma.profileGroup.update({
          where: { id: row.id },
          data: { ...data, memberAttempts: 0, memberActionError: null, memberActionAt: now, memberClaimedUntil: null },
        }),
        this.log(
          row,
          input.kind === 'approve' ? 'MEMBER_APPROVED' : 'MEMBER_PREAPPROVED',
          'INFO',
          input.kind === 'approve'
            ? `Adhésion de « ${row.profile.name} » acceptée dans « ${row.group.name} »${input.outcome === 'already' ? ' (déjà membre)' : ''}`
            : `« ${row.profile.name} » pré-approuvé dans « ${row.group.name} » : ses posts paraissent sans validation${input.outcome === 'already' ? ' (déjà le cas)' : ''}`,
          moderator.name,
        ),
      ]);
      return { taskId, result: 'done' };
    }

    const attempts = row.memberAttempts + 1;
    const reason =
      input.outcome === 'no_permission'
        ? `le vérificateur n’a pas cette option dans « ${row.group.name} » : il doit y être administrateur ou modérateur`
        : input.outcome === 'not_found'
          ? input.kind === 'approve'
            ? 'aucune demande d’adhésion de ce compte dans la liste'
            : 'ce compte n’a pas été trouvé parmi les membres'
          : 'page illisible';
    await this.prisma.$transaction([
      this.prisma.profileGroup.update({
        where: { id: row.id },
        data: {
          memberAttempts: attempts,
          memberActionError: `${reason}${detail ? ` — ${detail}` : ''}`,
          memberActionAt: now,
          memberClaimedUntil: new Date(now.getTime() + RETRY_MINUTES[input.outcome] * 60_000),
        },
      }),
      this.log(
        row,
        'MEMBER_ACTION_FAILED',
        attempts >= MAX_ATTEMPTS ? 'ERROR' : 'WARN',
        `${input.kind === 'approve' ? 'Adhésion' : 'Pré-approbation'} de « ${row.profile.name} » dans « ${row.group.name} » : ${reason}` +
          (attempts >= MAX_ATTEMPTS ? ` (abandon après ${MAX_ATTEMPTS} essais)` : ''),
        moderator.name,
        { detail },
      ),
    ]);
    return { taskId, result: attempts >= MAX_ATTEMPTS ? 'gave_up' : 'retry_later' };
  }

  private log(
    row: { profileId: string; groupId: string },
    eventType: string,
    level: 'INFO' | 'WARN' | 'ERROR',
    message: string,
    by: string,
    extra: Record<string, unknown> = {},
  ) {
    return this.prisma.activityLog.create({
      data: { profileId: row.profileId, groupId: row.groupId, eventType, level, message, metadata: { by, ...extra } },
    });
  }

  /* ── Côté admin ─────────────────────────────────────────────────────── */

  async overview(acting: CurrentUser | null, now = new Date()) {
    const scope = scopeOf(acting);
    const ours = { profile: profileWhere(scope), group: groupWhere(scope) };
    const [due, preApproved, approved, unknownIdentity, problems] = await Promise.all([
      this.prisma.profileGroup.count({ where: this.dueWhere(acting, null, now) }),
      this.prisma.profileGroup.count({ where: { ...ours, preApprovedAt: { not: null } } }),
      this.prisma.profileGroup.count({ where: { ...ours, memberApprovedAt: { not: null } } }),
      this.prisma.profile.count({ where: { ...profileWhere(scope), status: 'ACTIVE', facebookUserId: null } }),
      this.prisma.profileGroup.findMany({
        where: { ...ours, memberActionError: { not: null }, status: 'ACTIVE' },
        orderBy: { memberActionAt: 'desc' },
        take: 30,
        select: {
          id: true,
          joinStatus: true,
          memberActionError: true,
          memberActionAt: true,
          memberAttempts: true,
          profile: { select: { id: true, name: true } },
          group: { select: { id: true, name: true, url: true } },
        },
      }),
    ]);
    return {
      due,
      preApproved,
      approved,
      unknownIdentity,
      problems: problems.map((p) => ({
        taskId: p.id,
        kind: PENDING_JOIN.includes(p.joinStatus) ? 'approve' : 'preapprove',
        error: p.memberActionError,
        at: p.memberActionAt,
        attempts: p.memberAttempts,
        gaveUp: p.memberAttempts >= MAX_ATTEMPTS,
        profile: p.profile,
        group: p.group,
      })),
    };
  }

  /** Relancer une tâche abandonnée (après avoir rendu le vérificateur
   * modérateur du groupe, par exemple). */
  async retry(taskId: string, acting: CurrentUser | null) {
    const row = await this.prisma.profileGroup.findFirst({
      where: { id: taskId, profile: profileWhere(scopeOf(acting)) },
      select: { id: true },
    });
    if (!row) throw new NotFoundException('Tâche introuvable');
    await this.prisma.profileGroup.update({
      where: { id: row.id },
      data: { memberAttempts: 0, memberClaimedUntil: null, memberActionError: null },
    });
    return { taskId, result: 'queued' };
  }
}
