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
var VisualsService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.VisualsService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const client_1 = require("@prisma/client");
const node_crypto_1 = require("node:crypto");
const prisma_service_1 = require("../prisma/prisma.service");
const scope_1 = require("../auth/scope");
const rewriter_service_1 = require("../ingest/rewriter.service");
const image_translator_service_1 = require("../ingest/image-translator.service");
const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const MAX_BYTES = 10_000_000;
let VisualsService = VisualsService_1 = class VisualsService {
    prisma;
    config;
    rewriter;
    images;
    logger = new common_1.Logger(VisualsService_1.name);
    constructor(prisma, config, rewriter, images) {
        this.prisma = prisma;
        this.config = config;
        this.rewriter = rewriter;
        this.images = images;
    }
    async audience(opts, acting = null) {
        const where = opts.groupIds?.length
            ? { id: { in: opts.groupIds }, status: 'ACTIVE', ...(0, scope_1.groupWhere)((0, scope_1.scopeOf)(acting)) }
            : {
                status: 'ACTIVE',
                ...(opts.language ? { language: opts.language } : {}),
                ...(opts.categoryId ? { categoryId: opts.categoryId } : {}),
                ...(0, scope_1.groupWhere)((0, scope_1.scopeOf)(acting)),
            };
        return this.prisma.group.findMany({ where, select: { id: true } });
    }
    async create(opts, acting = null) {
        if (!IMAGE_TYPES.has(opts.image.mimeType))
            throw new common_1.BadRequestException(`Type d’image non accepté : ${opts.image.mimeType}`);
        if (Buffer.byteLength(opts.image.data, 'base64') > MAX_BYTES)
            throw new common_1.BadRequestException('Image trop lourde (10 Mo au plus)');
        if (opts.translate && !opts.language)
            throw new common_1.BadRequestException('Choisissez la langue de traduction');
        const wantsGroups = opts.createPosts || Boolean(opts.review);
        const audience = wantsGroups ? await this.audience(opts, acting) : [];
        const groups = opts.review ? [] : audience;
        if (wantsGroups && !audience.length) {
            throw new common_1.BadRequestException(`Aucun groupe actif${opts.language ? ` en ${(0, image_translator_service_1.languageName)(opts.language)}` : ''}${opts.categoryId ? ' dans cette catégorie' : ''} : réglez la langue des groupes (Pilotage → Règles & priorités) ou choisissez des groupes`);
        }
        let image = opts.image;
        let read = { hasText: false, texts: [], scene: '' };
        let provider = '';
        if (opts.translate || !opts.caption?.trim()) {
            try {
                read = await this.rewriter.readImageText({ image, language: opts.language || 'en' });
            }
            catch (error) {
                this.logger.warn(`Lecture de l’image impossible : ${error.message}`);
                if (opts.translate)
                    read = { hasText: true, texts: [], scene: '' };
            }
        }
        if (opts.translate && read.hasText) {
            const settings = await this.prisma.automationSetting.findUnique({ where: { id: 'global' }, select: { imageProvider: true } });
            const translated = await this.images.translate(image, opts.language, read.texts.map((t) => `"${t.original}" → "${t.translated}"`), settings?.imageProvider ?? 'auto');
            image = { data: translated.data, mimeType: translated.mimeType };
            provider = translated.provider;
        }
        let caption = opts.caption?.trim() || '';
        let title = opts.title?.trim() || '';
        let hashtags = [];
        let captionBy = 'à la main';
        if (!caption) {
            const written = await this.rewriter.engagementCaption({
                language: opts.language || 'en',
                scene: read.scene,
                texts: read.texts.map((t) => (opts.translate ? t.translated : t.original)),
                fbCaption: opts.fbCaption,
            });
            caption = written.caption;
            hashtags = written.hashtags;
            title = title || written.title;
            captionBy = written.provider;
        }
        title = title || caption.slice(0, 60);
        const imageUrl = await this.store(image, opts.ingestId ?? null);
        const visual = await this.prisma.visual.create({
            data: {
                title,
                imageUrl,
                caption,
                hashtags,
                language: opts.language ?? null,
                categoryId: opts.categoryId ?? null,
                origin: opts.origin,
                ingestId: opts.ingestId ?? null,
                ownerId: opts.ownerId ?? acting?.id ?? null,
                approvedAt: opts.review ? null : new Date(),
                targetGroupIds: opts.review ? (opts.groupIds ?? []) : [],
                details: { texts: read.texts, scene: read.scene, imageProvider: provider || null, translated: Boolean(provider), captionBy },
            },
        });
        const post = groups.length ? await this.postFor(visual, groups.map((g) => g.id)) : null;
        await this.prisma.activityLog.create({
            data: {
                eventType: 'VISUAL_CREATED',
                message: `Visuel « ${title} »${opts.language ? ` (${(0, image_translator_service_1.languageName)(opts.language)})` : ''} : ` +
                    `${provider ? `image traduite par ${provider}` : 'image d’origine'}, description ${captionBy}` +
                    (post ? `, post pour ${groups.length} groupe(s)` : opts.review ? `, à valider (${audience.length} groupe(s) visé(s))` : ', sans post'),
                metadata: { visualId: visual.id, postId: post?.id ?? null, origin: opts.origin, by: acting?.username ?? null },
            },
        });
        return { visual, postId: post?.id ?? null, groups: groups.length, review: Boolean(opts.review) };
    }
    postFor(visual, groupIds) {
        return this.prisma.post.create({
            data: {
                title: visual.title,
                description: [visual.caption, visual.hashtags.map((h) => `#${h}`).join(' ')].filter(Boolean).join('\n\n'),
                url: null,
                imageUrl: visual.imageUrl,
                noComment: true,
                visualId: visual.id,
                delay: 10 + Math.floor(Math.random() * 51),
                sourceType: 'FACEBOOK',
                ownerId: visual.ownerId,
                targets: { create: groupIds.map((groupId) => ({ groupId })) },
            },
            select: { id: true },
        });
    }
    async createPosts(id, opts, acting) {
        const visual = await this.reachable(id, acting);
        const groupIds = opts.groupIds?.length ? opts.groupIds : visual.targetGroupIds?.length ? visual.targetGroupIds : undefined;
        const groups = await this.audience({ groupIds, language: visual.language, categoryId: visual.categoryId }, acting);
        const already = new Set((await this.prisma.postTarget.findMany({ where: { post: { visualId: id } }, select: { groupId: true } })).map((t) => t.groupId));
        const fresh = groups.map((g) => g.id).filter((g) => !already.has(g));
        if (!fresh.length)
            throw new common_1.BadRequestException('Tous les groupes visés ont déjà ce visuel');
        const post = await this.postFor(visual, fresh);
        if (!visual.approvedAt)
            await this.prisma.visual.update({ where: { id }, data: { approvedAt: new Date() } });
        return { postId: post.id, groups: fresh.length };
    }
    async approve(id, acting) {
        const visual = await this.reachable(id, acting);
        if (visual.approvedAt)
            throw new common_1.BadRequestException('Ce visuel est déjà validé');
        const r = await this.createPosts(id, {}, acting);
        await this.prisma.activityLog.create({
            data: { eventType: 'VISUAL_APPROVED', message: `Visuel « ${visual.title} » validé : post pour ${r.groups} groupe(s)`, metadata: { visualId: id, postId: r.postId, by: acting?.username ?? null } },
        });
        return r;
    }
    async list(q, acting) {
        const page = Math.max(1, Number(q.page) || 1);
        const limit = Math.min(60, Math.max(1, Number(q.limit) || 24));
        const where = {
            ...this.where(acting, q),
            ...(q.review === 'pending' ? { approvedAt: null } : q.review === 'approved' ? { approvedAt: { not: null } } : {}),
        };
        const pending = await this.prisma.visual.groupBy({ by: ['language'], where: { ...this.where(acting), approvedAt: null }, _count: { _all: true } });
        const [rows, total] = await Promise.all([
            this.prisma.visual.findMany({
                where,
                orderBy: { createdAt: 'desc' },
                skip: (page - 1) * limit,
                take: limit,
                include: { category: { select: { id: true, name: true } }, posts: { select: { id: true, targets: { select: { status: true } } } } },
            }),
            this.prisma.visual.count({ where }),
        ]);
        return {
            data: rows.map(({ posts, ...v }) => {
                const targets = posts.flatMap((p) => p.targets);
                return {
                    ...v,
                    posts: posts.length,
                    groups: targets.length,
                    published: targets.filter((t) => t.status === client_1.TargetStatus.PUBLISHED).length,
                    waiting: targets.filter((t) => t.status === client_1.TargetStatus.AVAILABLE).length,
                };
            }),
            meta: { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) },
            pending: {
                total: pending.reduce((n, r) => n + r._count._all, 0),
                byLanguage: Object.fromEntries(pending.map((r) => [r.language ?? '', r._count._all])),
            },
        };
    }
    async update(id, dto, acting) {
        await this.reachable(id, acting);
        const visual = await this.prisma.visual.update({ where: { id }, data: dto });
        if (dto.caption !== undefined || dto.title !== undefined) {
            await this.prisma.post.updateMany({
                where: { visualId: id, targets: { none: { status: { in: [client_1.TargetStatus.CLAIMED, client_1.TargetStatus.CONSUMED] } } } },
                data: { title: visual.title, description: [visual.caption, visual.hashtags.map((h) => `#${h}`).join(' ')].filter(Boolean).join('\n\n') },
            });
        }
        return visual;
    }
    async remove(id, acting) {
        await this.reachable(id, acting);
        const { count } = await this.prisma.post.deleteMany({
            where: { visualId: id, targets: { none: { status: { in: [client_1.TargetStatus.PUBLISHED, client_1.TargetStatus.CLAIMED, client_1.TargetStatus.CONSUMED] } } } },
        });
        await this.prisma.visual.delete({ where: { id } });
        return { deleted: true, postsDeleted: count };
    }
    where(acting, q = {}) {
        const scope = (0, scope_1.scopeOf)(acting);
        return {
            ...(scope ? { ownerId: scope.ownerId } : {}),
            ...(q.language ? { language: q.language } : {}),
            ...(q.search ? { OR: [{ title: { contains: q.search, mode: 'insensitive' } }, { caption: { contains: q.search, mode: 'insensitive' } }] } : {}),
        };
    }
    async reachable(id, acting) {
        const visual = await this.prisma.visual.findFirst({ where: { id, ...this.where(acting) } });
        if (!visual)
            throw new common_1.NotFoundException('Visuel introuvable');
        return visual;
    }
    async store(image, ingestId) {
        const token = (0, node_crypto_1.randomBytes)(18).toString('base64url');
        await this.prisma.generatedImage.create({ data: { token, mimeType: image.mimeType, data: Buffer.from(image.data, 'base64'), ingestId } });
        const base = (this.config.get('PUBLIC_URL') || 'https://post.pulserecipe.com').replace(/\/+$/, '');
        const ext = image.mimeType.includes('jpeg') ? 'jpg' : image.mimeType.split('/')[1] || 'png';
        return `${base}/media/g/${token}.${ext}`;
    }
};
exports.VisualsService = VisualsService;
exports.VisualsService = VisualsService = VisualsService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        config_1.ConfigService,
        rewriter_service_1.RewriterService,
        image_translator_service_1.ImageTranslatorService])
], VisualsService);
//# sourceMappingURL=visuals.service.js.map