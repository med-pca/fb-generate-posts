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
exports.QueueService = void 0;
const common_1 = require("@nestjs/common");
const client_1 = require("@prisma/client");
const prisma_service_1 = require("../prisma/prisma.service");
const scope_1 = require("../auth/scope");
const jobs_service_1 = require("../jobs/jobs.service");
const trace_1 = require("../trace/trace");
const POST_FIELDS = {
    id: true,
    title: true,
    description: true,
    imageUrl: true,
    priority: true,
    createdAt: true,
    article: { select: { id: true, title: true } },
};
const GROUP_FIELDS = {
    id: true,
    name: true,
    url: true,
    category: { select: { id: true, name: true } },
};
const PROFILE_FIELDS = { id: true, name: true, externalId: true };
const GROUP_WITH_CANDIDATES = {
    select: {
        ...GROUP_FIELDS,
        profiles: {
            where: { status: 'ACTIVE', joinStatus: 'JOINED' },
            select: { profile: { select: PROFILE_FIELDS } },
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
    constructor(prisma) {
        this.prisma = prisma;
    }
    async queue(query, acting) {
        const now = new Date();
        const scope = (0, scope_1.postWhere)((0, scope_1.scopeOf)(acting));
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
                    { OR: [{ articleId: null }, { article: { status: 'ACTIVE' } }] },
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
                    { post: { priority: 'desc' } },
                    { post: { createdAt: 'asc' } },
                    { createdAt: 'asc' },
                ],
                take: query.limit,
                select: {
                    id: true,
                    forcedAt: true,
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
                    facebookUrl: true,
                    post: { select: { ...POST_FIELDS, url: true } },
                    group: { select: GROUP_FIELDS },
                    jobItems: {
                        where: { status: client_1.TargetStatus.PUBLISHED },
                        orderBy: { publishedAt: 'desc' },
                        take: 1,
                        select: {
                            externalPostUrl: true,
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
                profile: row.jobItems[0]?.job.profile ?? null,
                jobId: row.jobItems[0]?.job.id ?? null,
            })),
            upcoming: upcomingRows.map((row, index) => ({
                rank: index + 1,
                targetId: row.id,
                post: row.post,
                group: withoutCandidates(row.group),
                candidates: row.group.profiles.map(({ profile }) => profile),
                forcedProfile: row.forcedProfile,
                forcedAt: row.forcedAt,
            })),
            failed: failedRows.map((row) => ({
                targetId: row.id,
                failedAt: row.updatedAt,
                attempts: row.attemptsCount,
                error: row.lastError ?? row.jobItems[0]?.error ?? 'Échec sans message',
                post: row.post,
                group: withoutCandidates(row.group),
                profile: row.jobItems[0]?.job.profile ?? null,
                candidates: row.group.profiles.map(({ profile }) => profile),
            })),
            published: publishedRows.map((row) => {
                const item = row.jobItems[0];
                return {
                    targetId: row.id,
                    publishedAt: row.publishedAt ?? item?.publishedAt ?? null,
                    post: row.post,
                    group: row.group,
                    profile: item?.job.profile ?? null,
                    facebookUrl: row.facebookUrl ?? item?.externalPostUrl ?? null,
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
        const url = (0, trace_1.normalizeFacebookUrl)(raw);
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
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], QueueService);
//# sourceMappingURL=queue.service.js.map