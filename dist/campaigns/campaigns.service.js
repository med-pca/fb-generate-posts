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
var CampaignsService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.CampaignsService = void 0;
const common_1 = require("@nestjs/common");
const client_1 = require("@prisma/client");
const prisma_service_1 = require("../prisma/prisma.service");
const scope_1 = require("../auth/scope");
const window_1 = require("../runners/window");
const period_1 = require("./period");
const objective_1 = require("../insights/objective");
const CAMPAIGN_INCLUDE = {
    site: { select: { id: true, name: true, categoryId: true } },
    category: { select: { id: true, name: true } },
    groups: { select: { group: { select: { id: true, name: true } } } },
    profiles: { select: { profile: { select: { id: true, name: true } } } },
    articles: { select: { article: { select: { id: true, title: true } } } },
};
function restReason(blocking, closed) {
    if (blocking.length)
        return `repos (campagne) : ${blocking.slice(0, 2).join(' ; ')}`;
    if (closed.length)
        return `repos (campagne) : ${closed.slice(0, 2).join(' ; ')}`;
    return 'repos : aucune campagne active ne lui donne de travail (mode Auto)';
}
let CampaignsService = CampaignsService_1 = class CampaignsService {
    prisma;
    logger = new common_1.Logger(CampaignsService_1.name);
    constructor(prisma) {
        this.prisma = prisma;
    }
    onModuleInit() {
        void this.backfill().catch((e) => this.logger.warn(`Rattachement des publications aux campagnes : ${e instanceof Error ? e.message : e}`));
    }
    async list(acting, now = new Date()) {
        const rows = await this.prisma.campaign.findMany({
            where: (0, scope_1.ownedWhere)((0, scope_1.scopeOf)(acting)),
            include: CAMPAIGN_INCLUDE,
            orderBy: [{ status: 'asc' }, { priority: 'desc' }, { createdAt: 'desc' }],
        });
        return Promise.all(rows.map(async (c) => {
            const pool = c.activeProfiles && c.status === 'ACTIVE' ? await this.pool(c, now) : null;
            const progress = await this.progress(c, now);
            return {
                ...this.shape(c),
                progress,
                capacity: c.status === 'ACTIVE' ? await this.capacity(c, progress, now) : null,
                pool: pool && { size: pool.size, active: pool.active.length, standby: pool.standby.length, unavailable: pool.unavailable.length, missing: pool.missing },
            };
        }));
    }
    async detail(id, acting, now = new Date()) {
        const c = await this.reachable(id, acting);
        const progress = await this.progress(c, now);
        const pool = c.activeProfiles ? await this.pool(c, now) : null;
        const items = await this.publications(c, progress.since, progress.to);
        const count = (key, label) => {
            const map = new Map();
            for (const i of items) {
                const k = key(i);
                if (k)
                    map.set(k, (map.get(k) ?? 0) + 1);
            }
            return [...map].map(([k, n]) => ({ id: k, name: label(k), published: n })).sort((a, b) => b.published - a.published);
        };
        const names = await this.names(items);
        const series = c.period === 'day'
            ? Array.from({ length: 24 }, (_, h) => ({ label: `${String(h).padStart(2, '0')} h`, published: 0 }))
            : Array.from({ length: progress.days }, (_, d) => ({ label: new Date(progress.from.getTime() + d * 86_400_000 + 12 * 3_600_000).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', timeZone: c.timezone }), published: 0 }));
        for (const i of items) {
            if (!i.publishedAt)
                continue;
            const slot = c.period === 'day'
                ? Math.floor((0, window_1.localClock)(i.publishedAt, c.timezone).minutes / 60)
                : Math.floor((i.publishedAt.getTime() - progress.from.getTime()) / 86_400_000);
            if (series[slot])
                series[slot].published += 1;
        }
        return {
            ...this.shape(c),
            progress,
            capacity: c.status === 'ACTIVE' ? await this.capacity(c, progress, now) : null,
            pool,
            series,
            byArticle: count((i) => i.articleId, (k) => names.articles.get(k) ?? k).slice(0, 50),
            byProfile: count((i) => i.profileId, (k) => names.profiles.get(k) ?? k).slice(0, 50),
            byGroup: count((i) => i.groupId, (k) => names.groups.get(k) ?? k).slice(0, 50),
        };
    }
    async create(dto, acting) {
        const scope = await this.checkScope(dto, acting);
        const c = await this.prisma.campaign.create({
            data: {
                name: dto.name.trim(),
                ownerId: acting?.id ?? null,
                siteId: dto.siteId,
                categoryId: scope.categoryId,
                period: dto.period,
                target: dto.target,
                startsAt: dto.startsAt ? new Date(dto.startsAt) : new Date(),
                endsAt: dto.endsAt ? new Date(dto.endsAt) : null,
                timezone: dto.timezone || 'Europe/Paris',
                windowStart: dto.windowStart ?? 480,
                windowEnd: dto.windowEnd ?? 1320,
                priority: dto.priority ?? 0,
                notes: dto.notes ?? null,
                maxPerProfilePerDay: dto.maxPerProfilePerDay ?? null,
                activeProfiles: dto.activeProfiles ?? null,
                spread: dto.spread ?? false,
                rotationTeams: cleanTeams(dto.rotationTeams),
                groups: { create: scope.groupIds.map((groupId) => ({ groupId })) },
                profiles: { create: scope.profileIds.map((profileId) => ({ profileId })) },
                articles: { create: scope.articleIds.map((articleId) => ({ articleId })) },
            },
            include: CAMPAIGN_INCLUDE,
        });
        this.behindCache = null;
        this.dayCache = null;
        await this.log('CAMPAIGN_CREATED', `Campagne « ${c.name} » créée : ${c.target} publication(s) par ${this.periodName(c.period)} pour « ${c.site.name} »`, c.id, acting);
        return this.shape(c);
    }
    async update(id, dto, acting) {
        const current = await this.reachable(id, acting);
        const merged = {
            siteId: dto.siteId ?? current.siteId,
            categoryId: dto.categoryId === undefined ? current.categoryId : dto.categoryId,
            groupIds: dto.groupIds ?? current.groups.map((g) => g.group.id),
            profileIds: dto.profileIds ?? current.profiles.map((p) => p.profile.id),
            articleIds: dto.articleIds ?? current.articles.map((a) => a.article.id),
        };
        const scope = await this.checkScope(merged, acting);
        const c = await this.prisma.$transaction(async (tx) => {
            if (dto.groupIds) {
                await tx.campaignGroup.deleteMany({ where: { campaignId: id } });
                await tx.campaignGroup.createMany({ data: scope.groupIds.map((groupId) => ({ campaignId: id, groupId })) });
            }
            if (dto.profileIds) {
                await tx.campaignProfile.deleteMany({ where: { campaignId: id } });
                await tx.campaignProfile.createMany({ data: scope.profileIds.map((profileId) => ({ campaignId: id, profileId })) });
            }
            if (dto.articleIds) {
                await tx.campaignArticle.deleteMany({ where: { campaignId: id } });
                await tx.campaignArticle.createMany({ data: scope.articleIds.map((articleId) => ({ campaignId: id, articleId })) });
            }
            return tx.campaign.update({
                where: { id },
                data: {
                    name: dto.name?.trim(),
                    siteId: dto.siteId,
                    categoryId: dto.categoryId === undefined ? undefined : scope.categoryId,
                    status: dto.status,
                    period: dto.period,
                    target: dto.target,
                    startsAt: dto.startsAt ? new Date(dto.startsAt) : undefined,
                    endsAt: dto.endsAt === undefined ? undefined : dto.endsAt ? new Date(dto.endsAt) : null,
                    timezone: dto.timezone,
                    windowStart: dto.windowStart,
                    windowEnd: dto.windowEnd,
                    priority: dto.priority,
                    notes: dto.notes,
                    maxPerProfilePerDay: dto.maxPerProfilePerDay,
                    activeProfiles: dto.activeProfiles,
                    spread: dto.spread,
                    rotationTeams: dto.rotationTeams ? cleanTeams(dto.rotationTeams) : undefined,
                },
                include: CAMPAIGN_INCLUDE,
            });
        });
        this.behindCache = null;
        this.dayCache = null;
        await this.log('CAMPAIGN_UPDATED', `Campagne « ${c.name} » modifiée${dto.status ? ` (${dto.status === 'ACTIVE' ? 'active' : dto.status === 'PAUSED' ? 'en pause' : 'terminée'})` : ''}`, c.id, acting);
        return this.shape(c);
    }
    async remove(id, acting) {
        const c = await this.reachable(id, acting);
        await this.prisma.campaign.delete({ where: { id } });
        this.behindCache = null;
        this.dayCache = null;
        await this.log('CAMPAIGN_DELETED', `Campagne « ${c.name} » supprimée (posts et articles intacts)`, null, acting);
        return { deleted: id };
    }
    behindCache = null;
    async behind(now = new Date()) {
        if (this.behindCache && now.getTime() - this.behindCache.at < 120_000)
            return this.behindCache.rows;
        const rows = [];
        for (const c of await this.active(now)) {
            const p = await this.progress(c, now);
            if (!['late', 'on_track'].includes(p.status))
                continue;
            rows.push({ id: c.id, priority: c.priority, deficit: Math.max(0, p.expected - p.published), where: this.targetWhere(c), profileIds: c.profiles.map((x) => x.profile.id) });
        }
        rows.sort((a, b) => b.priority - a.priority || b.deficit - a.deficit);
        this.behindCache = { at: now.getTime(), rows };
        return rows;
    }
    async dailyTarget(now = new Date(), ownerId) {
        let total = 0;
        for (const c of await this.active(now, ownerId)) {
            const { days } = (0, period_1.periodBounds)(c.period, now, c.timezone);
            total += Math.ceil(c.target / days);
        }
        return total;
    }
    async pacingNeed(now = new Date(), ownerId) {
        const active = await this.active(now, ownerId);
        if (!active.length)
            return null;
        let neededPerHour = 0;
        let ratePerHour = 0;
        let late = false;
        for (const c of active) {
            const p = await this.progress(c, now);
            if (p.status === 'reached' || p.status === 'missed' || p.status === 'not_started')
                continue;
            neededPerHour += p.neededPerHour;
            ratePerHour += p.ratePerHour;
            if (p.status !== 'ahead')
                late = true;
        }
        return { neededPerHour, ratePerHour, status: (late ? 'late' : 'ahead') };
    }
    dayCache = null;
    async dayPlan(now = new Date()) {
        if (this.dayCache && now.getTime() - this.dayCache.at < 60_000)
            return this.dayCache.plan;
        const rows = await Promise.resolve(this.prisma.campaign?.findMany({
            where: { status: 'ACTIVE', startsAt: { lte: now }, OR: [{ endsAt: null }, { endsAt: { gt: now } }] },
            include: { ...CAMPAIGN_INCLUDE, owner: { select: { role: true } } },
        })).catch(() => null);
        const campaigns = [];
        for (const c of rows ?? []) {
            const pool = c.activeProfiles ? await this.pool(c, now) : null;
            const managed = c.rotationTeams.length > 0 || c.maxPerProfilePerDay != null || Boolean(pool);
            const used = new Map();
            if (c.maxPerProfilePerDay != null) {
                const day = (0, period_1.periodBounds)('day', now, c.timezone).from;
                const from = c.startsAt > day ? c.startsAt : day;
                const items = await this.prisma.publicationJobItem.findMany({
                    where: {
                        campaignId: c.id,
                        OR: [{ status: client_1.TargetStatus.PUBLISHED, publishedAt: { gte: from } }, { status: { in: [client_1.TargetStatus.CLAIMED, client_1.TargetStatus.CONSUMED] }, job: { status: 'CLAIMED' } }],
                    },
                    select: { job: { select: { profileId: true } } },
                });
                for (const i of items)
                    used.set(i.job.profileId, (used.get(i.job.profileId) ?? 0) + 1);
            }
            const p = await this.progress(c, now);
            const closed = (0, period_1.campaignGate)({
                now,
                timezone: c.timezone,
                windowStart: c.windowStart,
                windowEnd: c.windowEnd,
                target: c.target,
                published: p.published,
                expected: p.expected,
                spread: c.spread,
            });
            campaigns.push({
                id: c.id,
                name: c.name,
                closed,
                ownerId: c.ownerId,
                ownerIsAdmin: !c.ownerId || c.owner?.role === 'ADMIN',
                priority: c.priority,
                managed,
                profileIds: pool ? pool.active.map((p) => p.id) : c.profiles.map((p) => p.profile.id),
                standby: pool ? pool.standby.map((p) => p.id) : [],
                teamToday: (0, period_1.rotationTeamOf)(c.rotationTeams, c.startsAt, now, c.timezone)?.team ?? null,
                max: c.maxPerProfilePerDay,
                used,
                where: this.targetWhere(c),
                outside: this.outsideWhere(c),
            });
        }
        const plan = { campaigns };
        this.dayCache = { at: now.getTime(), plan };
        return plan;
    }
    profileDay(profile, plan, opts = {}) {
        const mine = plan.campaigns.filter((c) => c.ownerIsAdmin || c.ownerId === profile.ownerId);
        const closed = plan.campaigns.filter((c) => c.closed);
        const openWhere = plan.campaigns.filter((c) => !c.closed).map((c) => c.where);
        const closedClause = closed.length
            ? openWhere.length
                ? { AND: [{ OR: closed.map((c) => c.where) }, { NOT: { OR: openWhere } }] }
                : { OR: closed.map((c) => c.where) }
            : null;
        const outside = plan.campaigns.filter((c) => c.outside).map((c) => c.outside);
        const outsideClause = outside.length
            ? openWhere.length
                ? { AND: [{ OR: outside }, { NOT: { OR: openWhere } }] }
                : { OR: outside }
            : null;
        const notMine = plan.campaigns.filter((c) => c.profileIds.length && !c.profileIds.includes(profile.id));
        const acceptWhere = plan.campaigns
            .filter((c) => !c.closed && (!c.profileIds.length || c.profileIds.includes(profile.id)))
            .map((c) => c.where);
        const notMineClause = notMine.length
            ? acceptWhere.length
                ? { AND: [{ OR: notMine.map((c) => c.where) }, { NOT: { OR: acceptWhere } }] }
                : { OR: notMine.map((c) => c.where) }
            : null;
        const working = [];
        const blocking = [];
        for (const c of mine) {
            const inList = !c.profileIds.length || c.profileIds.includes(profile.id);
            const teamOk = !c.teamToday || c.teamToday === profile.team;
            const done = c.used.get(profile.id) ?? 0;
            const underMax = c.max == null || done < c.max;
            if (inList && teamOk && underMax && !c.closed)
                working.push(c);
            else if (c.managed && c.closed)
                blocking.push({ c, why: `« ${c.name} » ${c.closed}` });
            else if (c.managed)
                blocking.push({ c, why: !inList && c.standby?.includes(profile.id) ? `en réserve pour « ${c.name} » (${c.profileIds.length} profil(s) actifs)` : !inList ? `hors des profils de « ${c.name} »` : !teamOk ? `pas son équipe aujourd'hui (« ${c.name} »)` : `plafond du jour atteint pour « ${c.name} » (${done}/${c.max})` });
        }
        const strict = Boolean(opts.strict);
        const resting = (strict || mine.some((c) => c.managed)) && !working.length;
        const workWhere = working.map((c) => c.where);
        const offCampaign = strict
            ? { post: { articleId: { not: null } }, ...(workWhere.length ? { NOT: { OR: workWhere } } : {}) }
            : null;
        const parts = [
            ...(offCampaign ? [offCampaign] : []),
            ...blocking.map(({ c }) => (workWhere.length ? { AND: [c.where, { NOT: { OR: workWhere } }] } : c.where)),
            ...(closedClause ? [closedClause] : []),
            ...(outsideClause ? [outsideClause] : []),
            ...(notMineClause ? [notMineClause] : []),
        ];
        const exclude = parts.length ? { OR: parts } : null;
        const caps = working.filter((c) => c.max != null).map((c) => c.max - (c.used.get(profile.id) ?? 0));
        return {
            resting,
            reason: resting ? restReason(blocking.map((b) => b.why), mine.filter((c) => c.closed).map((c) => `« ${c.name} » ${c.closed}`)) : null,
            exclude,
            left: caps.length ? Math.max(0, Math.min(...caps)) : null,
            campaigns: working.map((c) => c.name),
            closed: [
                ...closed.filter((c) => mine.includes(c)).map((c) => `« ${c.name} » ${c.closed}`),
                ...notMine.filter((c) => mine.includes(c)).map((c) => `« ${c.name} » réservée à ses profils`),
            ],
        };
    }
    async assign(profile, targetIds, now = new Date()) {
        const out = new Map();
        if (!targetIds.length)
            return out;
        const plan = await this.dayPlan(now);
        const rank = new Map((await this.behind(now)).map((b, i) => [b.id, i]));
        const works = (c) => !c.closed && (c.ownerIsAdmin || c.ownerId === profile.ownerId) && (!c.profileIds.length || c.profileIds.includes(profile.id));
        const order = (a, b) => (rank.get(a.id) ?? Infinity) - (rank.get(b.id) ?? Infinity) || (b.priority ?? 0) - (a.priority ?? 0);
        const first = plan.campaigns.filter(works).sort(order);
        const rest = plan.campaigns.filter((c) => !works(c)).sort(order);
        let left = [...new Set(targetIds)];
        for (const c of [...first, ...rest]) {
            if (!left.length)
                break;
            const hit = await this.prisma.postTarget.findMany({ where: { AND: [{ id: { in: left } }, c.where] }, select: { id: true } });
            for (const t of hit)
                out.set(t.id, c.id);
            left = left.filter((id) => !out.has(id));
        }
        return out;
    }
    async backfill() {
        const done = await this.prisma.activityLog.findFirst({ where: { eventType: 'CAMPAIGN_ITEMS_BACKFILL' }, select: { id: true } });
        if (done)
            return;
        const since = new Date(Date.now() - 40 * 86_400_000);
        let total = 0;
        for (const c of await this.prisma.campaign.findMany({ include: CAMPAIGN_INCLUDE, orderBy: [{ startsAt: 'asc' }, { createdAt: 'asc' }] })) {
            const profileIds = c.profiles.map((p) => p.profile.id);
            const from = c.startsAt > since ? c.startsAt : since;
            const r = await this.prisma.publicationJobItem.updateMany({
                where: {
                    campaignId: null,
                    createdAt: { gte: from },
                    postTarget: this.targetWhere(c),
                    ...(profileIds.length ? { job: { profileId: { in: profileIds } } } : {}),
                },
                data: { campaignId: c.id },
            });
            total += r.count;
        }
        await this.prisma.activityLog.create({
            data: { eventType: 'CAMPAIGN_ITEMS_BACKFILL', message: `${total} publication(s) rattachée(s) à leur campagne`, metadata: { total } },
        });
        this.behindCache = null;
        this.dayCache = null;
    }
    async teams(acting) {
        const rows = await this.prisma.profile.groupBy({
            by: ['teamNstGroupId', 'teamNstGroupName'],
            where: { ...(0, scope_1.profileWhere)((0, scope_1.scopeOf)(acting)), teamNstGroupId: { not: null } },
            _count: { _all: true },
        });
        return rows
            .map((r) => ({ id: r.teamNstGroupId, name: r.teamNstGroupName ?? r.teamNstGroupId, profiles: r._count._all }))
            .sort((a, b) => String(a.name).localeCompare(String(b.name)));
    }
    active(now, ownerId) {
        return this.prisma.campaign.findMany({
            where: {
                status: 'ACTIVE',
                startsAt: { lte: now },
                OR: [{ endsAt: null }, { endsAt: { gt: now } }],
                ...(ownerId !== undefined ? { ownerId } : {}),
            },
            include: CAMPAIGN_INCLUDE,
        });
    }
    targetWhere(c) {
        const groupIds = c.groups.map((g) => g.group.id);
        const articleIds = c.articles.map((a) => a.article.id);
        return {
            post: { article: { sourceId: c.siteId, ...(articleIds.length ? { id: { in: articleIds } } : {}) } },
            ...(groupIds.length ? { groupId: { in: groupIds } } : c.categoryId ? { group: { categoryId: c.categoryId } } : {}),
        };
    }
    async capacity(c, progress, now) {
        const settings = await this.prisma.automationSetting
            .findUnique({ where: { id: 'global' }, select: { minPostGapMinutes: true } })
            .catch(() => null);
        const candidates = await this.candidates(c);
        const listed = c.activeProfiles ? (0, period_1.poolOf)(candidates, c.activeProfiles, now) : null;
        return (0, period_1.campaignCapacity)({
            candidates: listed ? candidates.filter((p) => listed.active.some((a) => a.id === p.id) || listed.unavailable.some((u) => u.id === p.id)) : candidates,
            now,
            minGap: settings?.minPostGapMinutes ?? 5,
            publishMinutes: objective_1.PUBLISH_MINUTES,
            ...progress,
        });
    }
    async pool(c, now) {
        const candidates = await this.candidates(c);
        return (0, period_1.poolOf)(candidates, c.activeProfiles ?? candidates.length, now);
    }
    async candidates(c) {
        const listed = c.profiles.map((p) => p.profile.id);
        const owner = c.ownerId && c.owner === undefined
            ? await this.prisma.user.findUnique({ where: { id: c.ownerId }, select: { role: true } })
            : c.owner ?? null;
        const manager = Boolean(c.ownerId && owner && owner.role !== 'ADMIN');
        const candidates = await this.prisma.profile.findMany({
            where: {
                isModerator: false,
                ...(listed.length
                    ? { id: { in: listed } }
                    : manager
                        ? { ownerId: c.ownerId }
                        : { OR: [{ ownerId: null }, { owner: { role: 'ADMIN' } }] }),
            },
            select: {
                id: true,
                name: true,
                createdAt: true,
                status: true,
                externalId: true,
                facebookSuspension: true,
                runner: { select: { mode: true, pausedUntil: true, running: true, lastSeenAt: true, browserState: true } },
            },
            orderBy: { createdAt: 'asc' },
        });
        return candidates;
    }
    outsideWhere(c) {
        const groupIds = c.groups.map((g) => g.group.id);
        const articleIds = c.articles.map((a) => a.article.id);
        const post = { article: { sourceId: c.siteId, ...(articleIds.length ? { id: { in: articleIds } } : {}) } };
        if (groupIds.length)
            return { post, groupId: { notIn: groupIds } };
        if (c.categoryId)
            return { post, group: { OR: [{ categoryId: null }, { categoryId: { not: c.categoryId } }] } };
        return null;
    }
    async publications(c, from, to) {
        const items = await this.prisma.publicationJobItem.findMany({
            where: {
                campaignId: c.id,
                status: client_1.TargetStatus.PUBLISHED,
                publishedAt: { gte: from, lt: to },
                postTarget: { approvalPendingSince: null },
            },
            select: { publishedAt: true, job: { select: { profileId: true } }, postTarget: { select: { groupId: true } }, post: { select: { articleId: true } } },
        });
        return items.map((i) => ({ publishedAt: i.publishedAt, profileId: i.job.profileId, groupId: i.postTarget.groupId, articleId: i.post.articleId }));
    }
    async progress(c, now) {
        const period = (0, period_1.periodBounds)(c.period, now, c.timezone);
        const from = c.startsAt > period.from ? c.startsAt : period.from;
        const to = period.to;
        const items = await this.publications(c, from, to);
        const hourAgo = now.getTime() - 3_600_000;
        const pace = (0, period_1.campaignPace)({
            period: c.period,
            target: c.target,
            published: items.length,
            lastHour: items.filter((i) => i.publishedAt && i.publishedAt.getTime() >= hourAgo).length,
            now,
            startsAt: c.startsAt,
            timezone: c.timezone,
            windowStart: c.windowStart,
            windowEnd: c.windowEnd,
        });
        const stock = await this.prisma.postTarget.count({
            where: { ...this.targetWhere(c), status: client_1.TargetStatus.AVAILABLE, post: { status: 'AVAILABLE', article: { sourceId: c.siteId, status: 'ACTIVE' } } },
        });
        const state = c.status === 'PAUSED' ? 'paused' : c.status === 'ENDED' || (c.endsAt && c.endsAt <= now) ? 'ended' : c.startsAt > now ? 'scheduled' : pace.status;
        return { ...pace, since: from, published: items.length, target: c.target, stock, deficit: Math.max(0, pace.remaining - stock), state };
    }
    async names(items) {
        const ids = (k) => [...new Set(items.map((i) => i[k]).filter((x) => Boolean(x)))];
        const [profiles, groups, articles] = await Promise.all([
            this.prisma.profile.findMany({ where: { id: { in: ids('profileId') } }, select: { id: true, name: true } }),
            this.prisma.group.findMany({ where: { id: { in: ids('groupId') } }, select: { id: true, name: true } }),
            this.prisma.article.findMany({ where: { id: { in: ids('articleId') } }, select: { id: true, title: true } }),
        ]);
        return {
            profiles: new Map(profiles.map((p) => [p.id, p.name])),
            groups: new Map(groups.map((g) => [g.id, g.name])),
            articles: new Map(articles.map((a) => [a.id, a.title])),
        };
    }
    async checkScope(dto, acting) {
        const scope = (0, scope_1.scopeOf)(acting);
        const site = await this.prisma.contentSource.findFirst({ where: { id: dto.siteId, ...(0, scope_1.siteWhere)(scope) }, select: { id: true, categoryId: true } });
        if (!site)
            throw new common_1.BadRequestException('Site introuvable : le site est obligatoire');
        const uniq = (xs) => [...new Set(xs ?? [])];
        const [groups, profiles, articles] = await Promise.all([
            this.prisma.group.findMany({ where: { id: { in: uniq(dto.groupIds) }, ...(0, scope_1.groupWhere)(scope) }, select: { id: true } }),
            this.prisma.profile.findMany({ where: { id: { in: uniq(dto.profileIds) }, ...(0, scope_1.profileWhere)(scope) }, select: { id: true } }),
            this.prisma.article.findMany({ where: { id: { in: uniq(dto.articleIds) }, sourceId: dto.siteId, ...(0, scope_1.articleWhere)(scope) }, select: { id: true } }),
        ]);
        if (groups.length !== uniq(dto.groupIds).length)
            throw new common_1.BadRequestException('Un groupe choisi est introuvable');
        if (profiles.length !== uniq(dto.profileIds).length)
            throw new common_1.BadRequestException('Un profil choisi est introuvable');
        if (articles.length !== uniq(dto.articleIds).length)
            throw new common_1.BadRequestException('Un article choisi n’est pas de ce site');
        return {
            categoryId: dto.categoryId === undefined ? site.categoryId : dto.categoryId,
            groupIds: groups.map((g) => g.id),
            profileIds: profiles.map((p) => p.id),
            articleIds: articles.map((a) => a.id),
        };
    }
    async reachable(id, acting) {
        const c = await this.prisma.campaign.findFirst({ where: { id, ...(0, scope_1.ownedWhere)((0, scope_1.scopeOf)(acting)) }, include: CAMPAIGN_INCLUDE });
        if (!c)
            throw new common_1.NotFoundException('Campagne introuvable');
        return c;
    }
    shape(c) {
        return {
            id: c.id,
            name: c.name,
            status: c.status,
            period: c.period,
            target: c.target,
            startsAt: c.startsAt,
            endsAt: c.endsAt,
            timezone: c.timezone,
            windowStart: c.windowStart,
            windowEnd: c.windowEnd,
            priority: c.priority,
            notes: c.notes,
            maxPerProfilePerDay: c.maxPerProfilePerDay,
            activeProfiles: c.activeProfiles,
            spread: c.spread,
            rotationTeams: c.rotationTeams,
            rotationToday: (0, period_1.rotationTeamOf)(c.rotationTeams, c.startsAt, new Date(), c.timezone),
            site: c.site,
            category: c.category,
            groups: c.groups.map((g) => g.group),
            profiles: c.profiles.map((p) => p.profile),
            articles: c.articles.map((a) => a.article),
        };
    }
    periodName(p) {
        return p === 'week' ? 'semaine' : p === 'month' ? 'mois' : 'jour';
    }
    log(eventType, message, campaignId, acting) {
        return this.prisma.activityLog.create({ data: { eventType, message, metadata: { campaignId, by: acting?.username ?? 'clé globale' } } });
    }
};
exports.CampaignsService = CampaignsService;
exports.CampaignsService = CampaignsService = CampaignsService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], CampaignsService);
function cleanTeams(teams) {
    return (teams ?? []).map((t) => t.trim()).filter(Boolean);
}
//# sourceMappingURL=campaigns.service.js.map