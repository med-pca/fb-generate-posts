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
            const now = new Date();
            await tx.publicationJob.updateMany({
                where: {
                    status: client_1.JobStatus.CLAIMED,
                    claimExpiresAt: { lt: now },
                },
                data: { status: client_1.JobStatus.EXPIRED },
            });
            await tx.postTarget.updateMany({
                where: {
                    status: client_1.TargetStatus.CLAIMED,
                    claimExpiresAt: { lt: now },
                },
                data: {
                    status: client_1.TargetStatus.AVAILABLE,
                    claimedAt: null,
                    claimExpiresAt: null,
                },
            });
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
                url: post.url,
                image: post.imageUrl ?? job.profile.defaultImageUrl,
                delay: post.delay,
            })),
        };
    }
    async claimByProfileExternalId(profileExternalId, groupExternalId) {
        const profile = await this.prisma.profile.findFirst({
            where: { externalId: profileExternalId, status: 'ACTIVE' },
        });
        if (!profile) {
            throw new common_1.NotFoundException(`Profil introuvable pour externalId=${profileExternalId}`);
        }
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
            if (result.posts.length)
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
            include: { items: true },
        });
        if (!job)
            throw new common_1.NotFoundException('Job introuvable');
        const unfinished = job.items.some((item) => item.status === client_1.TargetStatus.CLAIMED ||
            item.status === client_1.TargetStatus.CONSUMED);
        if (unfinished) {
            throw new common_1.BadRequestException('Tous les posts doivent être finalisés');
        }
        const allFailed = job.items.every((item) => item.status === client_1.TargetStatus.FAILED);
        const someFailed = job.items.some((item) => item.status === client_1.TargetStatus.FAILED);
        const status = allFailed
            ? client_1.JobStatus.FAILED
            : someFailed
                ? client_1.JobStatus.PARTIALLY_COMPLETED
                : client_1.JobStatus.COMPLETED;
        return this.prisma.publicationJob.update({
            where: { id: jobId },
            data: { status, completedAt: new Date() },
        });
    }
    async updateItem(jobId, postId, status, data) {
        const item = await this.prisma.publicationJobItem.findUnique({
            where: { jobId_postId: { jobId, postId } },
        });
        if (!item)
            throw new common_1.NotFoundException('Post introuvable dans ce job');
        if (item.status === status)
            return item;
        if (item.status !== client_1.TargetStatus.CLAIMED) {
            throw new common_1.BadRequestException(`Le post est déjà finalisé avec le statut ${item.status}`);
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