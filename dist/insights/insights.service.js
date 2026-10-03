"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.InsightsService = void 0;
exports.startOfLocalDay = startOfLocalDay;
const common_1 = require("@nestjs/common");
const client_1 = require("@prisma/client");
const prisma_service_1 = require("../prisma/prisma.service");
const scope_1 = require("../auth/scope");
const window_1 = require("../runners/window");
const objective_1 = require("./objective");
const AT_WORK_SECONDS = 180;
function startOfLocalDay(now, timeZone) {
    const { minutes } = (0, window_1.localClock)(now, timeZone);
    return new Date(now.getTime() -
        minutes * 60_000 -
        now.getUTCSeconds() * 1000 -
        now.getUTCMilliseconds());
}
let InsightsService = class InsightsService {
    prisma;
    constructor(prisma) {
        this.prisma = prisma;
    }
    settings() {
        return this.prisma.automationSetting.upsert({
            where: { id: 'global' },
            create: { id: 'global' },
            update: {},
        });
    }
    upcomingWhere(acting) {
        const scope = (0, scope_1.postWhere)((0, scope_1.scopeOf)(acting));
        return {
            status: client_1.TargetStatus.AVAILABLE,
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
    async counters(acting, now = new Date()) {
        const scope = (0, scope_1.scopeOf)(acting);
        const settings = await this.settings();
        const dayStart = startOfLocalDay(now, settings.objectiveTimezone);
        const day = new Date(now.getTime() - 86_400_000);
        const logScope = (0, scope_1.seesEverything)(scope) ? {} : (0, scope_1.logWhere)(scope);
        const [profiles, groups, categories, sites, sitesAlert, articles, upcoming, failed, logErrors, publishedToday, users,] = await Promise.all([
            this.prisma.profile.count({ where: { status: 'ACTIVE', ...(0, scope_1.profileWhere)(scope) } }),
            this.prisma.group.count({ where: { status: 'ACTIVE', ...(0, scope_1.groupWhere)(scope) } }),
            this.prisma.category.count(),
            this.prisma.contentSource.count({ where: { status: 'ACTIVE', ...(0, scope_1.siteWhere)(scope) } }),
            this.prisma.contentSource.count({
                where: {
                    status: 'ACTIVE',
                    ...(0, scope_1.siteWhere)(scope),
                    OR: [{ pluginState: { not: 'CONNECTED' } }, { categoryId: null }],
                },
            }),
            this.prisma.article.count({ where: (0, scope_1.articleWhere)(scope) }),
            this.prisma.postTarget.count({ where: this.upcomingWhere(acting) }),
            this.prisma.postTarget.count({
                where: { status: client_1.TargetStatus.FAILED, post: (0, scope_1.postWhere)(scope) },
            }),
            this.prisma.activityLog.count({
                where: { AND: [logScope, { level: client_1.LogLevel.ERROR, createdAt: { gte: day } }] },
            }),
            this.prisma.publicationJobItem.count({
                where: {
                    status: client_1.TargetStatus.PUBLISHED,
                    publishedAt: { gte: dayStart },
                    job: (0, scope_1.jobWhere)(scope),
                },
            }),
            (0, scope_1.seesEverything)(scope) ? this.prisma.user.count() : Promise.resolve(0),
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
    async profileStats(acting, now = new Date()) {
        const scope = (0, scope_1.scopeOf)(acting);
        const settings = await this.settings();
        const dayStart = startOfLocalDay(now, settings.objectiveTimezone);
        const weekStart = new Date(now.getTime() - 7 * 86_400_000);
        const profiles = await this.prisma.profile.findMany({
            where: (0, scope_1.profileWhere)(scope),
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
        if (!ids.length)
            return {};
        const rows = await this.prisma.$queryRaw(client_1.Prisma.sql `
      SELECT j.profile_id,
        COUNT(*) FILTER (WHERE i.status = 'PUBLISHED'::"TargetStatus" AND i.published_at >= ${dayStart}) AS today,
        COUNT(*) FILTER (WHERE i.status = 'PUBLISHED'::"TargetStatus" AND i.published_at >= ${weekStart}) AS week,
        COUNT(*) FILTER (WHERE i.status = 'PUBLISHED'::"TargetStatus") AS total,
        COUNT(*) FILTER (WHERE i.status = 'FAILED'::"TargetStatus" AND i.updated_at >= ${weekStart}) AS failed_week,
        MAX(i.published_at) AS last_published
      FROM publication_job_items i
      INNER JOIN publication_jobs j ON j.id = i.job_id
      WHERE j.profile_id IN (${client_1.Prisma.join(ids)})
      GROUP BY j.profile_id
    `);
        const joins = await this.prisma.profileGroup.groupBy({
            by: ['profileId', 'joinStatus'],
            where: { profileId: { in: ids }, status: 'ACTIVE', group: { status: 'ACTIVE' } },
            _count: { _all: true },
        });
        const stocks = await Promise.all(profiles.map(async (profile) => {
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
                            (0, scope_1.postWhere)(scope),
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
            return [profile.id, count];
        }));
        const stockBy = new Map(stocks);
        const byProfile = new Map(rows.map((row) => [row.profile_id, row]));
        const result = {};
        for (const profile of profiles) {
            const row = byProfile.get(profile.id);
            const groups = { joined: 0, requested: 0, pending: 0, failed: 0 };
            for (const join of joins.filter((j) => j.profileId === profile.id)) {
                const n = join._count._all;
                if (join.joinStatus === 'JOINED')
                    groups.joined += n;
                else if (join.joinStatus === 'REQUESTED' || join.joinStatus === 'QUESTIONS')
                    groups.requested += n;
                else if (join.joinStatus === 'FAILED')
                    groups.failed += n;
                else
                    groups.pending += n;
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
                atWork: Boolean(runner?.running &&
                    runner.lastSeenAt &&
                    now.getTime() - runner.lastSeenAt.getTime() < AT_WORK_SECONDS * 1000),
                browserState: runner?.browserState ?? 'STOPPED',
            };
        }
        return result;
    }
    async objective(acting, now = new Date()) {
        const scope = (0, scope_1.scopeOf)(acting);
        const settings = await this.settings();
        const tz = settings.objectiveTimezone;
        const dayStart = startOfLocalDay(now, tz);
        const hourAgo = new Date(now.getTime() - 3_600_000);
        const [items, stockRows, groups, profiles, articlesToday] = await Promise.all([
            this.prisma.publicationJobItem.findMany({
                where: {
                    status: client_1.TargetStatus.PUBLISHED,
                    publishedAt: { gte: dayStart },
                    job: (0, scope_1.jobWhere)(scope),
                },
                select: {
                    publishedAt: true,
                    job: { select: { profileId: true } },
                    postTarget: { select: { groupId: true } },
                },
            }),
            this.prisma.postTarget.groupBy({
                by: ['groupId'],
                where: this.upcomingWhere(acting),
                _count: { _all: true },
            }),
            this.prisma.group.findMany({
                where: { status: 'ACTIVE', ...(0, scope_1.groupWhere)(scope) },
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
                where: { status: 'ACTIVE', ...(0, scope_1.profileWhere)(scope) },
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
                where: { importedAt: { gte: dayStart }, ...(0, scope_1.articleWhere)(scope) },
            }),
        ]);
        const hourly = Array.from({ length: 24 }, () => 0);
        const byGroup = new Map();
        const byProfile = new Map();
        let lastHour = 0;
        for (const item of items) {
            if (!item.publishedAt)
                continue;
            hourly[Math.floor((0, window_1.localClock)(item.publishedAt, tz).minutes / 60)] += 1;
            if (item.publishedAt >= hourAgo)
                lastHour += 1;
            byGroup.set(item.postTarget.groupId, (byGroup.get(item.postTarget.groupId) ?? 0) + 1);
            byProfile.set(item.job.profileId, (byProfile.get(item.job.profileId) ?? 0) + 1);
        }
        const stockBy = new Map(stockRows.map((row) => [row.groupId, row._count._all]));
        const nowMinutes = (0, window_1.localClock)(now, tz).minutes;
        const result = (0, objective_1.pace)({
            target: settings.dailyTarget,
            start: settings.objectiveStart,
            end: settings.objectiveEnd,
            nowMinutes,
            published: items.length,
            lastHour,
        });
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
        const categoryMap = new Map();
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
            articlesNeeded: deficit && c.id && c.publishableGroups
                ? Math.ceil(deficit / c.publishableGroups)
                : 0,
        }))
            .sort((a, b) => b.publishableGroups - a.publishableGroups);
        const feeding = categories.filter((c) => c.id && c.publishableGroups);
        const averagePostsPerArticle = feeding.length
            ? feeding.reduce((sum, c) => sum + c.publishableGroups, 0) / feeding.length
            : 0;
        const articlesNeeded = deficit && averagePostsPerArticle ? Math.ceil(deficit / averagePostsPerArticle) : 0;
        const participating = profiles.filter((p) => (p.runner?.mode ?? 'OFF') !== 'OFF' && p._count.profileGroups > 0);
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
                atWork: Boolean(p.runner?.running &&
                    p.runner.lastSeenAt &&
                    now.getTime() - p.runner.lastSeenAt.getTime() < AT_WORK_SECONDS * 1000),
                participating: mode !== 'OFF' && joined > 0,
            };
        });
        const advice = [];
        if (!settings.dailyTarget) {
            advice.push({ level: 'warn', text: 'Aucun objectif réglé : indiquez un nombre de posts par jour.' });
        }
        if (deficit > 0) {
            advice.push({
                level: 'error',
                text: `Stock insuffisant : il reste ${result.remaining} post(s) à publier, ${stockPublishable} prêt(s). ` +
                    (articlesNeeded
                        ? `Il manque ${deficit} post(s), soit environ ${articlesNeeded} article(s) à importer (1 article ≈ ${Math.round(averagePostsPerArticle)} post(s)).`
                        : `Il manque ${deficit} post(s), et aucune catégorie n’a de groupe prêt à publier.`),
            });
        }
        const blocked = groupRows.filter((g) => g.blocked && g.stock);
        if (blocked.length) {
            advice.push({
                level: 'warn',
                text: `${blocked.length} groupe(s) ont ${stockBlocked} post(s) qui ne partiront pas : aucun profil actif ne les a rejoints${blocked.some((g) => g.blocked === 'requests_pending')
                    ? ' — des demandes d’adhésion y sont en attente : si elles ont été acceptées, faites revérifier l’extension d’adhésion ou corrigez dans Groupes'
                    : ''} (${blocked
                    .slice(0, 5)
                    .map((g) => g.name)
                    .join(', ')}${blocked.length > 5 ? '…' : ''}).`,
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
};
exports.InsightsService = InsightsService;
exports.InsightsService = InsightsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], InsightsService);
//# sourceMappingURL=insights.service.js.map