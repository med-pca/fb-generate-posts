import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { JoinStatus, Prisma, TargetStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { CurrentUser } from '../auth/current-user';
import { groupWhere, postWhere, profileWhere, scopeOf } from '../auth/scope';
import { VerifyService } from './verify.service';

/** Deux missions de plus pour le modérateur (administrateur de nos groupes),
 * toujours sur NOS profils et NOS posts seulement :
 *
 *   - `removal`  : retirer de nos groupes un profil suspendu par Facebook
 *                  (« Nous avons suspendu votre compte »), sur demande d'un
 *                  administrateur. Jamais un profil en « limite de
 *                  publication », ni une simple vérification demandée.
 *   - `approval` : valider nos posts « en attente de validation » ; l'extension
 *                  Publication les voit ensuite et finit le travail. */
export const GROUP_TASK_OUTCOMES = ['done', 'already', 'not_found', 'no_permission', 'unreachable'] as const;
export type GroupTaskOutcome = (typeof GROUP_TASK_OUTCOMES)[number];

const CLAIM_MINUTES = 30;
const MAX_REMOVAL_ATTEMPTS = 6;
const MAX_APPROVAL_ATTEMPTS = 4;
const RETRY_MINUTES: Record<Exclude<GroupTaskOutcome, 'done' | 'already'>, number> = {
  not_found: 3 * 60,
  no_permission: 24 * 60,
  unreachable: 30,
};

@Injectable()
export class GroupTasksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly verify: VerifyService,
  ) {}

  /* ── Retirer un profil suspendu de nos groupes ─────────────────────── */

  async claimRemovals(profileExternalId: string, limit: number, acting: CurrentUser | null, now = new Date()) {
    const moderator = await this.verify.moderator(profileExternalId, acting);
    if (moderator.moderatorPaused) return { tasks: [] };
    const scope = scopeOf(acting);
    const due = await this.prisma.profileGroup.findMany({
      where: {
        removalRequestedAt: { not: null },
        removedAt: null,
        removalAttempts: { lt: MAX_REMOVAL_ATTEMPTS },
        OR: [{ removalClaimedUntil: null }, { removalClaimedUntil: { lt: now } }],
        profile: { facebookSuspension: 'disabled', facebookUserId: { not: null }, isModerator: false, id: { not: moderator.id }, ...profileWhere(scope) },
        group: { status: 'ACTIVE', ...groupWhere(scope) },
      },
      orderBy: { removalRequestedAt: 'asc' },
      take: Math.max(1, Math.min(5, limit || 2)),
      select: {
        id: true,
        profile: { select: { name: true, facebookUserId: true, facebookName: true } },
        group: { select: { name: true, url: true } },
      },
    });
    if (due.length) {
      await this.prisma.profileGroup.updateMany({
        where: { id: { in: due.map((d) => d.id) } },
        data: { removalClaimedUntil: new Date(now.getTime() + CLAIM_MINUTES * 60_000) },
      });
    }
    return {
      tasks: due.map((d) => ({
        taskId: d.id,
        kind: 'remove' as const,
        member: { facebookUserId: d.profile.facebookUserId as string, name: d.profile.facebookName || d.profile.name },
        group: d.group,
      })),
    };
  }

  async reportRemoval(
    taskId: string,
    input: { profileExternalId: string; outcome: GroupTaskOutcome; facebookUserId: string; detail?: string },
    acting: CurrentUser | null,
    now = new Date(),
  ) {
    const moderator = await this.verify.moderator(input.profileExternalId, acting);
    const link = await this.prisma.profileGroup.findFirst({
      where: { id: taskId, profile: profileWhere(scopeOf(acting)) },
      select: { id: true, profileId: true, groupId: true, removalAttempts: true, profile: { select: { name: true, facebookUserId: true, facebookSuspension: true } }, group: { select: { name: true } } },
    });
    if (!link) throw new NotFoundException('Tâche introuvable');
    // La sécurité : le rapport doit porter EXACTEMENT l'identifiant reçu.
    if (link.profile.facebookUserId !== input.facebookUserId) throw new BadRequestException('Identifiant Facebook différent de la tâche');
    if (link.profile.facebookSuspension !== 'disabled') throw new BadRequestException('Ce profil n’est plus suspendu : rien n’est retiré');
    const detail = String(input.detail || '').slice(0, 500);
    if (input.outcome === 'done' || input.outcome === 'already' || input.outcome === 'not_found') {
      // Retiré (ou n'y était plus) : sur Facebook ET dans la plateforme.
      await this.prisma.profileGroup.update({
        where: { id: link.id },
        data: { removedAt: now, removalClaimedUntil: null, removalError: null, status: 'INACTIVE', joinStatus: JoinStatus.NOT_JOINED },
      });
      await this.log('PROFILE_REMOVED_FROM_GROUP', `« ${link.profile.name} » (suspendu par Facebook) retiré du groupe « ${link.group.name} » par ${moderator.name}`, link, { outcome: input.outcome, detail });
      return { taskId, result: 'removed' };
    }
    const retry = new Date(now.getTime() + RETRY_MINUTES[input.outcome] * 60_000);
    await this.prisma.profileGroup.update({
      where: { id: link.id },
      data: { removalAttempts: { increment: 1 }, removalClaimedUntil: retry, removalError: `${input.outcome} : ${detail}` },
    });
    await this.log('PROFILE_REMOVAL_FAILED', `Retrait de « ${link.profile.name} » du groupe « ${link.group.name} » : ${input.outcome}${detail ? ` — ${detail}` : ''}`, link, { outcome: input.outcome, detail }, 'WARN');
    return { taskId, result: 'retry_later' };
  }

  /* ── Valider nos posts en attente ──────────────────────────────────── */

  async claimApprovals(profileExternalId: string, limit: number, acting: CurrentUser | null, now = new Date()) {
    const moderator = await this.verify.moderator(profileExternalId, acting);
    if (moderator.moderatorPaused) return { tasks: [] };
    const scope = scopeOf(acting);
    const due = await this.prisma.postTarget.findMany({
      where: {
        status: TargetStatus.PUBLISHED,
        approvalPendingSince: { not: null },
        approvalModAttempts: { lt: MAX_APPROVAL_ATTEMPTS },
        OR: [{ approvalModClaimedUntil: null }, { approvalModClaimedUntil: { lt: now } }],
        post: postWhere(scope),
        group: { status: 'ACTIVE', ...groupWhere(scope) },
      },
      orderBy: { approvalPendingSince: 'asc' },
      take: Math.max(1, Math.min(5, limit || 2)),
      select: {
        id: true,
        post: { select: { description: true } },
        group: { select: { name: true, url: true, externalId: true } },
        jobItems: { take: 1, orderBy: { createdAt: 'desc' }, select: { job: { select: { profile: { select: { name: true, facebookName: true, facebookUserId: true } } } } } },
      },
    });
    if (due.length) {
      await this.prisma.postTarget.updateMany({
        where: { id: { in: due.map((d) => d.id) } },
        data: { approvalModClaimedUntil: new Date(now.getTime() + CLAIM_MINUTES * 60_000) },
      });
    }
    return {
      tasks: due.map((d) => {
        const author = d.jobItems[0]?.job.profile;
        return {
          taskId: d.id,
          kind: 'approve_post' as const,
          content: d.post.description,
          author: author ? { name: author.facebookName || author.name, facebookUserId: author.facebookUserId } : null,
          group: d.group,
        };
      }),
    };
  }

  async reportApproval(
    taskId: string,
    input: { profileExternalId: string; outcome: GroupTaskOutcome; detail?: string },
    acting: CurrentUser | null,
    now = new Date(),
  ) {
    const moderator = await this.verify.moderator(input.profileExternalId, acting);
    const target = await this.prisma.postTarget.findFirst({
      where: { id: taskId, post: postWhere(scopeOf(acting)) },
      select: { id: true, postId: true, groupId: true, approvalPendingSince: true, group: { select: { name: true } } },
    });
    if (!target) throw new NotFoundException('Tâche introuvable');
    const detail = String(input.detail || '').slice(0, 500);
    if (input.outcome === 'done' || input.outcome === 'already') {
      // Le profil qui l'a publié le reverra visible après son lot suivant
      // (sans attendre les 10 minutes) et finira le travail.
      await this.prisma.postTarget.update({ where: { id: target.id }, data: { approvalCheckedAt: null, approvalModClaimedUntil: null } });
      await this.prisma.activityLog.create({
        data: { postId: target.postId, postTargetId: target.id, groupId: target.groupId, eventType: 'POST_APPROVED_BY_MODERATOR', message: `Post validé par le modérateur ${moderator.name} dans « ${target.group.name} »`, metadata: { outcome: input.outcome, detail } },
      });
      return { taskId, result: 'approved' };
    }
    await this.prisma.postTarget.update({
      where: { id: target.id },
      data: { approvalModAttempts: { increment: 1 }, approvalModClaimedUntil: new Date(now.getTime() + RETRY_MINUTES[input.outcome] * 60_000) },
    });
    await this.prisma.activityLog.create({
      data: { postId: target.postId, postTargetId: target.id, groupId: target.groupId, level: 'WARN', eventType: 'POST_APPROVAL_BY_MODERATOR_FAILED', message: `Validation par ${moderator.name} dans « ${target.group.name} » : ${input.outcome}${detail ? ` — ${detail}` : ''}`, metadata: { outcome: input.outcome, detail } },
    });
    return { taskId, result: 'retry_later' };
  }

  /** Nos profils suspendus par Facebook (ou en vérification), et où en est
   * leur retrait de nos groupes. */
  async suspendedOverview(acting: CurrentUser | null) {
    const scope = scopeOf(acting);
    const profiles = await this.prisma.profile.findMany({
      where: { facebookSuspension: { not: null }, ...profileWhere(scope) },
      select: {
        id: true,
        name: true,
        facebookUserId: true,
        facebookSuspension: true,
        suspendedAt: true,
        suspensionDetail: true,
        profileGroups: {
          where: { group: groupWhere(scope) },
          select: { status: true, removalRequestedAt: true, removedAt: true, removalError: true, removalAttempts: true },
        },
      },
      orderBy: { suspendedAt: 'desc' },
    });
    return profiles.map((p) => {
      const links = p.profileGroups;
      return {
        id: p.id,
        name: p.name,
        facebookUserId: p.facebookUserId,
        kind: p.facebookSuspension,
        suspendedAt: p.suspendedAt,
        detail: p.suspensionDetail,
        groups: links.filter((l) => l.status === 'ACTIVE' && !l.removedAt).length,
        requested: links.filter((l) => l.removalRequestedAt && !l.removedAt).length,
        removed: links.filter((l) => l.removedAt).length,
        failing: links.filter((l) => l.removalRequestedAt && !l.removedAt && l.removalAttempts >= MAX_REMOVAL_ATTEMPTS).length,
        lastError: links.find((l) => l.removalError && !l.removedAt)?.removalError ?? null,
      };
    });
  }

  private log(eventType: string, message: string, link: { profileId: string; groupId: string }, metadata: Record<string, unknown>, level: 'INFO' | 'WARN' = 'INFO') {
    return this.prisma.activityLog.create({
      data: { profileId: link.profileId, groupId: link.groupId, eventType, level, message, metadata: metadata as Prisma.InputJsonValue },
    });
  }
}
