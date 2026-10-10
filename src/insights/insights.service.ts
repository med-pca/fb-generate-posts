import { Injectable } from '@nestjs/common';
import { LogLevel, Prisma, TargetStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { CurrentUser } from '../auth/current-user';
import {
  articleWhere,
  groupWhere,
  jobWhere,
  logWhere,
  postWhere,
  profileWhere,
  scopeOf,
  seesEverything,
  siteWhere,
} from '../auth/scope';
import { localClock } from '../runners/window';
import { adaptiveGap, minutesIntoWindow, pace, PUBLISH_MINUTES, windowLength } from './objective';

/** Au-delà, un profil qui dit travailler ne compte plus comme au travail :
 * même seuil que le Pilotage. */
const AT_WORK_SECONDS = 180;

/** Le début de la journée locale (fuseau de l'objectif), en instant UTC. */
export function startOfLocalDay(now: Date, timeZone: string) {
  const { minutes } = localClock(now, timeZone);
  return new Date(
    now.getTime() -
      minutes * 60_000 -
      now.getUTCSeconds() * 1000 -
      now.getUTCMilliseconds(),
  );
}

/** Ce que les pages lisent pour décider : les compteurs du menu, les
 * statistiques de chaque profil, et l'objectif du jour — où l'on en est, ce
 * qu'il manque, et où ça coince. */
@Injectable()
export class InsightsService {
  constructor(private readonly prisma: PrismaService) {}

  private settings() {
    return this.prisma.automationSetting.upsert({
      where: { id: 'global' },
      create: { id: 'global' },
      update: {},
    });
  }

  /** Les publications encore à faire, exactement comme la file les compte. */
  private upcomingWhere(acting: CurrentUser | null): Prisma.PostTargetWhereInput {
    const scope = postWhere(scopeOf(acting));
    return {
      status: TargetStatus.AVAILABLE,
      group: { status: 'ACTIVE' },
      post: {
        AND: [
          scope,
          { status: 'AVAILABLE' },
          { OR: [{ articleId: null }, { article: { status: 'ACTIVE' } }] },
        ],
      },
    };
  }

  /* ── Compteurs du menu ───────────────────────────────────────────── */

  async counters(acting: CurrentUser | null, now = new Date()) {
    const scope = scopeOf(acting);
    const settings = await this.settings();
    const dayStart = startOfLocalDay(now, settings.objectiveTimezone);
    const day = new Date(now.getTime() - 86_400_000);
    const logScope = seesEverything(scope) ? {} : logWhere(scope);
    const [
      profiles,
      groups,
      categories,
      sites,
      sitesAlert,
      articles,
      upcoming,
      failed,
      logErrors,
      publishedToday,
      users,
    ] = await Promise.all([
      this.prisma.profile.count({ where: { status: 'ACTIVE', ...profileWhere(scope) } }),
      this.prisma.group.count({ where: { status: 'ACTIVE', ...groupWhere(scope) } }),
      this.prisma.category.count(),
      this.prisma.contentSource.count({ where: { status: 'ACTIVE', ...siteWhere(scope) } }),
      this.prisma.contentSource.count({
        where: {
          status: 'ACTIVE',
          ...siteWhere(scope),
          OR: [{ pluginState: { not: 'CONNECTED' } }, { categoryId: null }],
        },
      }),
      this.prisma.article.count({ where: articleWhere(scope) }),
      this.prisma.postTarget.count({ where: this.upcomingWhere(acting) }),
      this.prisma.postTarget.count({
        where: { status: TargetStatus.FAILED, post: postWhere(scope) },
      }),
      this.prisma.activityLog.count({
        where: { AND: [logScope, { level: LogLevel.ERROR, createdAt: { gte: day } }] },
      }),
      this.prisma.publicationJobItem.count({
        where: {
          status: TargetStatus.PUBLISHED,
          publishedAt: { gte: dayStart },
          job: jobWhere(scope),
        },
      }),
      seesEverything(scope) ? this.prisma.user.count() : Promise.resolve(0),
    ]);
    return {
      profiles,
      groups,
      categories,
      sites,
      sitesAlert,
      articles,
      posts: upcoming,
      postsFailed: failed,
      logErrors,
      users,
      publishedToday,
      dailyTarget: settings.dailyTarget,
    };
  }

  /* ── Statistiques par profil ─────────────────────────────────────── */

  async profileStats(acting: CurrentUser | null, now = new Date()) {
    const scope = scopeOf(acting);
    const settings = await this.settings();
    const dayStart = startOfLocalDay(now, settings.objectiveTimezone);
    const weekStart = new Date(now.getTime() - 7 * 86_400_000);
    const profiles = await this.prisma.profile.findMany({
      where: profileWhere(scope),
      select: {
        id: true,
        ownerId: true,
        runner: {
          select: {
            mode: true,
            running: true,
            lastSeenAt: true,
            browserState: true,
          },
        },
      },
    });
    const ids = profiles.map((p) => p.id);
    if (!ids.length) return {};

    // Une ligne par profil : publications du jour, de la semaine, au total,
    // échecs de la semaine, dernière publication.
    const rows = await this.prisma.$queryRaw<
      Array<{
        profile_id: string;
        today: bigint;
        week: bigint;
        total: bigint;
        failed_week: bigint;
        last_published: Date | null;
      }>
    >(Prisma.sql`
      SELECT j.profile_id,
        COUNT(*) FILTER (WHERE i.status = 'PUBLISHED'::"TargetStatus" AND i.published_at >= ${dayStart}) AS today,
        COUNT(*) FILTER (WHERE i.status = 'PUBLISHED'::"TargetStatus" AND i.published_at >= ${weekStart}) AS week,
        COUNT(*) FILTER (WHERE i.status = 'PUBLISHED'::"TargetStatus") AS total,
        COUNT(*) FILTER (WHERE i.status = 'FAILED'::"TargetStatus" AND i.updated_at >= ${weekStart}) AS failed_week,
        MAX(i.published_at) AS last_published
      FROM publication_job_items i
      INNER JOIN publication_jobs j ON j.id = i.job_id
      WHERE j.profile_id IN (${Prisma.join(ids)})
      GROUP BY j.profile_id
    `);
    const joins = await this.prisma.profileGroup.groupBy({
      by: ['profileId', 'joinStatus'],
      where: { profileId: { in: ids }, status: 'ACTIVE', group: { status: 'ACTIVE' } },
      _count: { _all: true },
    });

    // Le stock qui l'attend : les publications à faire dans les groupes
    // qu'il a rejoints, et qu'il a le droit de prendre.
    const stocks = await Promise.all(
      profiles.map(async (profile) => {
        const count = await this.prisma.postTarget.count({
          where: {
            ...this.upcomingWhere(acting),
            group: {
              status: 'ACTIVE',
              profiles: {
                some: { profileId: profile.id, status: 'ACTIVE', joinStatus: 'JOINED' },
              },
            },
            OR: [{ forcedProfileId: null }, { forcedProfileId: profile.id }],
            post: {
              AND: [
                postWhere(scope),
                { status: 'AVAILABLE' },
                { OR: [{ articleId: null }, { article: { status: 'ACTIVE' } }] },
                {
                  OR: [
                    { profileId: profile.id },
                    {
                      profileId: null,
                      OR: [
                        { ownerId: null },
                        { owner: { role: 'ADMIN' } },
                        ...(profile.ownerId ? [{ ownerId: profile.ownerId }] : []),
                      ],
                    },
                  ],
                },
              ],
            },
          },
        });
        return [profile.id, count] as const;
      }),
    );
    const stockBy = new Map(stocks);
    const byProfile = new Map(rows.map((row) => [row.profile_id, row]));

    const result: Record<string, unknown> = {};
    for (const profile of profiles) {
      const row = byProfile.get(profile.id);
      const groups = { joined: 0, requested: 0, pending: 0, failed: 0 };
      for (const join of joins.filter((j) => j.profileId === profile.id)) {
        const n = join._count._all;
        if (join.joinStatus === 'JOINED') groups.joined += n;
        else if (join.joinStatus === 'REQUESTED' || join.joinStatus === 'QUESTIONS')
          groups.requested += n;
        else if (join.joinStatus === 'FAILED') groups.failed += n;
        else groups.pending += n;
      }
      const runner = profile.runner;
      result[profile.id] = {
        publishedToday: Number(row?.today ?? 0),
        publishedWeek: Number(row?.week ?? 0),
        publishedTotal: Number(row?.total ?? 0),
        failedWeek: Number(row?.failed_week ?? 0),
        lastPublishedAt: row?.last_published ?? null,
        groups,
        stock: stockBy.get(profile.id) ?? 0,
        mode: runner?.mode ?? 'OFF',
        atWork: Boolean(
          runner?.running &&
            runner.lastSeenAt &&
            now.getTime() - runner.lastSeenAt.getTime() < AT_WORK_SECONDS * 1000,
        ),
        browserState: runner?.browserState ?? 'STOPPED',
      };
    }
    return result;
  }

  /* ── L'objectif du jour ──────────────────────────────────────────── */

  async objective(acting: CurrentUser | null, now = new Date()) {
    const scope = scopeOf(acting);
    const settings = await this.settings();
    const tz = settings.objectiveTimezone;
    const dayStart = startOfLocalDay(now, tz);
    const hourAgo = new Date(now.getTime() - 3_600_000);

    const [items, stockRows, groups, profiles, articlesToday] = await Promise.all([
      this.prisma.publicationJobItem.findMany({
        where: {
          status: TargetStatus.PUBLISHED,
          publishedAt: { gte: dayStart },
          job: jobWhere(scope),
          // En attente de validation : invisible, ne compte qu'une fois validé.
          postTarget: { approvalPendingSince: null },
        },
        select: {
          publishedAt: true,
          job: { select: { profileId: true } },
          postTarget: { select: { groupId: true, postId: true } },
        },
      }),
      this.prisma.postTarget.groupBy({
        by: ['groupId'],
        where: this.upcomingWhere(acting),
        _count: { _all: true },
      }),
      this.prisma.group.findMany({
        where: { status: 'ACTIVE', ...groupWhere(scope) },
        select: {
          id: true,
          name: true,
          category: { select: { id: true, name: true } },
          profiles: {
            where: { status: 'ACTIVE', joinStatus: 'JOINED', profile: { status: 'ACTIVE' } },
            select: {
              profile: {
                select: { id: true, name: true, runner: { select: { mode: true } } },
              },
            },
          },
          _count: {
            select: {
              profiles: {
                where: { status: 'ACTIVE', joinStatus: { in: ['REQUESTED', 'QUESTIONS'] } },
              },
            },
          },
        },
        orderBy: { name: 'asc' },
      }),
      this.prisma.profile.findMany({
        where: { status: 'ACTIVE', ...profileWhere(scope) },
        select: {
          id: true,
          name: true,
          runner: { select: { mode: true, running: true, lastSeenAt: true } },
          _count: {
            select: {
              profileGroups: {
                where: { status: 'ACTIVE', joinStatus: 'JOINED', group: { status: 'ACTIVE' } },
              },
            },
          },
        },
        orderBy: { name: 'asc' },
      }),
      this.prisma.article.count({
        where: { importedAt: { gte: dayStart }, ...articleWhere(scope) },
      }),
    ]);

    // Heure par heure, à l'heure de l'objectif.
    const hourly = Array.from({ length: 24 }, () => 0);
    const byGroup = new Map<string, number>();
    const byProfile = new Map<string, number>();
    let lastHour = 0;
    for (const item of items) {
      if (!item.publishedAt) continue;
      hourly[Math.floor(localClock(item.publishedAt, tz).minutes / 60)] += 1;
      if (item.publishedAt >= hourAgo) lastHour += 1;
      byGroup.set(item.postTarget.groupId, (byGroup.get(item.postTarget.groupId) ?? 0) + 1);
      byProfile.set(item.job.profileId, (byProfile.get(item.job.profileId) ?? 0) + 1);
    }
    const stockBy = new Map(stockRows.map((row) => [row.groupId, row._count._all]));

    const nowMinutes = localClock(now, tz).minutes;
    const result = pace({
      target: settings.dailyTarget,
      start: settings.objectiveStart,
      end: settings.objectiveEnd,
      nowMinutes,
      published: items.length,
      lastHour,
    });

    // Un groupe ne publie que si un profil l'a rejoint et n'est pas arrêté.
    const groupRows = groups.map((group) => {
      const joined = group.profiles.map(({ profile }) => profile);
      const participants = joined.filter((p) => (p.runner?.mode ?? 'OFF') !== 'OFF');
      const stock = stockBy.get(group.id) ?? 0;
      return {
        id: group.id,
        name: group.name,
        category: group.category,
        publishedToday: byGroup.get(group.id) ?? 0,
        stock,
        participants: participants.map((p) => ({ id: p.id, name: p.name })),
        pendingJoins: group._count.profiles,
        // Sans profil « Rejoint » : demandes en attente (souvent acceptées
        // depuis, sans que rien ne l'ait remonté), ou personne du tout.
        blocked: !joined.length
          ? group._count.profiles
            ? 'requests_pending'
            : 'no_profile'
          : !participants.length
            ? 'profiles_off'
            : null,
      };
    });
    const publishable = groupRows.filter((g) => !g.blocked);
    const stockPublishable = publishable.reduce((sum, g) => sum + g.stock, 0);
    const stockBlocked = groupRows
      .filter((g) => g.blocked)
      .reduce((sum, g) => sum + g.stock, 0);
    const deficit = Math.max(0, result.remaining - stockPublishable);

    // Par catégorie : un article reçu d'un site de la catégorie devient un
    // post dans chacun de ses groupes — c'est ce qui chiffre les articles
    // nécessaires.
    const categoryMap = new Map<
      string,
      {
        id: string | null;
        name: string;
        groups: number;
        publishableGroups: number;
        publishedToday: number;
        stock: number;
        stockPublishable: number;
      }
    >();
    for (const g of groupRows) {
      const key = g.category?.id ?? '';
      const entry = categoryMap.get(key) ?? {
        id: g.category?.id ?? null,
        name: g.category?.name ?? 'Sans catégorie',
        groups: 0,
        publishableGroups: 0,
        publishedToday: 0,
        stock: 0,
        stockPublishable: 0,
      };
      entry.groups += 1;
      entry.publishedToday += g.publishedToday;
      entry.stock += g.stock;
      if (!g.blocked) {
        entry.publishableGroups += 1;
        entry.stockPublishable += g.stock;
      }
      categoryMap.set(key, entry);
    }
    const categories = [...categoryMap.values()]
      .map((c) => ({
        ...c,
        // Si tout le manque venait de cette catégorie.
        articlesNeeded:
          deficit && c.id && c.publishableGroups
            ? Math.ceil(deficit / c.publishableGroups)
            : 0,
      }))
      .sort((a, b) => b.publishableGroups - a.publishableGroups);
    const feeding = categories.filter((c) => c.id && c.publishableGroups);
    const averagePostsPerArticle = feeding.length
      ? feeding.reduce((sum, c) => sum + c.publishableGroups, 0) / feeding.length
      : 0;
    const articlesNeeded =
      deficit && averagePostsPerArticle ? Math.ceil(deficit / averagePostsPerArticle) : 0;

    const participating = profiles.filter(
      (p) => (p.runner?.mode ?? 'OFF') !== 'OFF' && p._count.profileGroups > 0,
    );
    const share = participating.length
      ? Math.ceil(settings.dailyTarget / participating.length)
      : 0;
    const profileRows = profiles.map((p) => {
      const mode = p.runner?.mode ?? 'OFF';
      const joined = p._count.profileGroups;
      return {
        id: p.id,
        name: p.name,
        mode,
        joinedGroups: joined,
        publishedToday: byProfile.get(p.id) ?? 0,
        share: mode !== 'OFF' && joined ? share : 0,
        atWork: Boolean(
          p.runner?.running &&
            p.runner.lastSeenAt &&
            now.getTime() - p.runner.lastSeenAt.getTime() < AT_WORK_SECONDS * 1000,
        ),
        participating: mode !== 'OFF' && joined > 0,
      };
    });

    // La cadence adaptative : ce que les profils reçoivent comme attente
    // entre deux posts (le même calcul que la réservation).
    const working = profiles.filter(
      (p) => (p.runner?.mode ?? 'OFF') !== 'OFF' && p.runner?.running && p.runner.lastSeenAt && now.getTime() - p.runner.lastSeenAt.getTime() < AT_WORK_SECONDS * 1000,
    ).length;
    const gap = settings.adaptivePacing
      ? adaptiveGap({ neededPerHour: result.neededPerHour, ratePerHour: result.ratePerHour, profiles: working, minGap: settings.minPostGapMinutes, status: result.status })
      : null;
    const pacing = {
      enabled: settings.adaptivePacing,
      minGap: settings.minPostGapMinutes,
      profiles: working,
      gapMinutes: gap,
      // Au mieux, avec ces profils et ce minimum : de quoi dire si le besoin est tenable.
      maxPerHour: working ? Math.floor((60 * working) / (settings.minPostGapMinutes + PUBLISH_MINUTES)) : 0,
    };

    const awaitingApproval = await this.prisma.postTarget.count({
      where: { status: TargetStatus.PUBLISHED, approvalPendingSince: { not: null }, post: postWhere(scope) },
    });

    const plan = await this.articlePlan({
      target: settings.dailyTarget,
      start: settings.objectiveStart,
      end: settings.objectiveEnd,
      nowMinutes,
      postsPerArticle: averagePostsPerArticle,
      publishableGroupIds: publishable.map((g) => g.id),
      publishedPosts: [...new Set(items.map((i) => i.postTarget.postId))],
      acting,
    });

    // Ce qu'il faut faire, dans l'ordre où ça compte.
    const advice: Array<{ level: 'ok' | 'warn' | 'error'; text: string }> = [];
    if (plan.articlesPerDay && plan.missing > 0) {
      advice.push({
        level: plan.ready + plan.inProgress === 0 ? 'error' : 'warn',
        text: `Plan du jour : ${plan.articlesPerDay} article(s) (${settings.dailyTarget} posts ÷ ${plan.postsPerArticle} groupes). ${plan.done} terminé(s), ${plan.inProgress} en cours, ${plan.ready} prêt(s) : il manque ${plan.missing} article(s) à importer aujourd’hui.`,
      });
    }
    if (!settings.dailyTarget) {
      advice.push({ level: 'warn', text: 'Aucun objectif réglé : indiquez un nombre de posts par jour.' });
    }
    if (deficit > 0) {
      advice.push({
        level: 'error',
        text:
          `Stock insuffisant : il reste ${result.remaining} post(s) à publier, ${stockPublishable} prêt(s). ` +
          (articlesNeeded
            ? `Il manque ${deficit} post(s), soit environ ${articlesNeeded} article(s) à importer (1 article ≈ ${Math.round(averagePostsPerArticle)} post(s)).`
            : `Il manque ${deficit} post(s), et aucune catégorie n’a de groupe prêt à publier.`),
      });
    }
    const blocked = groupRows.filter((g) => g.blocked && g.stock);
    if (blocked.length) {
      advice.push({
        level: 'warn',
        text: `${blocked.length} groupe(s) ont ${stockBlocked} post(s) qui ne partiront pas : aucun profil actif ne les a rejoints${
          blocked.some((g) => g.blocked === 'requests_pending')
            ? ' — des demandes d’adhésion y sont en attente : si elles ont été acceptées, faites revérifier l’extension d’adhésion ou corrigez dans Groupes'
            : ''
        } (${blocked
          .slice(0, 5)
          .map((g) => g.name)
          .join(', ')}${blocked.length > 5 ? '…' : ''}).`,
      });
    }
    if (result.status === 'late' && settings.adaptivePacing && pacing.profiles && result.neededPerHour > pacing.maxPerHour) {
      advice.push({
        level: 'error',
        text: `Même au plus vite (un post toutes les ${settings.minPostGapMinutes} min par profil), ${pacing.profiles} profil(s) font au plus ${pacing.maxPerHour}/h : il faut ${result.neededPerHour}/h. Allumez d’autres profils.`,
      });
    }
    if (result.status === 'late') {
      advice.push({
        level: 'error',
        text: `En retard de ${-result.delta} post(s) : il faut tenir ${result.neededPerHour}/h d’ici la fin (rythme actuel ${result.ratePerHour}/h). Allumez des profils ou faites rejoindre des groupes.`,
      });
    }
    if (settings.dailyTarget && !participating.length) {
      advice.push({ level: 'error', text: 'Aucun profil ne participe : allumez des profils qui ont rejoint des groupes.' });
    }
    if (!advice.length) {
      advice.push({ level: 'ok', text: 'Tout est en ordre pour atteindre l’objectif.' });
    }

    return {
      settings: {
        dailyTarget: settings.dailyTarget,
        objectiveStart: settings.objectiveStart,
        objectiveEnd: settings.objectiveEnd,
        objectiveTimezone: tz,
      },
      serverTime: now.toISOString(),
      dayStart: dayStart.toISOString(),
      pace: result,
      hourly,
      stock: { publishable: stockPublishable, blocked: stockBlocked, deficit },
      plan,
      pacing,
      awaitingApproval,
      articles: { today: articlesToday, needed: articlesNeeded, postsPerArticle: averagePostsPerArticle },
      profiles: {
        participating: participating.length,
        atWork: profileRows.filter((p) => p.atWork).length,
        share,
        rows: profileRows,
      },
      categories,
      groups: groupRows.sort((a, b) => Number(Boolean(a.blocked)) - Number(Boolean(b.blocked)) || b.stock - a.stock),
      advice,
    };
  }

  /** Le plan du jour, en articles : un article part dans tous les groupes
   * de sa catégorie, donc objectif ÷ groupes = articles à diffuser
   * (300 posts ÷ 20 groupes = 15 articles). Avec, pour la journée :
   *  - terminés : publiés aujourd'hui, plus rien à faire dans un groupe prêt ;
   *  - en cours : publiés aujourd'hui dans une partie de leurs groupes ;
   *  - prêts : en file, pas encore commencés ;
   *  - à importer : ce qui manque pour tenir le plan ;
   *  - cadence : un nouvel article toutes les N minutes sur la plage. */
  private async articlePlan(input: {
    target: number;
    start: number;
    end: number;
    nowMinutes: number;
    postsPerArticle: number;
    publishableGroupIds: string[];
    publishedPosts: string[];
    acting: CurrentUser | null;
  }) {
    const postsPerArticle = Math.round(input.postsPerArticle);
    const articlesPerDay = input.target && postsPerArticle ? Math.ceil(input.target / postsPerArticle) : 0;
    const waiting = input.publishableGroupIds.length
      ? await this.prisma.postTarget.groupBy({
          by: ['postId'],
          where: { ...this.upcomingWhere(input.acting), groupId: { in: input.publishableGroupIds } },
          _count: { _all: true },
        })
      : [];
    const waitingPosts = new Set(waiting.map((w) => w.postId));
    const started = new Set(input.publishedPosts);
    const inProgress = [...started].filter((id) => waitingPosts.has(id)).length;
    const done = started.size - inProgress;
    const ready = [...waitingPosts].filter((id) => !started.has(id)).length;
    const missing = Math.max(0, articlesPerDay - done - inProgress - ready);
    // Une plage qui passe minuit, ou de 24 h (bornes égales), compte entière.
    const windowMinutes = windowLength(input.start, input.end);
    const into = minutesIntoWindow(input.nowMinutes, input.start, input.end);
    return {
      postsPerArticle,
      articlesPerDay,
      done,
      inProgress,
      ready,
      missing,
      // Un nouvel article toutes les N minutes pour tenir le plan sur la plage.
      everyMinutes: articlesPerDay && windowMinutes ? Math.round(windowMinutes / articlesPerDay) : 0,
      // Où l'on devrait en être à cette heure (articles commencés).
      expectedNow:
        articlesPerDay && windowMinutes
          ? Math.min(articlesPerDay, Math.max(0, Math.ceil((into / windowMinutes) * articlesPerDay)))
          : 0,
    };
  }
}
