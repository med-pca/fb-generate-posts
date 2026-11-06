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
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.QueueService = void 0;
const common_1 = require("@nestjs/common");
const client_1 = require("@prisma/client");
const prisma_service_1 = require("../prisma/prisma.service");
const scope_1 = require("../auth/scope");
const rescue_service_1 = require("../jobs/rescue.service");
const jobs_service_1 = require("../jobs/jobs.service");
const claimable_1 = require("../jobs/claimable");
const link_why_1 = require("./link-why");
const trace_1 = require("../trace/trace");
const POST_FIELDS = {
    id: true,
    title: true,
    description: true,
    imageUrl: true,
    priority: true,
    createdAt: true,
    article: { select: { id: true, title: true, source: { select: { access: { select: { userId: true } } } } } },
    visualId: true,
    noComment: true,
    ownerId: true,
    profileId: true,
    owner: { select: { role: true } },
};
const GROUP_FIELDS = {
    id: true,
    name: true,
    url: true,
    category: { select: { id: true, name: true } },
};
const PROFILE_FIELDS = { id: true, name: true, externalId: true };
function candidatesFor(post, group) {
    return group.profiles
        .map(({ profile }) => profile)
        .filter((p) => (0, jobs_service_1.mayPublishPost)(p, post))
        .map(({ id, name, externalId }) => ({ id, name, externalId }));
}
const GROUP_WITH_CANDIDATES = {
    select: {
        ...GROUP_FIELDS,
        profiles: {
            where: { status: 'ACTIVE', joinStatus: 'JOINED' },
            select: { profile: { select: { ...PROFILE_FIELDS, ownerId: true, owner: { select: { role: true } } } } },
        },
        _count: {
            select: {
                profiles: {
                    where: {
                        status: 'ACTIVE',
                        joinStatus: { in: ['REQUESTED', 'QUESTIONS'] },
                    },
                },
            },
        },
    },
};
const by = (acting) => acting?.username ?? 'clé globale';
let QueueService = class QueueService {
    prisma;
    rescue;
    constructor(prisma, rescue) {
        this.prisma = prisma;
        this.rescue = rescue;
    }
    async queue(query, acting) {
        const now = new Date();
        const scope = query.siteId
            ? { AND: [(0, scope_1.postWhere)((0, scope_1.scopeOf)(acting)), { article: { sourceId: query.siteId } }] }
            : (0, scope_1.postWhere)((0, scope_1.scopeOf)(acting));
        const group = query.categoryId
            ? { categoryId: query.categoryId }
            : {};
        const base = {
            ...(query.groupId ? { groupId: query.groupId } : {}),
            post: scope,
            group,
        };
        const running = {
            ...base,
            OR: [
                { status: client_1.TargetStatus.CLAIMED, claimExpiresAt: { gt: now } },
                { status: client_1.TargetStatus.CONSUMED },
            ],
        };
        const upcoming = {
            ...base,
            status: client_1.TargetStatus.AVAILABLE,
            group: { ...group, status: 'ACTIVE' },
            post: {
                AND: [
                    scope,
                    { status: 'AVAILABLE' },
                    claimable_1.publishableArticleWhere,
                ],
            },
        };
        const published = {
            ...base,
            status: client_1.TargetStatus.PUBLISHED,
        };
        const failed = {
            ...base,
            status: client_1.TargetStatus.FAILED,
        };
        const [runningRows, upcomingRows, failedRows, publishedRows, counts] = await Promise.all([
            this.prisma.postTarget.findMany({
                where: running,
                orderBy: { claimedAt: 'asc' },
                take: 50,
                select: {
                    id: true,
                    status: true,
                    claimedAt: true,
                    claimExpiresAt: true,
                    post: { select: POST_FIELDS },
                    group: { select: GROUP_FIELDS },
                    jobItems: {
                        where: {
                            status: { in: [client_1.TargetStatus.CLAIMED, client_1.TargetStatus.CONSUMED] },
                        },
                        orderBy: { createdAt: 'desc' },
                        take: 1,
                        select: {
                            job: {
                                select: { id: true, profile: { select: PROFILE_FIELDS } },
                            },
                        },
                    },
                },
            }),
            this.prisma.postTarget.findMany({
                where: upcoming,
                orderBy: [
                    { forcedProfileId: { sort: 'asc', nulls: 'last' } },
                    { group: { priority: 'desc' } },
                    { post: { priority: 'desc' } },
                    { post: { createdAt: 'asc' } },
                    { createdAt: 'asc' },
                ],
                take: query.limit,
                select: {
                    id: true,
                    forcedAt: true,
                    repeatRound: true,
                    avoidProfileId: true,
                    forcedProfile: { select: PROFILE_FIELDS },
                    post: { select: POST_FIELDS },
                    group: GROUP_WITH_CANDIDATES,
                },
            }),
            this.prisma.postTarget.findMany({
                where: failed,
                orderBy: { updatedAt: 'desc' },
                take: 50,
                select: {
                    id: true,
                    lastError: true,
                    attemptsCount: true,
                    updatedAt: true,
                    post: { select: POST_FIELDS },
                    group: GROUP_WITH_CANDIDATES,
                    jobItems: {
                        where: { status: client_1.TargetStatus.FAILED },
                        orderBy: { updatedAt: 'desc' },
                        take: 1,
                        select: {
                            error: true,
                            job: { select: { profile: { select: PROFILE_FIELDS } } },
                        },
                    },
                },
            }),
            this.prisma.postTarget.findMany({
                where: published,
                orderBy: { publishedAt: 'desc' },
                take: query.publishedLimit,
                select: {
                    id: true,
                    publishedAt: true,
                    commentedAt: true,
                    linkUpdatedAt: true,
                    verifyStatus: true,
                    verifiedAt: true,
                    verifyDetail: true,
                    republishCount: true,
                    repeatRound: true,
                    facebookUrl: true,
                    approvalPendingSince: true,
                    rescueStatus: true,
                    rescueDetail: true,
                    post: { select: { ...POST_FIELDS, url: true } },
                    group: { select: GROUP_FIELDS },
                    jobItems: {
                        where: { status: client_1.TargetStatus.PUBLISHED },
                        orderBy: { publishedAt: 'desc' },
                        take: 1,
                        select: {
                            externalPostUrl: true,
                            error: true,
                            publishedAt: true,
                            job: { select: { profile: { select: PROFILE_FIELDS } } },
                        },
                    },
                },
            }),
            Promise.all([
                this.prisma.postTarget.count({ where: running }),
                this.prisma.postTarget.count({ where: upcoming }),
                this.prisma.postTarget.count({ where: published }),
                this.prisma.postTarget.count({ where: failed }),
            ]),
        ]);
        const withoutCandidates = (g) => {
            const { profiles, _count, ...rest } = g;
            void profiles;
            return { ...rest, pendingJoins: _count.profiles };
        };
        const own = (0, scope_1.scopeOf)(acting);
        const mine = own
            ? new Set((await this.prisma.profile.findMany({ where: { ownerId: own.ownerId }, select: { id: true } })).map((p) => p.id))
            : null;
        const visible = (p) => !p || !mine || mine.has(p.id) ? p ?? null : { id: null, name: 'Profil d’un autre compte', externalId: null };
        const candidates = (post, group) => candidatesFor(post, group).filter((p) => !mine || mine.has(p.id));
        return {
            counts: {
                running: counts[0],
                upcoming: counts[1],
                published: counts[2],
                failed: counts[3],
            },
            running: runningRows.map((row) => ({
                targetId: row.id,
                state: row.status === client_1.TargetStatus.CONSUMED ? 'publishing' : 'claimed',
                since: row.claimedAt,
                expiresAt: row.claimExpiresAt,
                post: row.post,
                group: row.group,
                profile: visible(row.jobItems[0]?.job.profile),
                jobId: row.jobItems[0]?.job.id ?? null,
            })),
            upcoming: upcomingRows.map((row, index) => ({
                rank: index + 1,
                targetId: row.id,
                post: row.post,
                group: withoutCandidates(row.group),
                candidates: candidates(row.post, row.group).filter((p) => p.id !== row.avoidProfileId),
                avoidProfile: visible(row.group.profiles.map(({ profile }) => profile).find((p) => p.id === row.avoidProfileId)),
                forcedProfile: visible(row.forcedProfile),
                forcedAt: row.forcedAt,
                repeatRound: row.repeatRound,
            })),
            failed: failedRows.map((row) => ({
                targetId: row.id,
                failedAt: row.updatedAt,
                attempts: row.attemptsCount,
                error: row.lastError ?? row.jobItems[0]?.error ?? 'Échec sans message',
                post: row.post,
                group: withoutCandidates(row.group),
                profile: visible(row.jobItems[0]?.job.profile),
                candidates: candidates(row.post, row.group),
            })),
            published: publishedRows.map((row) => {
                const item = row.jobItems[0];
                return {
                    targetId: row.id,
                    publishedAt: row.publishedAt ?? item?.publishedAt ?? null,
                    post: row.post,
                    group: row.group,
                    profile: visible(item?.job.profile),
                    facebookUrl: row.facebookUrl ?? item?.externalPostUrl ?? null,
                    repeatRound: row.repeatRound,
                    verify: {
                        status: row.verifyStatus,
                        at: row.verifiedAt,
                        detail: row.verifyDetail,
                        republishCount: row.republishCount,
                    },
                    link: row.linkUpdatedAt
                        ? 'placed'
                        : row.commentedAt
                            ? 'waiting'
                            : row.post.url
                                ? 'missing'
                                : 'none',
                    why: !row.linkUpdatedAt && !row.commentedAt && row.post.url
                        ? (0, link_why_1.missingWhy)({ ...row, facebookUrl: row.facebookUrl ?? item?.externalPostUrl ?? null })
                        : null,
                };
            }),
        };
    }
    async target(targetId, acting) {
        const target = await this.prisma.postTarget.findFirst({
            where: { id: targetId, post: (0, scope_1.postWhere)((0, scope_1.scopeOf)(acting)) },
            select: {
                id: true,
                status: true,
                claimExpiresAt: true,
                groupId: true,
                postId: true,
                facebookUrl: true,
                post: { select: { title: true } },
                group: { select: { name: true } },
            },
        });
        if (!target)
            throw new common_1.NotFoundException('Publication introuvable');
        return target;
    }
    locked(target) {
        return (target.status === client_1.TargetStatus.PUBLISHED ||
            target.status === client_1.TargetStatus.CONSUMED ||
            (target.status === client_1.TargetStatus.CLAIMED &&
                (target.claimExpiresAt?.getTime() ?? 0) > Date.now()));
    }
    async retry(targetId, acting) {
        const target = await this.target(targetId, acting);
        if (target.status !== client_1.TargetStatus.FAILED) {
            throw new common_1.ConflictException('Seule une publication en échec se relance');
        }
        await this.prisma.$transaction([
            this.prisma.postTarget.update({
                where: { id: target.id },
                data: {
                    status: client_1.TargetStatus.AVAILABLE,
                    lastError: null,
                    claimedAt: null,
                    claimExpiresAt: null,
                },
            }),
            this.prisma.activityLog.create({
                data: {
                    postId: target.postId,
                    groupId: target.groupId,
                    postTargetId: target.id,
                    eventType: 'TARGET_RETRIED',
                    message: `« ${target.post.title} » relancé dans « ${target.group.name} »`,
                    metadata: { by: by(acting) },
                },
            }),
            (0, trace_1.trace)(this.prisma, { postTargetId: target.id, kind: 'RETRIED', actor: by(acting) }),
        ]);
        return { targetId: target.id, status: client_1.TargetStatus.AVAILABLE };
    }
    async markPublished(targetId, acting, rawUrl) {
        const target = await this.target(targetId, acting);
        if (target.status !== client_1.TargetStatus.FAILED) {
            throw new common_1.ConflictException('Seule une publication en échec se marque « déjà en ligne »');
        }
        const facebookUrl = rawUrl ? this.facebookUrl(rawUrl) : null;
        const now = new Date();
        await this.prisma.$transaction([
            this.prisma.postTarget.update({
                where: { id: target.id },
                data: { status: client_1.TargetStatus.PUBLISHED, publishedAt: now, lastError: null, facebookUrl },
            }),
            (0, trace_1.trace)(this.prisma, {
                postTargetId: target.id,
                kind: 'MARKED_PUBLISHED',
                facebookUrl,
                actor: by(acting),
                detail: facebookUrl ? null : 'sans adresse : le vérificateur la cherchera dans le groupe',
            }),
            this.prisma.activityLog.create({
                data: {
                    postId: target.postId,
                    groupId: target.groupId,
                    postTargetId: target.id,
                    facebookUrl,
                    eventType: 'TARGET_MARKED_PUBLISHED',
                    message: `« ${target.post.title} » marqué déjà en ligne dans « ${target.group.name} » (sans republier)`,
                    metadata: { by: acting?.username ?? 'clé globale' },
                },
            }),
        ]);
        return { targetId: target.id, status: client_1.TargetStatus.PUBLISHED };
    }
    facebookUrl(raw) {
        const url = (0, trace_1.normalizeFacebookUrl)((0, trace_1.canonicalGroupPostUrl)(raw) ?? raw);
        if (!url)
            throw new common_1.BadRequestException('Ce n’est pas une adresse de post Facebook');
        return url;
    }
    async setFacebookUrl(targetId, rawUrl, acting) {
        const target = await this.target(targetId, acting);
        if (target.status !== client_1.TargetStatus.PUBLISHED) {
            throw new common_1.ConflictException('Seule une publication publiée a une adresse Facebook');
        }
        const facebookUrl = this.facebookUrl(rawUrl);
        await this.prisma.$transaction([
            this.prisma.postTarget.update({ where: { id: target.id }, data: { facebookUrl } }),
            this.prisma.activityLog.create({
                data: {
                    postId: target.postId,
                    groupId: target.groupId,
                    postTargetId: target.id,
                    facebookUrl,
                    eventType: 'TARGET_URL_SET',
                    message: `Adresse Facebook de « ${target.post.title} » dans « ${target.group.name} » enregistrée à la main : ${facebookUrl}`,
                    metadata: { by: by(acting), previous: target.facebookUrl ?? null },
                },
            }),
            (0, trace_1.trace)(this.prisma, {
                postTargetId: target.id,
                kind: 'URL_SET',
                facebookUrl,
                actor: by(acting),
                detail: target.facebookUrl && target.facebookUrl !== facebookUrl ? `remplace ${target.facebookUrl}` : null,
            }),
        ]);
        return { targetId: target.id, facebookUrl };
    }
    async history(targetId, acting) {
        const target = await this.prisma.postTarget.findFirst({
            where: { id: targetId, post: (0, scope_1.postWhere)((0, scope_1.scopeOf)(acting)) },
            select: {
                id: true,
                status: true,
                facebookUrl: true,
                publishedAt: true,
                verifyStatus: true,
                verifyDetail: true,
                verifiedAt: true,
                republishCount: true,
                repeatRound: true,
                attemptsCount: true,
                post: { select: { id: true, title: true, imageUrl: true, url: true } },
                group: { select: { id: true, name: true, url: true } },
                traces: { orderBy: { createdAt: 'asc' } },
                jobItems: {
                    orderBy: { createdAt: 'asc' },
                    select: {
                        status: true,
                        externalPostUrl: true,
                        publishedAt: true,
                        commentExternalId: true,
                        linkUpdatedAt: true,
                        error: true,
                        createdAt: true,
                        job: { select: { id: true, profile: { select: { id: true, name: true } } } },
                    },
                },
            },
        });
        if (!target)
            throw new common_1.NotFoundException('Publication introuvable');
        const { traces, jobItems, ...rest } = target;
        return {
            ...rest,
            attempts: jobItems.map((i) => ({
                at: i.createdAt,
                status: i.status,
                profile: i.job.profile,
                jobId: i.job.id,
                facebookUrl: i.externalPostUrl,
                publishedAt: i.publishedAt,
                commentId: i.commentExternalId,
                linkPlacedAt: i.linkUpdatedAt,
                error: i.error,
            })),
            events: traces.map((t) => ({
                at: t.createdAt,
                kind: t.kind,
                label: trace_1.TRACE_KINDS[t.kind] ?? t.kind,
                facebookUrl: t.facebookUrl,
                actor: t.actor,
                detail: t.detail,
            })),
        };
    }
    async findByUrl(rawUrl, acting) {
        const url = this.facebookUrl(rawUrl);
        const rows = await this.prisma.postTarget.findMany({
            where: {
                post: (0, scope_1.postWhere)((0, scope_1.scopeOf)(acting)),
                OR: [
                    { facebookUrl: url },
                    { traces: { some: { facebookUrl: url } } },
                    { jobItems: { some: { externalPostUrl: url } } },
                ],
            },
            take: 10,
            select: {
                id: true,
                status: true,
                facebookUrl: true,
                verifyStatus: true,
                post: { select: { id: true, title: true } },
                group: { select: { id: true, name: true } },
            },
        });
        return rows.map((r) => ({ ...r, targetId: r.id, current: r.facebookUrl === url }));
    }
    attachableWhere(groupIds, acting) {
        return {
            groupId: { in: groupIds },
            post: (0, scope_1.postWhere)((0, scope_1.scopeOf)(acting)),
            OR: [
                { status: client_1.TargetStatus.PUBLISHED, facebookUrl: null },
                { status: client_1.TargetStatus.FAILED },
                { status: client_1.TargetStatus.AVAILABLE },
                { status: client_1.TargetStatus.CLAIMED, claimExpiresAt: { lt: new Date() } },
            ],
        };
    }
    async attachUrl(rawUrl, targetId, acting) {
        const url = this.facebookUrl(rawUrl);
        const known = await this.findByUrl(url, acting);
        if (known.length)
            return { result: 'known', facebookUrl: url, targets: known };
        const key = (0, trace_1.groupKeyOf)(url);
        if (!key) {
            throw new common_1.BadRequestException('Ce lien ne dit pas dans quel groupe est le post : ouvrez le post dans son groupe, puis copiez le lien de sa date (…/groups/…/posts/…) ou de sa photo');
        }
        const groups = (await this.prisma.group.findMany({
            where: {
                ...(0, scope_1.groupWhere)((0, scope_1.scopeOf)(acting)),
                OR: [{ externalId: { equals: key, mode: 'insensitive' } }, { url: { contains: `/groups/${key}`, mode: 'insensitive' } }],
            },
            select: { id: true, name: true, url: true, externalId: true },
        })).filter((g) => g.externalId?.toLowerCase() === key || (0, trace_1.groupKeyOf)(g.url) === key);
        if (!groups.length)
            throw new common_1.NotFoundException('Aucun de vos groupes ne correspond à ce lien');
        const where = this.attachableWhere(groups.map((g) => g.id), acting);
        if (targetId)
            return this.attach(targetId, url, where, acting);
        const rows = await this.prisma.postTarget.findMany({
            where,
            take: 50,
            orderBy: { updatedAt: 'desc' },
            select: {
                id: true,
                status: true,
                publishedAt: true,
                updatedAt: true,
                lastError: true,
                approvalPendingSince: true,
                post: { select: { id: true, title: true, imageUrl: true } },
                group: { select: { id: true, name: true } },
            },
        });
        const rank = (s) => (s === client_1.TargetStatus.PUBLISHED ? 0 : s === client_1.TargetStatus.FAILED ? 1 : 2);
        const candidates = rows
            .sort((a, b) => rank(a.status) - rank(b.status) || b.updatedAt.getTime() - a.updatedAt.getTime())
            .slice(0, 8)
            .map(({ id, ...r }) => ({ ...r, targetId: id, missingLink: rank(r.status) < 2 }));
        const missing = candidates.filter((c) => c.missingLink);
        if (missing.length === 1)
            return this.attach(missing[0].targetId, url, where, acting);
        return { result: 'choose', facebookUrl: url, groups: groups.map((g) => g.name), candidates };
    }
    async attach(targetId, url, where, acting) {
        const target = await this.prisma.postTarget.findFirst({
            where: { AND: [where, { id: targetId }] },
            select: {
                id: true,
                status: true,
                postId: true,
                groupId: true,
                publishedAt: true,
                linkUpdatedAt: true,
                rescueStatus: true,
                post: { select: { title: true, url: true, noComment: true } },
                group: { select: { name: true } },
            },
        });
        if (!target)
            throw new common_1.NotFoundException('Cette publication ne peut pas recevoir ce lien');
        const now = new Date();
        await this.prisma.$transaction([
            this.prisma.postTarget.update({
                where: { id: target.id },
                data: {
                    status: client_1.TargetStatus.PUBLISHED,
                    publishedAt: target.publishedAt ?? now,
                    facebookUrl: url,
                    lastError: null,
                    claimedAt: null,
                    claimExpiresAt: null,
                    forcedProfileId: null,
                    forcedAt: null,
                    approvalPendingSince: null,
                    verifyStatus: null,
                    verifyDetail: null,
                    verifyClaimedUntil: null,
                    ...(target.rescueStatus === 'failed' ? { rescueStatus: null } : {}),
                },
            }),
            (0, trace_1.trace)(this.prisma, {
                postTargetId: target.id,
                kind: 'URL_ATTACHED',
                facebookUrl: url,
                actor: by(acting),
                detail: `était ${target.status}`,
            }),
            this.prisma.activityLog.create({
                data: {
                    postId: target.postId,
                    groupId: target.groupId,
                    postTargetId: target.id,
                    facebookUrl: url,
                    eventType: 'TARGET_URL_ATTACHED',
                    message: `Lien collé à la main pour « ${target.post.title} » dans « ${target.group.name} » : ${url}`,
                    metadata: { by: by(acting), previousStatus: target.status },
                },
            }),
        ]);
        let rescue = false;
        if (target.post.url && !target.post.noComment && !target.linkUpdatedAt) {
            rescue = (await this.rescue?.request(target.id, 'publié à la main : le lien de l’article reste à poser en commentaire', now).catch(() => false)) ?? false;
        }
        return {
            result: 'attached',
            facebookUrl: url,
            targetId: target.id,
            previousStatus: target.status,
            post: { title: target.post.title },
            group: { name: target.group.name },
            rescue,
        };
    }
    async removeTarget(targetId, acting) {
        const target = await this.target(targetId, acting);
        if (this.locked(target)) {
            throw new common_1.ConflictException('Cette publication est faite ou en cours : elle ne se retire pas');
        }
        const remaining = await this.prisma.postTarget.count({
            where: { postId: target.postId, id: { not: target.id } },
        });
        await this.prisma.$transaction([
            remaining
                ? this.prisma.postTarget.delete({ where: { id: target.id } })
                : this.prisma.post.delete({ where: { id: target.postId } }),
            this.prisma.activityLog.create({
                data: {
                    groupId: target.groupId,
                    eventType: 'TARGET_REMOVED',
                    level: 'WARN',
                    message: remaining
                        ? `« ${target.post.title} » retiré de « ${target.group.name} »`
                        : `« ${target.post.title} » supprimé : il ne visait que « ${target.group.name} »`,
                    metadata: { postId: target.postId, by: by(acting) },
                },
            }),
        ]);
        return { removed: true, postDeleted: !remaining };
    }
    async force(targetId, profileId, acting) {
        const target = await this.target(targetId, acting);
        if (this.locked(target)) {
            throw new common_1.ConflictException('Cette publication est faite ou déjà en cours');
        }
        if (!profileId) {
            await this.prisma.postTarget.update({
                where: { id: target.id },
                data: { forcedProfileId: null, forcedAt: null },
            });
            return { targetId: target.id, forcedProfile: null, warning: null };
        }
        const profile = await this.prisma.profile.findFirst({
            where: {
                id: profileId,
                status: 'ACTIVE',
                ...(0, scope_1.profileWhere)((0, scope_1.scopeOf)(acting)),
            },
            select: {
                id: true,
                name: true,
                ownerId: true,
                owner: { select: { role: true } },
                runner: { select: { mode: true } },
                profileGroups: {
                    where: {
                        groupId: target.groupId,
                        status: 'ACTIVE',
                        joinStatus: 'JOINED',
                    },
                    select: { id: true },
                },
            },
        });
        if (!profile)
            throw new common_1.NotFoundException('Profil introuvable ou inactif');
        if (!profile.profileGroups.length) {
            throw new common_1.BadRequestException(`${profile.name} n'a pas rejoint « ${target.group.name} »`);
        }
        const allowed = await this.prisma.post.count({
            where: { id: target.postId, ...(0, jobs_service_1.claimablePostWhere)(profile) },
        });
        if (!allowed) {
            throw new common_1.BadRequestException(`${profile.name} ne peut pas publier ce post`);
        }
        await this.prisma.$transaction([
            this.prisma.postTarget.update({
                where: { id: target.id },
                data: {
                    forcedProfileId: profile.id,
                    forcedAt: new Date(),
                    status: client_1.TargetStatus.AVAILABLE,
                    lastError: null,
                    claimedAt: null,
                    claimExpiresAt: null,
                },
            }),
            this.prisma.activityLog.create({
                data: {
                    profileId: profile.id,
                    groupId: target.groupId,
                    postTargetId: target.id,
                    eventType: 'TARGET_FORCED',
                    message: `« ${target.post.title} » sera publié par ${profile.name} dans « ${target.group.name} » à son prochain passage`,
                    metadata: { by: by(acting) },
                },
            }),
        ]);
        const mode = profile.runner?.mode ?? 'OFF';
        return {
            targetId: target.id,
            forcedProfile: { id: profile.id, name: profile.name },
            runnerMode: mode,
            warning: mode === 'OFF'
                ? `${profile.name} est à l'arrêt dans le Pilotage : il ne passera pas tant qu'il n'est pas allumé.`
                : null,
        };
    }
    async setPriority(id, dto, acting) {
        const scope = (0, scope_1.postWhere)((0, scope_1.scopeOf)(acting));
        const post = await this.prisma.post.findFirst({
            where: { id, ...scope },
            select: { id: true, priority: true },
        });
        if (!post)
            throw new common_1.NotFoundException('Post introuvable');
        let priority;
        if (dto.priority !== undefined)
            priority = dto.priority;
        else if (dto.move === 'top') {
            const top = await this.prisma.post.aggregate({
                where: { ...scope, status: 'AVAILABLE', id: { not: id } },
                _max: { priority: true },
            });
            priority = Math.max(post.priority, (top._max.priority ?? 0) + 1);
        }
        else if (dto.move === 'up')
            priority = post.priority + 1;
        else if (dto.move === 'down')
            priority = post.priority - 1;
        else if (dto.move === 'reset')
            priority = 0;
        else
            throw new common_1.BadRequestException('Indiquer move ou priority');
        priority = Math.max(-1000, Math.min(1000, priority));
        return this.prisma.post.update({
            where: { id },
            data: { priority },
            select: { id: true, priority: true },
        });
    }
};
exports.QueueService = QueueService;
exports.QueueService = QueueService = __decorate([
    (0, common_1.Injectable)(),
    __param(1, (0, common_1.Optional)()),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        rescue_service_1.RescueService])
], QueueService);
//# sourceMappingURL=queue.service.js.map