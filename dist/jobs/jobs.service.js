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
exports.JobsService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const client_1 = require("@prisma/client");
const prisma_service_1 = require("../prisma/prisma.service");
const settings_service_1 = require("../settings/settings.service");
let JobsService = class JobsService {
    prisma;
    config;
    settings;
    constructor(prisma, config, settings) {
        this.prisma = prisma;
        this.config = config;
        this.settings = settings;
    }
    listAutomationProfiles() {
        return this.prisma.profile.findMany({
            where: { status: 'ACTIVE', externalId: { not: null } },
            select: { id: true, name: true, externalId: true },
            orderBy: { createdAt: 'asc' },
        });
    }
    async claim(dto) {
        const profile = await this.prisma.profile.findFirst({
            where: { id: dto.profileId, status: 'ACTIVE' },
        });
        if (!profile)
            throw new common_1.NotFoundException('Profil introuvable');
        const group = await this.prisma.group.findFirst({
            where: {
                id: dto.groupId,
                status: 'ACTIVE',
                profiles: {
                    some: { profileId: dto.profileId, status: 'ACTIVE' },
                },
            },
        });
        if (!group)
            throw new common_1.NotFoundException('Groupe introuvable pour ce profil');
        const count = this.randomInt(profile.minPostsPerJob, profile.maxPostsPerJob);
        const ttlMinutes = this.config.get('CLAIM_TTL_MINUTES', 30);
        const claimExpiresAt = new Date(Date.now() + ttlMinutes * 60_000);
        const job = await this.prisma.$transaction(async (tx) => {
            await this.releaseExpiredClaims(tx);
            const targets = await tx.$queryRaw(client_1.Prisma.sql `
        SELECT pt.id, pt.post_id AS "postId"
        FROM post_targets pt
        INNER JOIN posts p ON p.id = pt.post_id
        INNER JOIN profiles pr ON pr.id = p.profile_id
        INNER JOIN groups g ON g.id = pt.group_id
        LEFT JOIN articles a ON a.id = p.article_id
        WHERE pt.group_id = ${dto.groupId}
          AND pt.status = 'AVAILABLE'::"TargetStatus"
          AND p.profile_id = ${dto.profileId}
          AND p.status = 'AVAILABLE'::"PostStatus"
          AND pr.status = 'ACTIVE'::"RecordStatus"
          AND g.status = 'ACTIVE'::"RecordStatus"
          AND (p.article_id IS NULL OR a.status = 'ACTIVE'::"RecordStatus")
        ORDER BY RANDOM()
        FOR UPDATE OF pt SKIP LOCKED
        LIMIT ${count}
      `);
            if (targets.length === 0)
                return null;
            const targetIds = targets.map((target) => target.id);
            await tx.postTarget.updateMany({
                where: { id: { in: targetIds }, status: client_1.TargetStatus.AVAILABLE },
                data: {
                    status: client_1.TargetStatus.CLAIMED,
                    claimedAt: new Date(),
                    claimExpiresAt,
                    attemptsCount: { increment: 1 },
                },
            });
            return tx.publicationJob.create({
                data: {
                    profileId: dto.profileId,
                    groupId: dto.groupId,
                    claimExpiresAt,
                    items: {
                        create: targets.map((target) => ({
                            postId: target.postId,
                            postTargetId: target.id,
                        })),
                    },
                    logs: {
                        create: {
                            profileId: dto.profileId,
                            groupId: dto.groupId,
                            eventType: 'JOB_CLAIMED',
                            message: `${targets.length} post(s) réservé(s)`,
                            metadata: { requestedCount: count },
                        },
                    },
                },
                include: {
                    profile: true,
                    group: true,
                    items: { include: { post: true } },
                },
            });
        });
        if (!job)
            return { job: null, posts: [] };
        return {
            jobId: job.id,
            claimExpiresAt: job.claimExpiresAt,
            profile: {
                id: job.profile.id,
                externalId: job.profile.externalId,
                name: job.profile.name,
            },
            group: {
                id: job.group.id,
                externalId: job.group.externalId,
                name: job.group.name,
                url: job.group.url,
            },
            posts: job.items.map(({ post }) => ({
                id: post.id,
                title: post.title,
                description: post.description,
                image: post.imageUrl ?? job.profile.defaultImageUrl,
                delay: post.delay,
                comment: { text: post.description, willReceiveLink: Boolean(post.url) },
            })),
        };
    }
    async claimBatch({ profileExternalIds, limit }) {
        const requested = [...new Set(profileExternalIds ?? [])];
        const profiles = await this.prisma.profile.findMany({
            where: {
                status: 'ACTIVE',
                externalId: requested.length ? { in: requested } : { not: null },
            },
            select: { id: true, name: true, externalId: true },
            orderBy: { createdAt: 'asc' },
            take: limit,
        });
        if (!profiles.length) {
            return { requested: limit, claimed: 0, jobs: [], skipped: [] };
        }
        const results = await Promise.all(profiles.map(async (profile) => {
            const externalId = profile.externalId ?? '';
            try {
                const claim = await this.claimByProfileExternalId(externalId);
                if ('jobId' in claim)
                    return { status: 'claimed', ...claim };
                return {
                    status: claim.activeJobId ? 'busy' : 'empty',
                    profileExternalId: externalId,
                    profileName: profile.name,
                    message: claim.message,
                };
            }
            catch (error) {
                const message = error instanceof Error ? error.message : 'Erreur inconnue';
                await this.log({
                    profileId: profile.id,
                    eventType: 'CLAIM_FAILED',
                    level: 'ERROR',
                    message,
                });
                return {
                    status: 'error',
                    profileExternalId: externalId,
                    profileName: profile.name,
                    message,
                };
            }
        }));
        const jobs = [];
        const skipped = [];
        for (const result of results) {
            if (result.status === 'claimed')
                jobs.push(result);
            else
                skipped.push(result);
        }
        await this.log({
            eventType: 'JOBS_BATCH_CLAIMED',
            level: jobs.length ? 'INFO' : 'WARN',
            message: `${jobs.length} job(s) réservé(s) sur ${profiles.length} profil(s)`,
            metadata: {
                claimed: jobs.length,
                skipped: skipped.map(({ status, profileExternalId }) => ({
                    status,
                    profileExternalId,
                })),
            },
        });
        return {
            requested: profiles.length,
            claimed: jobs.length,
            posts: jobs.reduce((total, job) => total + job.posts.length, 0),
            jobs,
            skipped,
        };
    }
    async releaseExpiredClaims(tx = this.prisma) {
        const now = new Date();
        await tx.publicationJob.updateMany({
            where: { status: client_1.JobStatus.CLAIMED, claimExpiresAt: { lt: now } },
            data: { status: client_1.JobStatus.EXPIRED },
        });
        const released = await tx.postTarget.updateMany({
            where: { status: client_1.TargetStatus.CLAIMED, claimExpiresAt: { lt: now } },
            data: {
                status: client_1.TargetStatus.AVAILABLE,
                claimedAt: null,
                claimExpiresAt: null,
            },
        });
        return released.count;
    }
    async claimByProfileExternalId(profileExternalId, groupExternalId) {
        const profile = await this.prisma.profile.findFirst({
            where: { externalId: profileExternalId, status: 'ACTIVE' },
        });
        if (!profile) {
            throw new common_1.NotFoundException(`Profil introuvable pour externalId=${profileExternalId}`);
        }
        const active = await this.prisma.publicationJob.findFirst({
            where: {
                profileId: profile.id,
                status: client_1.JobStatus.CLAIMED,
                claimExpiresAt: { gt: new Date() },
            },
            select: { id: true, claimExpiresAt: true },
        });
        if (active) {
            await this.log({
                profileId: profile.id,
                jobId: active.id,
                eventType: 'CLAIM_SKIPPED_BUSY',
                message: `Profil déjà occupé par le job ${active.id}`,
                metadata: { claimExpiresAt: active.claimExpiresAt.toISOString() },
            });
            return {
                job: null,
                posts: [],
                activeJobId: active.id,
                message: `Ce profil traite déjà le job ${active.id}`,
            };
        }
        await this.releaseExpiredClaims();
        await this.settings.replenishProfile(profile.id);
        const groups = await this.prisma.group.findMany({
            where: {
                status: 'ACTIVE',
                externalId: groupExternalId || undefined,
                profiles: { some: { profileId: profile.id, status: 'ACTIVE' } },
                targets: {
                    some: {
                        status: client_1.TargetStatus.AVAILABLE,
                        post: { profileId: profile.id, status: 'AVAILABLE' },
                    },
                },
            },
            select: { id: true },
        });
        if (!groups.length) {
            return {
                job: null,
                posts: [],
                message: groupExternalId
                    ? 'Aucun post disponible pour ce profil et ce groupe'
                    : 'Aucun post disponible pour ce profil',
            };
        }
        const shuffled = groups.sort(() => Math.random() - 0.5);
        for (const group of shuffled) {
            const result = await this.claim({
                profileId: profile.id,
                groupId: group.id,
            });
            if ('jobId' in result)
                return result;
        }
        return { job: null, posts: [], message: 'Aucun post disponible' };
    }
    markConsumed(jobId, postId) {
        return this.updateItem(jobId, postId, client_1.TargetStatus.CONSUMED, {});
    }
    markPublished(jobId, postId, dto) {
        const publishedAt = dto.publishedAt
            ? new Date(dto.publishedAt)
            : new Date();
        return this.updateItem(jobId, postId, client_1.TargetStatus.PUBLISHED, {
            publishedAt,
            externalPostUrl: dto.externalPostUrl,
        });
    }
    markFailed(jobId, postId, error) {
        return this.updateItem(jobId, postId, client_1.TargetStatus.FAILED, { error });
    }
    async complete(jobId) {
        const job = await this.prisma.publicationJob.findUnique({
            where: { id: jobId },
            include: { items: { include: { post: { select: { url: true } } } } },
        });
        if (!job)
            throw new common_1.NotFoundException('Job introuvable');
        const unfinished = job.items.some((item) => item.status === client_1.TargetStatus.CLAIMED ||
            item.status === client_1.TargetStatus.CONSUMED);
        if (unfinished) {
            throw new common_1.BadRequestException('Tous les posts doivent être finalisés');
        }
        const awaiting = job.items.filter((item) => this.awaitsLink(item));
        const missingComments = job.items.filter((item) => item.status === client_1.TargetStatus.PUBLISHED &&
            item.post.url &&
            !item.commentedAt);
        const outcome = this.outcomeFor(job.items);
        const status = awaiting.length ? client_1.JobStatus.AWAITING_LINK : outcome;
        const updated = await this.prisma.$transaction(async (tx) => {
            const result = await tx.publicationJob.update({
                where: { id: jobId },
                data: { status, completedAt: new Date() },
            });
            if (missingComments.length) {
                await tx.activityLog.create({
                    data: {
                        jobId,
                        profileId: job.profileId,
                        groupId: job.groupId,
                        eventType: 'COMMENT_MISSING',
                        level: 'WARN',
                        message: `${missingComments.length} post(s) publié(s) sans commentaire : leur URL ne pourra pas être placée`,
                        metadata: { postIds: missingComments.map((item) => item.postId) },
                    },
                });
            }
            await tx.activityLog.create({
                data: {
                    jobId,
                    profileId: job.profileId,
                    groupId: job.groupId,
                    eventType: awaiting.length ? 'JOB_AWAITING_LINK' : 'JOB_COMPLETED',
                    message: awaiting.length
                        ? `${awaiting.length} commentaire(s) à basculer sur l'URL`
                        : `Job clôturé avec le statut ${outcome}`,
                    metadata: { status, awaitingLink: awaiting.length },
                },
            });
            return result;
        });
        return {
            ...updated,
            awaitingLink: awaiting.length,
            missingComments: missingComments.length,
        };
    }
    async markCommented(jobId, postId, dto) {
        const item = await this.prisma.publicationJobItem.findUnique({
            where: { jobId_postId: { jobId, postId } },
            include: { job: true, postTarget: true },
        });
        if (!item)
            throw new common_1.NotFoundException('Post introuvable dans ce job');
        if (item.status !== client_1.TargetStatus.PUBLISHED) {
            throw new common_1.BadRequestException('Le post doit être confirmé publié avant d’enregistrer son commentaire');
        }
        if (item.commentedAt) {
            if (item.commentExternalId !== dto.commentExternalId) {
                await this.log({
                    jobId,
                    postId,
                    eventType: 'COMMENT_DUPLICATE',
                    level: 'WARN',
                    message: 'Un second commentaire a été signalé pour ce post',
                    metadata: {
                        enregistre: item.commentExternalId,
                        recu: dto.commentExternalId,
                    },
                });
            }
            return item;
        }
        if (!this.stillOwnsTarget(item.job, item.postTarget)) {
            await this.logLostClaim(jobId, postId, item.postTargetId, item.status);
            throw new common_1.ConflictException('La réservation de ce post a expiré et a été reprise. ' +
                'Ne republiez pas ce post : signalez-le à un administrateur.');
        }
        const commentedAt = dto.commentedAt
            ? new Date(dto.commentedAt)
            : new Date();
        const data = { commentExternalId: dto.commentExternalId, commentedAt };
        return this.prisma.$transaction(async (tx) => {
            const updated = await tx.publicationJobItem.update({
                where: { id: item.id },
                data,
            });
            await tx.postTarget.update({ where: { id: item.postTargetId }, data });
            await tx.activityLog.create({
                data: {
                    jobId,
                    postId,
                    postTargetId: item.postTargetId,
                    eventType: 'POST_COMMENTED',
                    message: 'Commentaire posé, en attente de l’URL',
                    metadata: { commentExternalId: dto.commentExternalId },
                },
            });
            return updated;
        });
    }
    async linkUpdates(jobId) {
        const job = await this.prisma.publicationJob.findUnique({
            where: { id: jobId },
            include: {
                profile: { select: { id: true, name: true, externalId: true } },
                group: { select: { id: true, name: true, externalId: true } },
                items: { include: { post: { select: { url: true, title: true } } } },
            },
        });
        if (!job)
            throw new common_1.NotFoundException('Job introuvable');
        if (job.status === client_1.JobStatus.CLAIMED) {
            throw new common_1.BadRequestException('Clôturez le job (complete) avant de basculer les commentaires sur l’URL');
        }
        return {
            jobId: job.id,
            status: job.status,
            completedAt: job.completedAt,
            profile: job.profile,
            group: job.group,
            updates: job.items
                .filter((item) => this.awaitsLink(item))
                .map((item) => ({
                postId: item.postId,
                title: item.post.title,
                commentExternalId: item.commentExternalId,
                url: item.post.url,
                externalPostUrl: item.externalPostUrl,
            })),
        };
    }
    async pendingLinkUpdates(profileExternalId, limit) {
        const jobs = await this.prisma.publicationJob.findMany({
            where: {
                status: { not: client_1.JobStatus.CLAIMED },
                ...(profileExternalId
                    ? { profile: { externalId: profileExternalId } }
                    : {}),
            },
            include: {
                profile: { select: { id: true, name: true, externalId: true } },
                group: { select: { id: true, name: true, externalId: true } },
                items: { include: { post: { select: { url: true, title: true } } } },
            },
            orderBy: { completedAt: 'asc' },
            take: limit,
        });
        return jobs
            .map((job) => ({
            jobId: job.id,
            completedAt: job.completedAt,
            profile: job.profile,
            group: job.group,
            updates: job.items
                .filter((item) => this.awaitsLink(item))
                .map((item) => ({
                postId: item.postId,
                title: item.post.title,
                commentExternalId: item.commentExternalId,
                url: item.post.url,
            })),
        }))
            .filter((job) => job.updates.length > 0);
    }
    async markLinkUpdated(jobId, postId, dto) {
        const item = await this.prisma.publicationJobItem.findUnique({
            where: { jobId_postId: { jobId, postId } },
            include: { job: true, post: { select: { url: true } } },
        });
        if (!item)
            throw new common_1.NotFoundException('Post introuvable dans ce job');
        if (item.job.status === client_1.JobStatus.CLAIMED) {
            throw new common_1.BadRequestException('Clôturez le job (complete) avant de basculer les commentaires sur l’URL');
        }
        if (!item.commentExternalId) {
            throw new common_1.BadRequestException('Aucun commentaire enregistré pour ce post : rien à modifier');
        }
        if (!item.post.url) {
            throw new common_1.BadRequestException('Ce post n’a pas d’URL à placer');
        }
        if (item.linkUpdatedAt)
            return { ...item, remaining: 0 };
        const linkUpdatedAt = dto.linkUpdatedAt
            ? new Date(dto.linkUpdatedAt)
            : new Date();
        return this.prisma.$transaction(async (tx) => {
            const updated = await tx.publicationJobItem.update({
                where: { id: item.id },
                data: { linkUpdatedAt },
            });
            await tx.postTarget.update({
                where: { id: item.postTargetId },
                data: { linkUpdatedAt },
            });
            await tx.activityLog.create({
                data: {
                    jobId,
                    postId,
                    postTargetId: item.postTargetId,
                    eventType: 'COMMENT_LINK_UPDATED',
                    message: 'Commentaire modifié avec l’URL',
                    metadata: {
                        commentExternalId: item.commentExternalId,
                        url: item.post.url,
                    },
                },
            });
            const siblings = await tx.publicationJobItem.findMany({
                where: { jobId },
                include: { post: { select: { url: true } } },
            });
            const remaining = siblings.filter((sibling) => this.awaitsLink(sibling)).length;
            if (!remaining && item.job.status === client_1.JobStatus.AWAITING_LINK) {
                const status = this.outcomeFor(siblings);
                await tx.publicationJob.update({
                    where: { id: jobId },
                    data: { status },
                });
                await tx.activityLog.create({
                    data: {
                        jobId,
                        profileId: item.job.profileId,
                        groupId: item.job.groupId,
                        eventType: 'JOB_FINALIZED',
                        message: `Toutes les URL sont en place, job clôturé avec le statut ${status}`,
                        metadata: { status },
                    },
                });
            }
            return { ...updated, remaining };
        });
    }
    awaitsLink(item) {
        return (item.status === client_1.TargetStatus.PUBLISHED &&
            Boolean(item.post.url) &&
            item.commentedAt !== null &&
            item.linkUpdatedAt === null);
    }
    outcomeFor(items) {
        if (items.every((item) => item.status === client_1.TargetStatus.FAILED)) {
            return client_1.JobStatus.FAILED;
        }
        return items.some((item) => item.status === client_1.TargetStatus.FAILED)
            ? client_1.JobStatus.PARTIALLY_COMPLETED
            : client_1.JobStatus.COMPLETED;
    }
    log(data) {
        return this.prisma.activityLog.create({ data });
    }
    async updateItem(jobId, postId, status, data) {
        const item = await this.prisma.publicationJobItem.findUnique({
            where: { jobId_postId: { jobId, postId } },
            include: { job: true, postTarget: true },
        });
        if (!item)
            throw new common_1.NotFoundException('Post introuvable dans ce job');
        if (item.status === status)
            return item;
        if (!this.canTransition(item.status, status)) {
            throw new common_1.BadRequestException(`Le post est déjà finalisé avec le statut ${item.status}`);
        }
        if (!this.stillOwnsTarget(item.job, item.postTarget)) {
            await this.logLostClaim(jobId, postId, item.postTargetId, status);
            throw new common_1.ConflictException('La réservation de ce post a expiré et a été reprise. ' +
                'Ne republiez pas ce post : signalez-le à un administrateur.');
        }
        return this.prisma.$transaction(async (tx) => {
            const updated = await tx.publicationJobItem.update({
                where: { id: item.id },
                data: { status, ...data },
            });
            await tx.postTarget.update({
                where: { id: item.postTargetId },
                data: {
                    status,
                    consumedAt: status === client_1.TargetStatus.CONSUMED ? new Date() : undefined,
                    publishedAt: data.publishedAt,
                    lastError: data.error,
                },
            });
            await tx.activityLog.create({
                data: {
                    jobId,
                    postId,
                    postTargetId: item.postTargetId,
                    eventType: `POST_${status}`,
                    level: status === client_1.TargetStatus.FAILED ? 'ERROR' : 'INFO',
                    message: data.error ?? `Post marqué ${status}`,
                },
            });
            return updated;
        });
    }
    canTransition(from, to) {
        if (from === client_1.TargetStatus.CLAIMED)
            return true;
        if (from === client_1.TargetStatus.CONSUMED) {
            return to === client_1.TargetStatus.PUBLISHED || to === client_1.TargetStatus.FAILED;
        }
        return false;
    }
    stillOwnsTarget(job, target) {
        return (target.claimExpiresAt !== null &&
            target.claimExpiresAt.getTime() === job.claimExpiresAt.getTime());
    }
    logLostClaim(jobId, postId, postTargetId, status) {
        return this.prisma.activityLog.create({
            data: {
                jobId,
                postId,
                postTargetId,
                eventType: 'CLAIM_LOST',
                level: 'ERROR',
                message: `Confirmation ${status} refusée : la réservation a été reprise`,
            },
        });
    }
    randomInt(min, max) {
        return Math.floor(Math.random() * (max - min + 1)) + min;
    }
};
exports.JobsService = JobsService;
exports.JobsService = JobsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        config_1.ConfigService,
        settings_service_1.SettingsService])
], JobsService);
//# sourceMappingURL=jobs.service.js.map