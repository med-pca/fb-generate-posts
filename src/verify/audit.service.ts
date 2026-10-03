import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { JoinStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { CurrentUser } from '../auth/current-user';
import { groupWhere, profileWhere, scopeOf } from '../auth/scope';
import { VerifyService } from './verify.service';

/** Contrôler la pré-approbation de NOS profils dans les groupes, sur
 * Facebook même : est-ce déjà fait, ou pas ?
 *
 *   - `check` : le modérateur ouvre la page du membre, lit le menu de
 *               gestion, et ne clique RIEN ;
 *   - `fix`   : même chose, puis il pré-approuve ce qui manque.
 *
 * Chaque constat est enregistré sur la liaison profil × groupe et écrit au
 * journal (MEMBER_AUDIT_*), avec ce que l'extension a vu. */
export const AUDIT_OUTCOMES = ['already', 'not_done', 'fixed', 'no_permission', 'not_found', 'unreachable'] as const;
export type AuditOutcome = (typeof AUDIT_OUTCOMES)[number];

const STATE: Record<Exclude<AuditOutcome, 'unreachable'>, string> = {
  already: 'PREAPPROVED',
  fixed: 'PREAPPROVED',
  not_done: 'NOT_PREAPPROVED',
  no_permission: 'NO_PERMISSION',
  not_found: 'NOT_FOUND',
};
const CLAIM_MINUTES = 20;
const RETRY_MINUTES = 30;

@Injectable()
export class AuditService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly verify: VerifyService,
  ) {}

  /** Nos liaisons contrôlables : profil actif à nous, compte Facebook connu,
   * pas modérateur ; groupe actif ; profil membre du groupe. */
  private eligible(acting: CurrentUser | null): Prisma.ProfileGroupWhereInput {
    const scope = scopeOf(acting);
    return {
      status: 'ACTIVE',
      joinStatus: JoinStatus.JOINED,
      profile: { status: 'ACTIVE', isModerator: false, facebookUserId: { not: null }, ...profileWhere(scope) },
      group: { status: 'ACTIVE', ...groupWhere(scope) },
    };
  }

  /** Demander un contrôle : sur des liaisons précises (un test sur un seul
   * groupe), ou sur toutes. Les modérateurs actifs sont réveillés. */
  async request(
    input: { mode: 'check' | 'fix'; profileGroupIds?: string[]; profileId?: string },
    acting: CurrentUser | null,
    now = new Date(),
  ) {
    const where: Prisma.ProfileGroupWhereInput = {
      ...this.eligible(acting),
      ...(input.profileGroupIds?.length ? { id: { in: input.profileGroupIds } } : {}),
      ...(input.profileId ? { profileId: input.profileId } : {}),
    };
    const { count } = await this.prisma.profileGroup.updateMany({
      where,
      data: { auditRequestedAt: now, auditMode: input.mode, auditClaimedUntil: null },
    });
    const woken = await this.prisma.profile.updateMany({
      where: { isModerator: true, status: 'ACTIVE', moderatorPaused: false },
      data: { moderatorRunAt: now },
    });
    await this.prisma.activityLog.create({
      data: {
        eventType: 'MEMBER_AUDIT_REQUESTED',
        message:
          `Contrôle de la pré-approbation demandé (${input.mode === 'check' ? 'sans rien modifier' : 'puis pré-approuver ce qui manque'}) : ${count} liaison(s)` +
          (woken.count ? `, ${woken.count} modérateur(s) réveillé(s)` : ' — aucun modérateur actif pour le faire'),
        metadata: { mode: input.mode, count, by: acting?.username ?? 'clé globale', ids: input.profileGroupIds ?? null } as Prisma.InputJsonValue,
      },
    });
    return { requested: count, moderators: woken.count };
  }

  /** Les contrôles à faire, pour ce modérateur. */
  async claim(profileExternalId: string, limit: number, acting: CurrentUser | null, now = new Date()) {
    const moderator = await this.verify.moderator(profileExternalId, acting);
    if (moderator.moderatorPaused) return { tasks: [] };
    const due = await this.prisma.profileGroup.findMany({
      where: {
        ...this.eligible(acting),
        auditRequestedAt: { not: null },
        OR: [{ auditClaimedUntil: null }, { auditClaimedUntil: { lt: now } }],
        profileId: { not: moderator.id },
      },
      orderBy: { auditRequestedAt: 'asc' },
      take: Math.max(1, Math.min(20, limit || 5)),
      select: {
        id: true,
        auditMode: true,
        profile: { select: { name: true, facebookUserId: true, facebookName: true } },
        group: { select: { name: true, url: true } },
      },
    });
    if (due.length) {
      await this.prisma.profileGroup.updateMany({
        where: { id: { in: due.map((d) => d.id) } },
        data: { auditClaimedUntil: new Date(now.getTime() + CLAIM_MINUTES * 60_000) },
      });
    }
    return {
      tasks: due.map((d) => ({
        taskId: d.id,
        mode: d.auditMode === 'fix' ? 'fix' : 'check',
        member: { facebookUserId: d.profile.facebookUserId as string, name: d.profile.facebookName || d.profile.name },
        group: d.group,
      })),
    };
  }

  /** Le constat du modérateur. */
  async report(
    taskId: string,
    input: { profileExternalId: string; outcome: AuditOutcome; facebookUserId: string; detail?: string },
    acting: CurrentUser | null,
    now = new Date(),
  ) {
    const moderator = await this.verify.moderator(input.profileExternalId, acting);
    const row = await this.prisma.profileGroup.findFirst({
      where: { id: taskId, profile: profileWhere(scopeOf(acting)) },
      select: {
        id: true,
        profileId: true,
        groupId: true,
        preApprovedAt: true,
        auditMode: true,
        profile: { select: { name: true, facebookUserId: true } },
        group: { select: { name: true, url: true } },
      },
    });
    if (!row) throw new NotFoundException('Contrôle introuvable');
    const meta = { by: moderator.name, moderatorId: moderator.id, mode: row.auditMode };
    if (!row.profile.facebookUserId || row.profile.facebookUserId !== input.facebookUserId) {
      await this.prisma.activityLog.create({
        data: { profileId: row.profileId, groupId: row.groupId, eventType: 'MEMBER_MISMATCH', level: 'ERROR', message: `Contrôle refusé : l’identifiant ${input.facebookUserId} n’est pas celui de « ${row.profile.name} »`, metadata: meta },
      });
      throw new ForbiddenException('Cet identifiant Facebook n’est pas celui de ce profil');
    }
    const detail = (input.detail || '').slice(0, 1000);
    const who = `« ${row.profile.name} » dans « ${row.group.name} »`;

    if (input.outcome === 'unreachable') {
      await this.prisma.$transaction([
        this.prisma.profileGroup.update({
          where: { id: row.id },
          data: { auditClaimedUntil: new Date(now.getTime() + RETRY_MINUTES * 60_000), preApprovalDetail: detail || 'page illisible' },
        }),
        this.prisma.activityLog.create({
          data: { profileId: row.profileId, groupId: row.groupId, eventType: 'MEMBER_AUDIT_UNREACHABLE', level: 'WARN', message: `Contrôle de ${who} : page illisible, nouvel essai dans ${RETRY_MINUTES} min${detail ? ` — ${detail}` : ''}`, metadata: meta },
        }),
      ]);
      return { taskId, state: null, result: 'retry_later' };
    }

    const state = STATE[input.outcome];
    const preApproved = state === 'PREAPPROVED';
    const MESSAGES: Record<string, { event: string; level: 'INFO' | 'WARN' | 'ERROR'; text: string }> = {
      already: { event: 'MEMBER_AUDIT_ALREADY', level: 'INFO', text: 'déjà pré-approuvé ✓' },
      fixed: { event: 'MEMBER_AUDIT_FIXED', level: 'INFO', text: 'n’était pas pré-approuvé → pré-approuvé maintenant ✓' },
      not_done: { event: 'MEMBER_AUDIT_NOT_DONE', level: 'WARN', text: 'PAS pré-approuvé (rien n’a été modifié)' },
      no_permission: { event: 'MEMBER_AUDIT_NO_PERMISSION', level: 'ERROR', text: 'impossible à contrôler : le modérateur n’a pas l’option (admin/modérateur du groupe ?)' },
      not_found: { event: 'MEMBER_AUDIT_NOT_FOUND', level: 'WARN', text: 'option de pré-approbation introuvable sur sa page' },
    };
    const msg = MESSAGES[input.outcome];
    // La plateforme s'aligne sur ce que Facebook montre : un « pas fait »
    // remet la pré-approbation en tâche, un « déjà fait » l'enregistre.
    const preApprovedAt = preApproved ? (row.preApprovedAt ?? now) : state === 'NOT_PREAPPROVED' ? null : row.preApprovedAt;
    await this.prisma.$transaction([
      this.prisma.profileGroup.update({
        where: { id: row.id },
        data: {
          preApprovalState: state,
          preApprovalCheckedAt: now,
          preApprovalDetail: detail || null,
          preApprovedAt,
          auditRequestedAt: null,
          auditClaimedUntil: null,
          ...(state === 'NOT_PREAPPROVED' ? { memberAttempts: 0, memberClaimedUntil: null, memberActionError: null } : {}),
        },
      }),
      this.prisma.activityLog.create({
        data: {
          profileId: row.profileId,
          groupId: row.groupId,
          eventType: msg.event,
          level: msg.level,
          message: `Contrôle de ${who} : ${msg.text}${detail ? ` — vu : ${detail}` : ''}`,
          metadata: { ...meta, state, groupUrl: row.group.url } as Prisma.InputJsonValue,
        },
      }),
    ]);
    return { taskId, state, result: 'recorded' };
  }

  /** Les résultats des contrôles, pour l'admin : chaque liaison avec son
   * état vu sur Facebook, et ce qui reste à contrôler. */
  async results(acting: CurrentUser | null, profileId?: string) {
    const rows = await this.prisma.profileGroup.findMany({
      where: {
        ...this.eligible(acting),
        ...(profileId ? { profileId } : {}),
        OR: [{ auditRequestedAt: { not: null } }, { preApprovalCheckedAt: { not: null } }],
      },
      orderBy: [{ preApprovalCheckedAt: 'desc' }],
      take: 500,
      select: {
        id: true,
        auditRequestedAt: true,
        auditMode: true,
        preApprovalState: true,
        preApprovalCheckedAt: true,
        preApprovalDetail: true,
        preApprovedAt: true,
        profile: { select: { id: true, name: true } },
        group: { select: { id: true, name: true, url: true } },
      },
    });
    const pending = rows.filter((r) => r.auditRequestedAt);
    const done = rows.filter((r) => !r.auditRequestedAt);
    const count = (state: string) => done.filter((r) => r.preApprovalState === state).length;
    return {
      summary: {
        pending: pending.length,
        preApproved: count('PREAPPROVED'),
        notPreApproved: count('NOT_PREAPPROVED'),
        noPermission: count('NO_PERMISSION'),
        notFound: count('NOT_FOUND'),
      },
      rows: rows.map((r) => ({
        taskId: r.id,
        profile: r.profile,
        group: r.group,
        pending: Boolean(r.auditRequestedAt),
        mode: r.auditMode,
        state: r.preApprovalState,
        checkedAt: r.preApprovalCheckedAt,
        detail: r.preApprovalDetail,
      })),
    };
  }
}
