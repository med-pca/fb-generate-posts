import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { JobStatus, Prisma, TargetStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { CurrentUser } from '../auth/current-user';
import { profileWhere, scopeOf } from '../auth/scope';
import { JobsService } from '../jobs/jobs.service';
import { assertMayManage } from '../auth/moderator-guard';
import { HEALTH_LABELS, HEALTH_WINDOW_DAYS, healthOf, rankCandidates } from './profile-health';
import type { Health, HealthInput } from './profile-health';

const DAY = 86_400_000;
const EMPTY: HealthInput = {
  published: 0,
  failed: 0,
  verifiedOk: 0,
  verifiedBad: 0,
  withLink: 0,
  linkPlaced: 0,
  failStreak: 0,
  claimsLost: 0,
};

/** La santé des profils, leur détail, et ce qu'il advient de leurs posts
 * quand on les désactive. */
@Injectable()
export class ProfileHealthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jobs: JobsService,
  ) {}

  /** Les chiffres de santé de ces profils sur la période observée. */
  async inputs(ids: string[], now = new Date()): Promise<Map<string, HealthInput>> {
    const out = new Map<string, HealthInput>(ids.map((id) => [id, { ...EMPTY }]));
    if (!ids.length) return out;
    const since = new Date(now.getTime() - HEALTH_WINDOW_DAYS * DAY);
    const list = Prisma.join(ids);

    const [items, verified, recent, lost] = await Promise.all([
      this.prisma.$queryRaw<Array<{ profile_id: string; published: bigint; failed: bigint; with_link: bigint; link_placed: bigint }>>(Prisma.sql`
        SELECT j.profile_id,
          COUNT(*) FILTER (WHERE i.status = 'PUBLISHED'::"TargetStatus" AND i.published_at >= ${since}) AS published,
          COUNT(*) FILTER (WHERE i.status = 'FAILED'::"TargetStatus" AND i.updated_at >= ${since}) AS failed,
          COUNT(*) FILTER (WHERE i.status = 'PUBLISHED'::"TargetStatus" AND i.published_at >= ${since} AND p.url IS NOT NULL) AS with_link,
          COUNT(*) FILTER (WHERE i.status = 'PUBLISHED'::"TargetStatus" AND i.published_at >= ${since} AND p.url IS NOT NULL AND i.link_updated_at IS NOT NULL) AS link_placed
        FROM publication_job_items i
        JOIN publication_jobs j ON j.id = i.job_id
        JOIN posts p ON p.id = i.post_id
        WHERE j.profile_id IN (${list})
        GROUP BY j.profile_id`),
      // Un constat du vérificateur est imputé à celui qui avait publié : la
      // dernière publication de cette cible avant le constat.
      this.prisma.$queryRaw<Array<{ profile_id: string; ok: bigint; bad: bigint }>>(Prisma.sql`
        SELECT pub.profile_id,
          COUNT(*) FILTER (WHERE v.kind = 'VERIFIED_OK') AS ok,
          COUNT(*) FILTER (WHERE v.kind IN ('VERIFY_MISSING_POST', 'VERIFY_MISSING_LINK')) AS bad
        FROM publication_traces v
        JOIN LATERAL (
          SELECT p.profile_id FROM publication_traces p
          WHERE p.post_target_id = v.post_target_id
            AND p.kind IN ('PUBLISHED', 'URL_MISSING')
            AND p.created_at <= v.created_at
          ORDER BY p.created_at DESC LIMIT 1
        ) pub ON TRUE
        WHERE v.kind IN ('VERIFIED_OK', 'VERIFY_MISSING_POST', 'VERIFY_MISSING_LINK')
          AND v.created_at >= ${since}
          AND pub.profile_id IN (${list})
        GROUP BY pub.profile_id`),
      this.prisma.$queryRaw<Array<{ profile_id: string; status: string }>>(Prisma.sql`
        SELECT j.profile_id, i.status::text AS status
        FROM publication_job_items i
        JOIN publication_jobs j ON j.id = i.job_id
        WHERE j.profile_id IN (${list})
          AND i.status IN ('PUBLISHED'::"TargetStatus", 'FAILED'::"TargetStatus")
          AND i.updated_at >= ${since}
        ORDER BY i.updated_at DESC`),
      this.prisma.$queryRaw<Array<{ profile_id: string; lost: bigint }>>(Prisma.sql`
        SELECT j.profile_id, COUNT(*) AS lost
        FROM activity_logs l
        JOIN publication_jobs j ON j.id = l.job_id
        WHERE l.event_type = 'CLAIM_LOST' AND l.created_at >= ${since} AND j.profile_id IN (${list})
        GROUP BY j.profile_id`),
    ]);
    for (const r of items) {
      Object.assign(out.get(r.profile_id)!, {
        published: Number(r.published),
        failed: Number(r.failed),
        withLink: Number(r.with_link),
        linkPlaced: Number(r.link_placed),
      });
    }
    for (const r of verified) {
      const target = out.get(r.profile_id);
      if (target) Object.assign(target, { verifiedOk: Number(r.ok), verifiedBad: Number(r.bad) });
    }
    // Échecs d'affilée : depuis la plus récente, jusqu'à la première réussite.
    const streakDone = new Set<string>();
    for (const r of recent) {
      if (streakDone.has(r.profile_id)) continue;
      if (r.status === 'FAILED') out.get(r.profile_id)!.failStreak += 1;
      else streakDone.add(r.profile_id);
    }
    for (const r of lost) out.get(r.profile_id)!.claimsLost = Number(r.lost);
    return out;
  }

  /** La santé de tous les profils visibles. */
  async all(acting: CurrentUser | null, now = new Date()) {
    const profiles = await this.prisma.profile.findMany({
      where: profileWhere(scopeOf(acting)),
      select: { id: true },
    });
    const inputs = await this.inputs(profiles.map((p) => p.id), now);
    return new Map([...inputs].map(([id, input]) => [id, { ...healthOf(input), input }]));
  }

  private async reachable(id: string, acting: CurrentUser | null) {
    const profile = await this.prisma.profile.findFirst({
      where: { id, ...profileWhere(scopeOf(acting)) },
      select: {
        id: true,
        name: true,
        status: true,
        ownerId: true,
        externalId: true,
        facebookUserId: true,
        isModerator: true,
        runner: { select: { mode: true, running: true, lastSeenAt: true, browserState: true, message: true } },
      },
    });
    if (!profile) throw new NotFoundException('Profil introuvable');
    return profile;
  }

  /** Tout sur un profil : de quoi décider de le garder ou non. */
  async detail(id: string, acting: CurrentUser | null, now = new Date()) {
    const profile = await this.reachable(id, acting);
    const settings = await this.prisma.automationSetting.findUnique({ where: { id: 'global' } });
    const tz = settings?.objectiveTimezone || 'Europe/Paris';
    const [input] = [...(await this.inputs([id], now)).values()];
    const health = healthOf(input);
    const since30 = new Date(now.getTime() - 30 * DAY);
    const since7 = new Date(now.getTime() - 7 * DAY);
    const since14 = new Date(now.getTime() - HEALTH_WINDOW_DAYS * DAY);

    const [totals, daily, groups, errors, failures, joins, plan] = await Promise.all([
      this.prisma.$queryRaw<Array<Record<string, bigint | Date | null>>>(Prisma.sql`
        SELECT
          COUNT(*) FILTER (WHERE i.status = 'PUBLISHED'::"TargetStatus" AND (i.published_at AT TIME ZONE ${tz})::date = (${now}::timestamptz AT TIME ZONE ${tz})::date) AS today,
          COUNT(*) FILTER (WHERE i.status = 'PUBLISHED'::"TargetStatus" AND i.published_at >= ${since7}) AS week,
          COUNT(*) FILTER (WHERE i.status = 'PUBLISHED'::"TargetStatus" AND i.published_at >= ${since30}) AS month,
          COUNT(*) FILTER (WHERE i.status = 'PUBLISHED'::"TargetStatus") AS total,
          COUNT(*) FILTER (WHERE i.status = 'FAILED'::"TargetStatus" AND i.updated_at >= ${since7}) AS failed_week,
          COUNT(*) FILTER (WHERE i.status = 'FAILED'::"TargetStatus" AND i.updated_at >= ${since30}) AS failed_month,
          COUNT(*) FILTER (WHERE i.status = 'FAILED'::"TargetStatus") AS failed_total,
          MAX(i.published_at) AS last_published,
          MAX(i.updated_at) FILTER (WHERE i.status = 'FAILED'::"TargetStatus") AS last_failed
        FROM publication_job_items i JOIN publication_jobs j ON j.id = i.job_id
        WHERE j.profile_id = ${id}`),
      this.prisma.$queryRaw<Array<{ day: string; published: bigint; failed: bigint }>>(Prisma.sql`
        SELECT to_char((CASE WHEN i.status = 'PUBLISHED'::"TargetStatus" THEN i.published_at ELSE i.updated_at END) AT TIME ZONE ${tz}, 'YYYY-MM-DD') AS day,
          COUNT(*) FILTER (WHERE i.status = 'PUBLISHED'::"TargetStatus") AS published,
          COUNT(*) FILTER (WHERE i.status = 'FAILED'::"TargetStatus") AS failed
        FROM publication_job_items i JOIN publication_jobs j ON j.id = i.job_id
        WHERE j.profile_id = ${id}
          AND i.status IN ('PUBLISHED'::"TargetStatus", 'FAILED'::"TargetStatus")
          AND COALESCE(i.published_at, i.updated_at) >= ${since14}
        GROUP BY 1 ORDER BY 1`),
      this.prisma.$queryRaw<Array<{ id: string; name: string; published: bigint; failed: bigint; last_error: string | null }>>(Prisma.sql`
        SELECT g.id, g.name,
          COUNT(*) FILTER (WHERE i.status = 'PUBLISHED'::"TargetStatus") AS published,
          COUNT(*) FILTER (WHERE i.status = 'FAILED'::"TargetStatus") AS failed,
          (ARRAY_AGG(i.error ORDER BY i.updated_at DESC) FILTER (WHERE i.status = 'FAILED'::"TargetStatus"))[1] AS last_error
        FROM publication_job_items i
        JOIN publication_jobs j ON j.id = i.job_id
        JOIN groups g ON g.id = j.group_id
        WHERE j.profile_id = ${id} AND i.updated_at >= ${since30}
          AND i.status IN ('PUBLISHED'::"TargetStatus", 'FAILED'::"TargetStatus")
        GROUP BY g.id, g.name
        ORDER BY failed DESC, published DESC
        LIMIT 15`),
      this.prisma.$queryRaw<Array<{ error: string; count: bigint }>>(Prisma.sql`
        SELECT LEFT(COALESCE(i.error, 'Échec sans message'), 140) AS error, COUNT(*) AS count
        FROM publication_job_items i JOIN publication_jobs j ON j.id = i.job_id
        WHERE j.profile_id = ${id} AND i.status = 'FAILED'::"TargetStatus" AND i.updated_at >= ${since30}
        GROUP BY 1 ORDER BY 2 DESC LIMIT 5`),
      this.prisma.publicationJobItem.findMany({
        where: { status: TargetStatus.FAILED, job: { profileId: id } },
        orderBy: { updatedAt: 'desc' },
        take: 5,
        select: {
          updatedAt: true,
          error: true,
          postTargetId: true,
          post: { select: { title: true } },
          job: { select: { group: { select: { name: true } } } },
        },
      }),
      this.prisma.profileGroup.groupBy({
        by: ['joinStatus'],
        where: { profileId: id, status: 'ACTIVE', group: { status: 'ACTIVE' } },
        _count: { _all: true },
      }),
      this.transferPlan(id, acting, now),
    ]);
    const t = totals[0] ?? {};
    const n = (v: unknown) => Number(v ?? 0);
    // Les 14 jours, y compris ceux sans rien : une journée vide se voit.
    const byDay = new Map(daily.map((d) => [d.day, d]));
    const days = Array.from({ length: HEALTH_WINDOW_DAYS }, (_, i) => {
      const date = new Date(now.getTime() - (HEALTH_WINDOW_DAYS - 1 - i) * DAY);
      const key = new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(date);
      const row = byDay.get(key);
      return { day: key, published: n(row?.published), failed: n(row?.failed) };
    });
    const preApproved = await this.prisma.profileGroup.count({ where: { profileId: id, preApprovedAt: { not: null } } });
    // Tous ses groupes, pour les gérer depuis sa page.
    const links = await this.prisma.profileGroup.findMany({
      where: { profileId: id },
      orderBy: { group: { name: 'asc' } },
      select: {
        id: true,
        status: true,
        joinStatus: true,
        joinCheckedAt: true,
        preApprovedAt: true,
        memberActionError: true,
        auditRequestedAt: true,
        memberRequestedAt: true,
        preApprovalState: true,
        preApprovalCheckedAt: true,
        preApprovalDetail: true,
        group: { select: { id: true, name: true, url: true, status: true, category: { select: { id: true, name: true } } } },
      },
    });
    const stocks = links.length
      ? await this.prisma.postTarget.groupBy({
          by: ['groupId'],
          where: { groupId: { in: links.map((l) => l.group.id) }, status: TargetStatus.AVAILABLE, post: { status: 'AVAILABLE' } },
          _count: { _all: true },
        })
      : [];
    const stockBy = new Map(stocks.map((s) => [s.groupId, s._count._all]));
    const memberships = links.map((l) => ({
      linkId: l.id,
      auditPending: Boolean(l.auditRequestedAt),
      memberRequested: Boolean(l.memberRequestedAt),
      preApprovalState: l.preApprovalState,
      preApprovalCheckedAt: l.preApprovalCheckedAt,
      preApprovalDetail: l.preApprovalDetail,
      groupId: l.group.id,
      name: l.group.name,
      url: l.group.url,
      groupStatus: l.group.status,
      category: l.group.category,
      linkStatus: l.status,
      joinStatus: l.joinStatus,
      joinCheckedAt: l.joinCheckedAt,
      preApproved: Boolean(l.preApprovedAt),
      memberActionError: l.memberActionError,
      waiting: stockBy.get(l.group.id) ?? 0,
    }));
    return {
      profile: {
        id: profile.id,
        name: profile.name,
        status: profile.status,
        externalId: profile.externalId,
        facebookUserId: profile.facebookUserId,
        isModerator: profile.isModerator,
        runner: profile.runner,
      },
      health: { ...health, labelText: HEALTH_LABELS[health.label], windowDays: HEALTH_WINDOW_DAYS, input },
      totals: {
        today: n(t.today),
        week: n(t.week),
        month: n(t.month),
        total: n(t.total),
        failedWeek: n(t.failed_week),
        failedMonth: n(t.failed_month),
        failedTotal: n(t.failed_total),
        lastPublishedAt: (t.last_published as Date | null) ?? null,
        lastFailedAt: (t.last_failed as Date | null) ?? null,
      },
      days,
      groups: groups.map((g) => ({ id: g.id, name: g.name, published: n(g.published), failed: n(g.failed), lastError: g.last_error })),
      errors: errors.map((e) => ({ error: e.error, count: n(e.count) })),
      failures: failures.map((f) => ({
        at: f.updatedAt,
        error: f.error,
        postTargetId: f.postTargetId,
        post: f.post.title,
        group: f.job.group.name,
      })),
      joins: Object.fromEntries(joins.map((j) => [j.joinStatus, j._count._all])),
      preApproved,
      memberships,
      transfer: plan,
    };
  }

  /** Ce qui l'attend, et qui pourrait le reprendre. */
  async transferPlan(id: string, acting: CurrentUser | null, now = new Date()) {
    const scope = scopeOf(acting);
    const [forced, owned, activeJobs, joined] = await Promise.all([
      this.prisma.postTarget.findMany({
        where: { forcedProfileId: id, status: { in: [TargetStatus.AVAILABLE, TargetStatus.FAILED] } },
        select: { id: true, groupId: true },
      }),
      this.prisma.post.findMany({
        where: { profileId: id, status: 'AVAILABLE', targets: { some: { status: { in: [TargetStatus.AVAILABLE, TargetStatus.FAILED] } } } },
        select: { id: true, targets: { where: { status: { in: [TargetStatus.AVAILABLE, TargetStatus.FAILED] } }, select: { groupId: true } } },
      }),
      this.prisma.publicationJob.count({ where: { profileId: id, status: JobStatus.CLAIMED, claimExpiresAt: { gt: now } } }),
      this.prisma.profileGroup.findMany({
        where: { profileId: id, status: 'ACTIVE', joinStatus: 'JOINED', group: { status: 'ACTIVE', targets: { some: { status: TargetStatus.AVAILABLE } } } },
        select: { groupId: true },
      }),
    ]);
    // Les groupes où ses posts l'attendent : forcés, à lui, ou ceux qu'il a
    // rejoints et qui ont des posts en file.
    const needed = new Set<string>([
      ...forced.map((f) => f.groupId),
      ...owned.flatMap((p) => p.targets.map((t) => t.groupId)),
      ...joined.map((j) => j.groupId),
    ]);
    const others = await this.prisma.profile.findMany({
      where: { id: { not: id }, status: 'ACTIVE', isModerator: false, ...profileWhere(scope) },
      select: {
        id: true,
        name: true,
        runner: { select: { mode: true } },
        profileGroups: {
          where: { status: 'ACTIVE', joinStatus: 'JOINED', groupId: { in: [...needed] } },
          select: { groupId: true },
        },
      },
    });
    const covered = new Set(others.flatMap((o) => o.profileGroups.map((g) => g.groupId)));
    const orphanIds = [...needed].filter((g) => !covered.has(g));
    const orphanGroups = orphanIds.length
      ? await this.prisma.group.findMany({ where: { id: { in: orphanIds } }, select: { id: true, name: true, url: true } })
      : [];
    const health = await this.inputs(others.map((o) => o.id), now);
    const candidates = rankCandidates(
      others.map((o) => {
        const h = healthOf(health.get(o.id) ?? EMPTY);
        return {
          id: o.id,
          name: o.name,
          score: h.score,
          label: h.label,
          labelText: HEALTH_LABELS[h.label],
          running: (o.runner?.mode ?? 'OFF') !== 'OFF',
          groupsCovered: o.profileGroups.length,
          coverage: needed.size ? o.profileGroups.length / needed.size : 0,
        };
      }),
    ).slice(0, 8);
    const recommended =
      candidates.find((c) => c.coverage > 0 && c.label !== 'bad' && c.running) ??
      candidates.find((c) => c.coverage > 0 && c.label !== 'bad') ??
      null;
    return {
      forcedTargets: forced.length,
      ownedPosts: owned.length,
      activeJobs,
      groupsWaiting: needed.size,
      orphanGroups,
      candidates,
      recommendedId: recommended?.id ?? null,
    };
  }

  /** Désactiver, en confiant ce qui l'attendait au profil choisi.
   *
   * - son lot en cours est libéré (ses posts pas encore commencés retournent
   *   dans la file) ;
   * - les publications forcées vers lui passent au repreneur là où celui-ci a
   *   rejoint le groupe, sinon retournent à la file normale ;
   * - ses posts propres deviennent des posts ouverts de son compte (tout
   *   profil du compte peut les publier), avec priorité au repreneur ;
   * - le reste (posts ouverts) n'a rien à transférer : les autres profils des
   *   groupes les prennent. Les groupes où il était seul sont signalés. */
  async deactivate(id: string, transferTo: string | null | undefined, acting: CurrentUser | null, now = new Date()) {
    const profile = await this.reachable(id, acting);
    assertMayManage(profile, acting);
    let heir: { id: string; name: string } | null = null;
    if (transferTo) {
      if (transferTo === id) throw new BadRequestException('Choisissez un AUTRE profil pour reprendre ses posts');
      heir = await this.prisma.profile.findFirst({
        where: { id: transferTo, status: 'ACTIVE', isModerator: false, ...profileWhere(scopeOf(acting)) },
        select: { id: true, name: true },
      });
      if (!heir) throw new BadRequestException('Le profil repreneur doit être actif et à vous');
    }
    const plan = await this.transferPlan(id, acting, now);

    // Le lot en cours d'abord : ses posts reviennent dans la file avant
    // d'être confiés.
    const jobs = await this.prisma.publicationJob.findMany({
      where: { profileId: id, status: JobStatus.CLAIMED, claimExpiresAt: { gt: now } },
      select: { id: true },
    });
    let released = 0;
    for (const job of jobs) {
      const r = await this.jobs.release(job.id, acting, `profil « ${profile.name} » désactivé`);
      released += (r as { released?: number }).released ?? 0;
    }

    const heirGroups = heir
      ? new Set(
          (
            await this.prisma.profileGroup.findMany({
              where: { profileId: heir.id, status: 'ACTIVE', joinStatus: 'JOINED' },
              select: { groupId: true },
            })
          ).map((g) => g.groupId),
        )
      : new Set<string>();
    const ownedPosts = await this.prisma.post.findMany({
      where: { profileId: id, status: 'AVAILABLE' },
      select: { id: true },
    });
    const ownedIds = ownedPosts.map((p) => p.id);
    const openStatuses = [TargetStatus.AVAILABLE, TargetStatus.FAILED];

    const [forcedMoved, forcedCleared, postsOpened, prioritised] = await this.prisma.$transaction([
      this.prisma.postTarget.updateMany({
        where: { forcedProfileId: id, status: { in: openStatuses }, groupId: { in: [...heirGroups] } },
        data: { forcedProfileId: heir?.id ?? null, forcedAt: now },
      }),
      this.prisma.postTarget.updateMany({
        where: { forcedProfileId: id },
        data: { forcedProfileId: null, forcedAt: null },
      }),
      this.prisma.post.updateMany({
        where: { id: { in: ownedIds } },
        data: { profileId: null, ownerId: profile.ownerId },
      }),
      this.prisma.postTarget.updateMany({
        where: {
          postId: { in: ownedIds },
          status: { in: openStatuses },
          forcedProfileId: null,
          groupId: { in: [...heirGroups] },
        },
        data: { forcedProfileId: heir?.id ?? null, forcedAt: heir ? now : null },
      }),
      this.prisma.profile.update({ where: { id }, data: { status: 'INACTIVE' } }),
      this.prisma.profileRunner.updateMany({ where: { profileId: id }, data: { mode: 'OFF' } }),
    ]);
    const summary = {
      released,
      transferredTo: heir,
      forcedMoved: heir ? forcedMoved.count : 0,
      forcedCleared: forcedCleared.count,
      postsOpened: postsOpened.count,
      prioritised: heir ? prioritised.count : 0,
      orphanGroups: plan.orphanGroups,
    };
    await this.prisma.activityLog.create({
      data: {
        profileId: id,
        eventType: 'PROFILE_DEACTIVATED',
        level: 'WARN',
        message:
          `Profil « ${profile.name} » désactivé` +
          (heir ? `, ses posts en attente confiés à « ${heir.name} »` : ', ses posts en attente rendus à la file') +
          (plan.orphanGroups.length ? ` — ${plan.orphanGroups.length} groupe(s) sans autre profil` : ''),
        metadata: { ...summary, by: acting?.username ?? 'clé globale' } as unknown as Prisma.InputJsonValue,
      },
    });
    return summary;
  }
}
