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
exports.VerifyService = exports.VERIFY_OUTCOMES = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const client_1 = require("@prisma/client");
const prisma_service_1 = require("../prisma/prisma.service");
const scope_1 = require("../auth/scope");
const trace_1 = require("../trace/trace");
const DEFAULT_VERIFY_AFTER_MINUTES = 30;
const CLAIM_MINUTES = 20;
const PENDING_RETRY_HOURS = 2;
const UNREACHABLE_RETRY_MINUTES = 30;
const MAX_UNREACHABLE = 5;
const MAX_REPUBLISH = 2;
exports.VERIFY_OUTCOMES = [
    'ok',
    'missing_post',
    'missing_link',
    'pending',
    'unreachable',
];
let VerifyService = class VerifyService {
    prisma;
    config;
    constructor(prisma, config) {
        this.prisma = prisma;
        this.config = config;
    }
    verifyAfterMinutes() {
        const raw = Number(this.config.get('VERIFY_AFTER_MINUTES'));
        return Number.isFinite(raw) && raw >= 0 ? raw : DEFAULT_VERIFY_AFTER_MINUTES;
    }
    async moderator(profileExternalId, acting) {
        const profile = await this.prisma.profile.findFirst({
            where: { externalId: profileExternalId, ...(0, scope_1.profileWhere)((0, scope_1.scopeOf)(acting)) },
            select: { id: true, name: true, isModerator: true, status: true },
        });
        if (!profile)
            throw new common_1.NotFoundException('Profil vérificateur introuvable');
        if (!profile.isModerator || profile.status !== 'ACTIVE') {
            throw new common_1.ForbiddenException(`« ${profile.name} » n’est pas désigné vérificateur (Pilotage → Vérificateur)`);
        }
        return profile;
    }
    dueWhere(acting, now) {
        return {
            status: client_1.TargetStatus.PUBLISHED,
            OR: [{ verifyStatus: null }, { verifyStatus: client_1.VerifyStatus.REPUBLISHED }],
            publishedAt: { lte: new Date(now.getTime() - this.verifyAfterMinutes() * 60_000) },
            AND: [
                { OR: [{ verifyClaimedUntil: null }, { verifyClaimedUntil: { lt: now } }] },
                { post: (0, scope_1.postWhere)((0, scope_1.scopeOf)(acting)) },
            ],
        };
    }
    async claim(profileExternalId, limit, acting, now = new Date()) {
        await this.moderator(profileExternalId, acting);
        const due = await this.prisma.postTarget.findMany({
            where: this.dueWhere(acting, now),
            orderBy: { publishedAt: 'asc' },
            take: Math.max(1, Math.min(20, limit || 5)),
            select: {
                id: true,
                publishedAt: true,
                republishCount: true,
                facebookUrl: true,
                post: { select: { id: true, title: true, description: true, url: true } },
                group: { select: { id: true, name: true, url: true, externalId: true } },
                jobItems: {
                    where: { status: client_1.TargetStatus.PUBLISHED },
                    orderBy: { publishedAt: 'desc' },
                    take: 1,
                    select: {
                        externalPostUrl: true,
                        job: { select: { profile: { select: { name: true, externalId: true } } } },
                    },
                },
            },
        });
        if (!due.length) {
            return { tasks: [], verifyAfterMinutes: this.verifyAfterMinutes() };
        }
        await this.prisma.postTarget.updateMany({
            where: { id: { in: due.map((t) => t.id) } },
            data: { verifyClaimedUntil: new Date(now.getTime() + CLAIM_MINUTES * 60_000) },
        });
        return {
            verifyAfterMinutes: this.verifyAfterMinutes(),
            tasks: due.map((t) => ({
                targetId: t.id,
                postUrl: t.facebookUrl ?? t.jobItems[0]?.externalPostUrl ?? null,
                postText: t.post.description,
                postTitle: t.post.title,
                linkUrl: t.post.url,
                author: t.jobItems[0]?.job.profile.name ?? null,
                group: { name: t.group.name, url: t.group.url },
                publishedAt: t.publishedAt,
                republishCount: t.republishCount,
            })),
        };
    }
    async report(targetId, input, acting, now = new Date()) {
        if (!exports.VERIFY_OUTCOMES.includes(input.outcome)) {
            throw new common_1.BadRequestException('Résultat de vérification inconnu');
        }
        const moderator = await this.moderator(input.profileExternalId, acting);
        const target = await this.target(targetId, acting);
        const detail = String(input.detail || '').slice(0, 1000);
        const by = `vérifié par ${moderator.name}`;
        const who = { actor: moderator.name, profileId: moderator.id };
        const found = (0, trace_1.normalizeFacebookUrl)(input.postUrl);
        if (found && found !== target.facebookUrl) {
            await this.prisma.$transaction([
                this.prisma.postTarget.update({ where: { id: target.id }, data: { facebookUrl: found } }),
                (0, trace_1.trace)(this.prisma, { postTargetId: target.id, kind: 'URL_FOUND', facebookUrl: found, ...who }),
                this.prisma.activityLog.create({
                    data: {
                        postId: target.postId,
                        groupId: target.groupId,
                        postTargetId: target.id,
                        profileId: moderator.id,
                        facebookUrl: found,
                        eventType: 'VERIFY_URL_FOUND',
                        message: `Adresse de « ${target.post.title} » retrouvée dans « ${target.group.name} » : ${found}`,
                        metadata: { by },
                    },
                }),
            ]);
            target.facebookUrl = found;
        }
        const url = target.facebookUrl;
        const EVENTS = {
            VERIFIED_OK: { event: 'VERIFY_OK', level: 'INFO', label: 'vérifié en ligne avec son lien' },
            VERIFY_PENDING: { event: 'VERIFY_PENDING', level: 'INFO', label: 'en attente de validation' },
            VERIFY_UNREACHABLE: { event: 'VERIFY_UNREACHABLE', level: 'WARN', label: 'vérification impossible' },
            VERIFY_MISSING_POST: { event: 'VERIFY_MISSING_POST', level: 'ERROR', label: 'introuvable' },
            VERIFY_MISSING_LINK: { event: 'VERIFY_MISSING_LINK', level: 'ERROR', label: 'en ligne SANS le lien de l’article' },
            DELETED: { event: 'VERIFY_DELETED', level: 'WARN', label: 'supprimé par le vérificateur' },
            DELETE_FAILED: { event: 'VERIFY_DELETE_FAILED', level: 'ERROR', label: 'suppression impossible' },
        };
        const note = (kind, text) => {
            const e = EVENTS[kind];
            return this.prisma.$transaction([
                (0, trace_1.trace)(this.prisma, { postTargetId: target.id, kind, facebookUrl: url, detail: text, ...who }),
                ...(e
                    ? [
                        this.prisma.activityLog.create({
                            data: {
                                postId: target.postId,
                                groupId: target.groupId,
                                postTargetId: target.id,
                                profileId: moderator.id,
                                facebookUrl: url,
                                eventType: e.event,
                                level: e.level,
                                message: `« ${target.post.title} » dans « ${target.group.name} » : ${e.label}${text ? ` — ${text}` : ''}`,
                                metadata: { by, expectedLink: target.post.url ?? null },
                            },
                        }),
                    ]
                    : []),
            ]);
        };
        switch (input.outcome) {
            case 'ok':
                await note('VERIFIED_OK', detail || 'en ligne, avec son lien');
                await this.prisma.postTarget.update({
                    where: { id: target.id },
                    data: {
                        verifyStatus: client_1.VerifyStatus.OK,
                        verifiedAt: now,
                        verifyDetail: detail || 'en ligne, avec son lien',
                        verifyClaimedUntil: null,
                    },
                });
                return { targetId, result: 'verified' };
            case 'pending':
                await note('VERIFY_PENDING', detail || 'en attente de modération');
                await this.retryLater(target, now, PENDING_RETRY_HOURS * 60, detail || 'en attente de modération');
                return { targetId, result: 'retry_later' };
            case 'unreachable':
                await note('VERIFY_UNREACHABLE', detail || 'page injoignable');
                if (target.verifyAttempts + 1 >= MAX_UNREACHABLE) {
                    await this.needsAction(target, `page injoignable ${MAX_UNREACHABLE} fois : ${detail}`, by);
                    return { targetId, result: 'needs_action' };
                }
                await this.retryLater(target, now, UNREACHABLE_RETRY_MINUTES, detail || 'page injoignable');
                return { targetId, result: 'retry_later' };
            case 'missing_post':
                await note('VERIFY_MISSING_POST', detail || 'absent du groupe');
                return this.republish(target, `post introuvable : ${detail || 'absent du groupe'}`, by, now);
            case 'missing_link':
                await note('VERIFY_MISSING_LINK', detail);
                await note(input.deleted ? 'DELETED' : 'DELETE_FAILED', detail);
                if (!input.deleted) {
                    await this.needsAction(target, `en ligne sans son lien, et le vérificateur n’a pas pu le supprimer (est-il administrateur du groupe ?) : ${detail}`, by);
                    return { targetId, result: 'needs_action' };
                }
                return this.republish(target, `sans son lien, supprimé par le vérificateur : ${detail}`, by, now);
        }
    }
    async target(targetId, acting) {
        const target = await this.prisma.postTarget.findFirst({
            where: { id: targetId, post: (0, scope_1.postWhere)((0, scope_1.scopeOf)(acting)) },
            select: {
                id: true,
                status: true,
                postId: true,
                groupId: true,
                verifyAttempts: true,
                republishCount: true,
                facebookUrl: true,
                post: { select: { title: true, url: true } },
                group: { select: { name: true } },
            },
        });
        if (!target)
            throw new common_1.NotFoundException('Publication introuvable');
        return target;
    }
    async retryLater(target, now, minutes, detail) {
        await this.prisma.postTarget.update({
            where: { id: target.id },
            data: {
                verifyClaimedUntil: new Date(now.getTime() + minutes * 60_000),
                verifyAttempts: { increment: 1 },
                verifyDetail: detail,
            },
        });
    }
    async needsAction(target, detail, by) {
        await this.prisma.$transaction([
            this.prisma.postTarget.update({
                where: { id: target.id },
                data: { verifyStatus: client_1.VerifyStatus.NEEDS_ACTION, verifyDetail: detail, verifyClaimedUntil: null },
            }),
            (0, trace_1.trace)(this.prisma, { postTargetId: target.id, kind: 'NEEDS_ACTION', detail, actor: by }),
            this.prisma.activityLog.create({
                data: {
                    postId: target.postId,
                    groupId: target.groupId,
                    postTargetId: target.id,
                    facebookUrl: target.facebookUrl ?? null,
                    eventType: 'VERIFY_NEEDS_ACTION',
                    level: 'WARN',
                    message: `« ${target.post.title} » dans « ${target.group.name} » : ${detail}`,
                    metadata: { by },
                },
            }),
        ]);
    }
    async republish(target, detail, by, now) {
        if (target.republishCount >= MAX_REPUBLISH) {
            await this.needsAction(target, `déjà republié ${MAX_REPUBLISH} fois, toujours en défaut — ${detail}`, by);
            return { targetId: target.id, result: 'needs_action' };
        }
        await this.prisma.$transaction([
            this.prisma.postTarget.update({
                where: { id: target.id },
                data: {
                    status: client_1.TargetStatus.AVAILABLE,
                    claimedAt: null,
                    claimExpiresAt: null,
                    consumedAt: null,
                    publishedAt: null,
                    commentExternalId: null,
                    commentedAt: null,
                    linkUpdatedAt: null,
                    facebookUrl: null,
                    lastError: detail,
                    verifyStatus: client_1.VerifyStatus.REPUBLISHED,
                    verifiedAt: now,
                    verifyDetail: detail,
                    verifyClaimedUntil: null,
                    republishCount: { increment: 1 },
                },
            }),
            (0, trace_1.trace)(this.prisma, {
                postTargetId: target.id,
                kind: 'REQUEUED',
                facebookUrl: target.facebookUrl,
                detail,
                actor: by,
            }),
            this.prisma.activityLog.create({
                data: {
                    postId: target.postId,
                    groupId: target.groupId,
                    postTargetId: target.id,
                    facebookUrl: target.facebookUrl ?? null,
                    eventType: 'VERIFY_REPUBLISH',
                    level: 'WARN',
                    message: `« ${target.post.title} » remis dans la file pour « ${target.group.name} » : ${detail}`,
                    metadata: { by, republishCount: target.republishCount + 1 },
                },
            }),
        ]);
        return { targetId: target.id, result: 'requeued' };
    }
    async review(acting) {
        const rows = await this.prisma.postTarget.findMany({
            where: { verifyStatus: client_1.VerifyStatus.NEEDS_ACTION, post: (0, scope_1.postWhere)((0, scope_1.scopeOf)(acting)) },
            orderBy: { updatedAt: 'desc' },
            take: 50,
            select: {
                id: true,
                verifyDetail: true,
                updatedAt: true,
                republishCount: true,
                facebookUrl: true,
                post: { select: { id: true, title: true, imageUrl: true, description: true, priority: true } },
                group: { select: { id: true, name: true, url: true, category: { select: { id: true, name: true } } } },
                jobItems: {
                    where: { externalPostUrl: { not: null } },
                    orderBy: { createdAt: 'desc' },
                    take: 1,
                    select: { externalPostUrl: true },
                },
            },
        });
        return rows.map((r) => ({
            targetId: r.id,
            detail: r.verifyDetail,
            since: r.updatedAt,
            republishCount: r.republishCount,
            post: r.post,
            group: r.group,
            facebookUrl: r.facebookUrl ?? r.jobItems[0]?.externalPostUrl ?? null,
        }));
    }
    async resolve(targetId, action, acting, now = new Date()) {
        const target = await this.target(targetId, acting);
        const by = acting?.username ?? 'clé globale';
        if (action === 'ok') {
            await this.prisma.$transaction([
                this.prisma.postTarget.update({
                    where: { id: target.id },
                    data: { verifyStatus: client_1.VerifyStatus.OK, verifiedAt: now, verifyDetail: `validé à la main par ${by}` },
                }),
                (0, trace_1.trace)(this.prisma, { postTargetId: target.id, kind: 'RESOLVED_OK', facebookUrl: target.facebookUrl, actor: by }),
            ]);
            return { targetId, result: 'verified' };
        }
        if (target.status !== client_1.TargetStatus.PUBLISHED) {
            throw new common_1.ConflictException('Seule une publication publiée se republie');
        }
        return this.republish({ ...target, republishCount: 0 }, `republié à la main par ${by}`, by, now);
    }
    async setModerator(profileId, patch, acting) {
        const profile = await this.prisma.profile.findFirst({
            where: { id: profileId, ...(0, scope_1.profileWhere)((0, scope_1.scopeOf)(acting)) },
            select: { id: true },
        });
        if (!profile)
            throw new common_1.NotFoundException('Profil introuvable');
        const data = {};
        if (patch.isModerator !== undefined)
            data.isModerator = patch.isModerator;
        if (patch.facebookUserId !== undefined) {
            const id = patch.facebookUserId || null;
            if (id) {
                const holder = await this.prisma.profile.findUnique({ where: { facebookUserId: id }, select: { id: true, name: true } });
                if (holder && holder.id !== profileId) {
                    throw new common_1.ConflictException(`Ce compte Facebook est déjà celui du profil « ${holder.name} »`);
                }
            }
            data.facebookUserId = id;
        }
        return this.prisma.profile.update({
            where: { id: profileId },
            data,
            select: { id: true, name: true, isModerator: true, facebookUserId: true },
        });
    }
    async stats(acting, now = new Date()) {
        const post = (0, scope_1.postWhere)((0, scope_1.scopeOf)(acting));
        const [due, verified, republished, needsAction] = await Promise.all([
            this.prisma.postTarget.count({ where: this.dueWhere(acting, now) }),
            this.prisma.postTarget.count({ where: { verifyStatus: client_1.VerifyStatus.OK, post } }),
            this.prisma.postTarget.count({ where: { verifyStatus: client_1.VerifyStatus.REPUBLISHED, post } }),
            this.prisma.postTarget.count({ where: { verifyStatus: client_1.VerifyStatus.NEEDS_ACTION, post } }),
        ]);
        return { due, verified, republished, needsAction, verifyAfterMinutes: this.verifyAfterMinutes() };
    }
};
exports.VerifyService = VerifyService;
exports.VerifyService = VerifyService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        config_1.ConfigService])
], VerifyService);
//# sourceMappingURL=verify.service.js.map