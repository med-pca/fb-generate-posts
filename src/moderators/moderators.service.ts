import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, VerifyStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { CurrentUser } from '../auth/current-user';
import { profileWhere, scopeOf } from '../auth/scope';
import { VerifyService } from '../verify/verify.service';
import { MembersService } from '../verify/members.service';

const DAY = 86_400_000;
/** En ligne : son extension a relu ses réglages il y a moins de 3 minutes. */
const ONLINE_SECONDS = 180;

const VERIFY_KINDS = ['VERIFIED_OK', 'VERIFY_MISSING_POST', 'VERIFY_MISSING_LINK', 'VERIFY_PENDING', 'VERIFY_UNREACHABLE', 'DELETED', 'DELETE_FAILED', 'URL_FOUND'] as const;
const MEMBER_EVENTS = ['MEMBER_APPROVED', 'MEMBER_PREAPPROVED', 'MEMBER_ACTION_FAILED', 'MEMBER_MISMATCH'] as const;

type Counts = Record<string, number>;
const empty = (): Counts => ({
  verified: 0,
  ok: 0,
  missingPost: 0,
  missingLink: 0,
  pending: 0,
  unreachable: 0,
  deleted: 0,
  deleteFailed: 0,
  urlFound: 0,
  approved: 0,
  preApproved: 0,
  memberFailed: 0,
});

/** La rubrique Modérateurs : ce qu'ils ont fait, leurs réglages, et ce
 * qu'un administrateur peut leur demander. */
@Injectable()
export class ModeratorsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly verify: VerifyService,
    private readonly members: MembersService,
  ) {}

  private settingsOf(p: {
    moderatorPaused: boolean;
    moderatorRunAt: Date | null;
    moderatorMembersRunAt: Date | null;
    moderatorBatch: number;
    moderatorEveryMinutes: number;
    moderatorMembers: boolean;
    moderatorSeenAt: Date | null;
    moderatorAgent: string | null;
    moderatorWindowStart: number;
    moderatorWindowEnd: number;
    moderatorTimezone: string;
    moderatorHourlyLimit: number;
    moderatorDailyLimit: number;
  }, now: Date) {
    return {
      paused: p.moderatorPaused,
      // Deux déclencheurs : la vérification des posts, et les tâches « nos
      // profils » (adhésions, pré-approbations, contrôles).
      runRequestedAt: p.moderatorRunAt,
      membersRunRequestedAt: p.moderatorMembersRunAt,
      batchSize: p.moderatorBatch,
      everyMinutes: p.moderatorEveryMinutes,
      members: p.moderatorMembers,
      // Le rythme humain : heures de travail (minutes depuis minuit, dans
      // son fuseau) et plafonds d'actions.
      windowStart: p.moderatorWindowStart,
      windowEnd: p.moderatorWindowEnd,
      timezone: p.moderatorTimezone,
      hourlyLimit: p.moderatorHourlyLimit,
      dailyLimit: p.moderatorDailyLimit,
      seenAt: p.moderatorSeenAt,
      agent: p.moderatorAgent,
      online: Boolean(p.moderatorSeenAt && now.getTime() - p.moderatorSeenAt.getTime() < ONLINE_SECONDS * 1000),
    };
  }

  /** Ce que chaque modérateur a fait depuis `since`. */
  private async counts(ids: string[], since: Date) {
    const out = new Map<string, Counts>(ids.map((id) => [id, empty()]));
    if (!ids.length) return out;
    const list = Prisma.join(ids);
    const [traces, members] = await Promise.all([
      this.prisma.$queryRaw<Array<{ profile_id: string; kind: string; n: bigint }>>(Prisma.sql`
        SELECT profile_id, kind, COUNT(*) AS n FROM publication_traces
        WHERE profile_id IN (${list}) AND created_at >= ${since}
          AND kind IN (${Prisma.join([...VERIFY_KINDS])})
        GROUP BY profile_id, kind`),
      this.prisma.$queryRaw<Array<{ moderator_id: string; event_type: string; n: bigint }>>(Prisma.sql`
        SELECT metadata->>'moderatorId' AS moderator_id, event_type, COUNT(*) AS n FROM activity_logs
        WHERE event_type IN (${Prisma.join([...MEMBER_EVENTS])}) AND created_at >= ${since}
          AND metadata->>'moderatorId' IN (${list})
        GROUP BY 1, 2`),
    ]);
    const KEY: Record<string, string> = {
      VERIFIED_OK: 'ok',
      VERIFY_MISSING_POST: 'missingPost',
      VERIFY_MISSING_LINK: 'missingLink',
      VERIFY_PENDING: 'pending',
      VERIFY_UNREACHABLE: 'unreachable',
      DELETED: 'deleted',
      DELETE_FAILED: 'deleteFailed',
      URL_FOUND: 'urlFound',
      MEMBER_APPROVED: 'approved',
      MEMBER_PREAPPROVED: 'preApproved',
      MEMBER_ACTION_FAILED: 'memberFailed',
      MEMBER_MISMATCH: 'memberFailed',
    };
    for (const t of traces) {
      const c = out.get(t.profile_id)!;
      c[KEY[t.kind]] += Number(t.n);
      if (['VERIFIED_OK', 'VERIFY_MISSING_POST', 'VERIFY_MISSING_LINK', 'VERIFY_PENDING', 'VERIFY_UNREACHABLE'].includes(t.kind)) {
        c.verified += Number(t.n);
      }
    }
    for (const m of members) {
      const c = out.get(m.moderator_id);
      if (c) c[KEY[m.event_type]] += Number(m.n);
    }
    return out;
  }

  private moderatorsWhere(acting: CurrentUser | null): Prisma.ProfileWhereInput {
    return { isModerator: true, ...profileWhere(scopeOf(acting)) };
  }

  async list(acting: CurrentUser | null, now = new Date()) {
    const moderators = await this.prisma.profile.findMany({
      where: this.moderatorsWhere(acting),
      orderBy: { name: 'asc' },
    });
    const ids = moderators.map((m) => m.id);
    const dayStart = new Date(now.getTime() - DAY);
    const [today, week] = await Promise.all([
      this.counts(ids, dayStart),
      this.counts(ids, new Date(now.getTime() - 7 * DAY)),
    ]);
    const [verifyStats, membersOverview] = await Promise.all([this.verify.stats(acting, now), this.members.overview(acting, now)]);
    return {
      due: { verifications: verifyStats.due, needsAction: verifyStats.needsAction, members: membersOverview.due },
      moderators: moderators.map((m) => ({
        id: m.id,
        name: m.name,
        status: m.status,
        externalId: m.externalId,
        facebookUserId: m.facebookUserId,
        settings: this.settingsOf(m, now),
        today: today.get(m.id),
        week: week.get(m.id),
      })),
    };
  }

  private async reachable(id: string, acting: CurrentUser | null) {
    const m = await this.prisma.profile.findFirst({ where: { id, ...this.moderatorsWhere(acting) } });
    if (!m) throw new NotFoundException('Modérateur introuvable');
    return m;
  }

  /** Tout sur un modérateur : chiffres, 14 jours, dernières actions. */
  async detail(id: string, acting: CurrentUser | null, now = new Date()) {
    const m = await this.reachable(id, acting);
    const settings = await this.prisma.automationSetting.findUnique({ where: { id: 'global' } });
    const tz = settings?.objectiveTimezone || 'Europe/Paris';
    const since14 = new Date(now.getTime() - 14 * DAY);
    const [today, week, month, total, daily, memberDaily, recent] = await Promise.all([
      this.counts([id], new Date(now.getTime() - DAY)),
      this.counts([id], new Date(now.getTime() - 7 * DAY)),
      this.counts([id], new Date(now.getTime() - 30 * DAY)),
      this.counts([id], new Date(0)),
      this.prisma.$queryRaw<Array<{ day: string; ok: bigint; problems: bigint }>>(Prisma.sql`
        SELECT to_char(created_at AT TIME ZONE ${tz}, 'YYYY-MM-DD') AS day,
          COUNT(*) FILTER (WHERE kind = 'VERIFIED_OK') AS ok,
          COUNT(*) FILTER (WHERE kind IN ('VERIFY_MISSING_POST', 'VERIFY_MISSING_LINK')) AS problems
        FROM publication_traces
        WHERE profile_id = ${id} AND created_at >= ${since14}
        GROUP BY 1 ORDER BY 1`),
      this.prisma.$queryRaw<Array<{ day: string; n: bigint }>>(Prisma.sql`
        SELECT to_char(created_at AT TIME ZONE ${tz}, 'YYYY-MM-DD') AS day, COUNT(*) AS n
        FROM activity_logs
        WHERE event_type IN ('MEMBER_APPROVED', 'MEMBER_PREAPPROVED') AND metadata->>'moderatorId' = ${id} AND created_at >= ${since14}
        GROUP BY 1`),
      this.prisma.activityLog.findMany({
        where: {
          createdAt: { gte: new Date(now.getTime() - 30 * DAY) },
          OR: [
            { profileId: id, eventType: { startsWith: 'VERIFY_' } },
            { eventType: { startsWith: 'MEMBER_' }, metadata: { path: ['moderatorId'], equals: id } },
          ],
        },
        orderBy: { createdAt: 'desc' },
        take: 40,
        include: {
          group: { select: { id: true, name: true } },
          post: { select: { id: true, title: true } },
          profile: { select: { id: true, name: true } },
        },
      }),
    ]);
    const byDay = new Map(daily.map((d) => [d.day, d]));
    const memberBy = new Map(memberDaily.map((d) => [d.day, Number(d.n)]));
    const days = Array.from({ length: 14 }, (_, i) => {
      const key = new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date(now.getTime() - (13 - i) * DAY));
      const row = byDay.get(key);
      return { day: key, ok: Number(row?.ok ?? 0), problems: Number(row?.problems ?? 0), members: memberBy.get(key) ?? 0 };
    });
    const [verifyStats, membersOverview] = await Promise.all([this.verify.stats(acting, now), this.members.overview(acting, now)]);
    return {
      moderator: {
        id: m.id,
        name: m.name,
        status: m.status,
        externalId: m.externalId,
        facebookUserId: m.facebookUserId,
        settings: this.settingsOf(m, now),
      },
      counts: { today: today.get(id), week: week.get(id), month: month.get(id), total: total.get(id) },
      days,
      due: { verifications: verifyStats.due, needsAction: verifyStats.needsAction, members: membersOverview.due, memberProblems: membersOverview.problems.length },
      recent: recent.map((r) => ({
        at: r.createdAt,
        level: r.level,
        eventType: r.eventType,
        message: r.message,
        facebookUrl: r.facebookUrl,
        postTargetId: r.postTargetId,
        group: r.group,
        post: r.post,
        member: r.eventType.startsWith('MEMBER_') ? r.profile : null,
      })),
    };
  }

  /* ── Ce que l'administrateur règle ou demande ─────────────────────── */

  async updateSettings(
    id: string,
    patch: {
      paused?: boolean;
      batchSize?: number;
      everyMinutes?: number;
      members?: boolean;
      windowStart?: number;
      windowEnd?: number;
      timezone?: string;
      hourlyLimit?: number;
      dailyLimit?: number;
    },
    acting: CurrentUser,
  ) {
    const m = await this.reachable(id, acting);
    const data: Prisma.ProfileUpdateInput = {};
    if (patch.paused !== undefined) data.moderatorPaused = patch.paused;
    if (patch.batchSize !== undefined) data.moderatorBatch = patch.batchSize;
    if (patch.everyMinutes !== undefined) data.moderatorEveryMinutes = patch.everyMinutes;
    if (patch.members !== undefined) data.moderatorMembers = patch.members;
    if (patch.windowStart !== undefined) data.moderatorWindowStart = patch.windowStart;
    if (patch.windowEnd !== undefined) data.moderatorWindowEnd = patch.windowEnd;
    if (patch.hourlyLimit !== undefined) data.moderatorHourlyLimit = patch.hourlyLimit;
    if (patch.dailyLimit !== undefined) data.moderatorDailyLimit = patch.dailyLimit;
    if (patch.timezone !== undefined) {
      try {
        new Intl.DateTimeFormat('fr-FR', { timeZone: patch.timezone });
      } catch {
        throw new BadRequestException(`Fuseau horaire inconnu : ${patch.timezone}`);
      }
      data.moderatorTimezone = patch.timezone;
    }
    const updated = await this.prisma.profile.update({ where: { id }, data });
    await this.log(m, 'MODERATOR_SETTINGS', `Réglages du modérateur « ${m.name} » modifiés`, acting, patch);
    return this.settingsOf(updated, new Date());
  }

  /** Lancer un passage : `posts` (vérifier les publications) ou `members`
   * (adhésions, pré-approbations, contrôles). L'extension le voit à sa
   * prochaine relecture. */
  async run(id: string, acting: CurrentUser, kind: 'posts' | 'members' = 'posts', now = new Date()) {
    const m = await this.reachable(id, acting);
    if (m.moderatorPaused) throw new BadRequestException('Ce modérateur est suspendu : reprenez-le d’abord');
    if (kind === 'members' && !m.moderatorMembers) {
      throw new BadRequestException('Les tâches « nos profils » sont désactivées dans ses réglages');
    }
    await this.prisma.profile.update({
      where: { id },
      data: kind === 'members' ? { moderatorMembersRunAt: now } : { moderatorRunAt: now },
    });
    await this.log(
      m,
      kind === 'members' ? 'MODERATOR_MEMBERS_RUN_REQUESTED' : 'MODERATOR_RUN_REQUESTED',
      kind === 'members'
        ? `Tâches « nos profils » (adhésions, pré-approbations) demandées à « ${m.name} »`
        : `Vérification des posts demandée à « ${m.name} »`,
      acting,
      { kind },
    );
    return { kind, requestedAt: now, online: this.settingsOf(m, now).online };
  }

  /** Les publications « à traiter » repartent en vérification. */
  async recheck(id: string, acting: CurrentUser) {
    const m = await this.reachable(id, acting);
    const { count } = await this.prisma.postTarget.updateMany({
      where: { verifyStatus: VerifyStatus.NEEDS_ACTION },
      data: { verifyStatus: null, verifyAttempts: 0, verifyClaimedUntil: null },
    });
    await this.log(m, 'MODERATOR_RECHECK', `${count} publication(s) « à traiter » remise(s) en vérification`, acting, { count });
    return { requeued: count };
  }

  /** Les adhésions / pré-approbations abandonnées repartent. */
  async retryMembers(id: string, acting: CurrentUser) {
    const m = await this.reachable(id, acting);
    const { count } = await this.prisma.profileGroup.updateMany({
      where: { memberActionError: { not: null } },
      data: { memberAttempts: 0, memberClaimedUntil: null, memberActionError: null },
    });
    await this.log(m, 'MODERATOR_RETRY_MEMBERS', `${count} adhésion(s) / pré-approbation(s) relancée(s)`, acting, { count });
    return { requeued: count };
  }

  /** Ce que l'extension relit chaque minute : ses réglages, et si un passage
   * a été demandé. Note aussi qu'elle est en ligne. */
  async control(profileExternalId: string, agent: string | undefined, acting: CurrentUser | null, now = new Date()) {
    const m = await this.verify.moderator(profileExternalId, acting);
    const updated = await this.prisma.profile.update({
      where: { id: m.id },
      data: { moderatorSeenAt: now, ...(agent ? { moderatorAgent: agent.slice(0, 200) } : {}) },
    });
    return this.settingsOf(updated, now);
  }

  private log(m: { id: string; name: string }, eventType: string, message: string, acting: CurrentUser | null, extra: Record<string, unknown> = {}) {
    return this.prisma.activityLog.create({
      data: {
        profileId: m.id,
        eventType,
        message,
        metadata: { ...extra, moderatorId: m.id, by: acting?.username ?? 'clé globale' } as Prisma.InputJsonValue,
      },
    });
  }
}
