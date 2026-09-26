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
exports.ArticlesService = void 0;
const common_1 = require("@nestjs/common");
const node_net_1 = require("node:net");
const promises_1 = require("node:dns/promises");
const prisma_service_1 = require("../prisma/prisma.service");
const paginated_1 = require("../common/paginated");
let ArticlesService = class ArticlesService {
    prisma;
    constructor(prisma) {
        this.prisma = prisma;
    }
    async findAll({ page, limit }) {
        const [data, total] = await this.prisma.$transaction([
            this.prisma.article.findMany({
                include: { source: true, _count: { select: { posts: true } } },
                orderBy: { importedAt: 'desc' },
                skip: (page - 1) * limit,
                take: limit,
            }),
            this.prisma.article.count(),
        ]);
        return (0, paginated_1.paginated)(data, total, page, limit);
    }
    findOne(id) {
        return this.prisma.article.findUniqueOrThrow({
            where: { id },
            include: { source: true, posts: { include: { targets: true } } },
        });
    }
    update(id, dto) {
        return this.prisma.article.update({ where: { id }, data: dto });
    }
    remove(id) {
        return this.prisma.article.delete({ where: { id } });
    }
    async import(dto) {
        const normalizedJsonUrl = this.toJsonUrl(dto.jsonUrl);
        const jsonUrl = await this.assertSafeRemoteUrl(normalizedJsonUrl);
        const payload = await this.fetchPayload(jsonUrl);
        this.validatePayload(payload);
        const articleUrl = new URL(payload.articleUrl);
        if (articleUrl.protocol !== 'https:' || articleUrl.origin !== jsonUrl.origin) {
            throw new common_1.BadRequestException('articleUrl doit utiliser HTTPS et appartenir au même site que jsonUrl');
        }
        const coverImageUrl = payload.coverImage
            ? new URL(payload.coverImage, articleUrl.origin).toString()
            : undefined;
        const source = await this.prisma.contentSource.upsert({
            where: { originUrl: articleUrl.origin },
            create: {
                originUrl: articleUrl.origin,
                name: dto.sourceName?.trim() || articleUrl.hostname,
            },
            update: dto.sourceName?.trim() ? { name: dto.sourceName.trim() } : {},
        });
        return this.prisma.article.upsert({
            where: {
                sourceId_externalId: { sourceId: source.id, externalId: payload.id },
            },
            create: {
                ...this.articleData(payload, jsonUrl.toString(), coverImageUrl),
                sourceId: source.id,
            },
            update: this.articleData(payload, jsonUrl.toString(), coverImageUrl),
            include: { source: true, _count: { select: { posts: true } } },
        });
    }
    async generatePosts(id, dto) {
        if (dto.delayMin > dto.delayMax) {
            throw new common_1.BadRequestException('delayMin doit être inférieur ou égal à delayMax');
        }
        const article = await this.prisma.article.findUnique({ where: { id } });
        if (!article)
            throw new common_1.NotFoundException('Article introuvable');
        const groupIds = [...new Set(dto.groupIds)];
        const validGroups = await this.prisma.group.count({
            where: {
                id: { in: groupIds },
                profiles: { some: { profileId: dto.profileId, status: 'ACTIVE' } },
            },
        });
        if (validGroups !== groupIds.length) {
            throw new common_1.BadRequestException('Tous les groupes doivent être associés au profil sélectionné');
        }
        const captions = this.captionsOf(article);
        if (!captions.length) {
            throw new common_1.BadRequestException('Cet article ne contient aucune légende exploitable');
        }
        return this.prisma.$transaction(captions.map((_, slot) => {
            const { profileId, sourceType, externalId, ...content } = this.postDataForSlot(article, slot, dto);
            return this.prisma.post.upsert({
                where: { sourceType_externalId: { sourceType, externalId } },
                create: {
                    ...content,
                    profileId,
                    sourceType,
                    externalId,
                    targets: { create: groupIds.map((groupId) => ({ groupId })) },
                },
                update: {
                    ...content,
                    targets: {
                        deleteMany: { status: 'AVAILABLE', groupId: { notIn: groupIds } },
                        createMany: {
                            data: groupIds.map((groupId) => ({ groupId })),
                            skipDuplicates: true,
                        },
                    },
                },
                include: { targets: true },
            });
        }));
    }
    captionsOf(article) {
        const captions = article.captions;
        return Array.isArray(captions)
            ? captions.filter((caption) => caption?.text)
            : [];
    }
    postDataForSlot(article, slot, dto) {
        const captions = this.captionsOf(article);
        const caption = captions[slot % captions.length];
        const hashtags = article.hashtags.map((tag) => `#${tag.replace(/^#/, '')}`);
        return {
            articleId: article.id,
            profileId: dto.profileId,
            title: article.title,
            description: [caption.text, hashtags.join(' ')]
                .filter(Boolean)
                .join('\n\n'),
            url: article.articleUrl,
            imageUrl: article.coverImageUrl,
            delay: this.randomInt(dto.delayMin, dto.delayMax),
            sourceType: 'JSON',
            externalId: this.slotExternalId(article.id, dto.profileId, slot, captions.length),
            socialAngle: caption.angle,
            rawData: caption,
        };
    }
    postContent(article, slot = 0) {
        const { profileId, delay, sourceType, externalId, ...content } = this.postDataForSlot(article, slot, {
            profileId: '',
            delayMin: 0,
            delayMax: 0,
        });
        return content;
    }
    slotExternalId(articleId, profileId, slot, captionCount) {
        const index = slot % captionCount;
        const variant = Math.floor(slot / captionCount);
        return variant === 0
            ? `${articleId}:${profileId}:${index}`
            : `${articleId}:${profileId}:${index}:v${variant}`;
    }
    articleData(payload, jsonUrl, coverImageUrl) {
        return {
            externalId: payload.id,
            jsonUrl,
            title: payload.title,
            slug: payload.slug,
            excerpt: payload.excerpt,
            metaDescription: payload.metaDescription,
            articleUrl: payload.articleUrl,
            coverImageUrl,
            course: payload.course,
            cuisine: payload.cuisine,
            servings: payload.servings,
            prepMinutes: payload.prepMinutes,
            cookMinutes: payload.cookMinutes,
            totalMinutes: payload.totalMinutes,
            calories: payload.calories,
            publishedAt: payload.publishedAt ? new Date(payload.publishedAt) : undefined,
            captions: payload.socialPost.captions,
            hashtags: payload.socialPost.hashtags ?? [],
            imagePrompt: payload.socialPost.imagePrompt,
            rawData: payload,
            importedAt: new Date(),
        };
    }
    async fetchPayload(url) {
        let response;
        try {
            response = await fetch(url, {
                signal: AbortSignal.timeout(10_000),
                headers: { accept: 'application/json' },
            });
        }
        catch {
            throw new common_1.BadGatewayException('Impossible de contacter la source de l’article');
        }
        if (!response.ok) {
            throw new common_1.BadGatewayException(`La source a répondu avec le statut ${response.status}`);
        }
        const length = Number(response.headers.get('content-length') || 0);
        if (length > 1_000_000)
            throw new common_1.BadRequestException('Réponse JSON trop volumineuse');
        const text = await response.text();
        if (text.length > 1_000_000)
            throw new common_1.BadRequestException('Réponse JSON trop volumineuse');
        try {
            return JSON.parse(text);
        }
        catch {
            throw new common_1.BadGatewayException('La source ne retourne pas un JSON valide');
        }
    }
    validatePayload(payload) {
        if (!payload?.id ||
            !payload.title ||
            !payload.slug ||
            !payload.articleUrl ||
            !Array.isArray(payload.socialPost?.captions) ||
            !payload.socialPost.captions.length ||
            payload.socialPost.captions.some((caption) => !caption?.text)) {
            throw new common_1.BadRequestException('JSON incomplet : id, title, slug, articleUrl et socialPost.captions sont requis');
        }
    }
    async assertSafeRemoteUrl(value) {
        const url = new URL(value);
        if (url.protocol !== 'https:') {
            throw new common_1.BadRequestException('Seules les sources HTTPS sont acceptées');
        }
        let addresses;
        try {
            addresses = await (0, promises_1.lookup)(url.hostname, { all: true });
        }
        catch {
            throw new common_1.BadGatewayException('Le nom de domaine de la source est temporairement inaccessible');
        }
        if (!addresses.length || addresses.some(({ address }) => this.isPrivateIp(address))) {
            throw new common_1.BadRequestException('Les adresses locales ou privées sont interdites');
        }
        return url;
    }
    toJsonUrl(value) {
        const url = new URL(value);
        const recipeMatch = url.pathname.match(/^\/recipes\/([^/]+)\/?$/);
        if (recipeMatch) {
            url.pathname = `/api/blog/${recipeMatch[1]}/post`;
            url.search = '';
            url.hash = '';
        }
        return url.toString();
    }
    isPrivateIp(address) {
        if (!(0, node_net_1.isIP)(address))
            return true;
        const normalized = address.toLowerCase();
        return (normalized === '::1' ||
            normalized.startsWith('fc') ||
            normalized.startsWith('fd') ||
            normalized.startsWith('fe80:') ||
            normalized.startsWith('127.') ||
            normalized.startsWith('10.') ||
            normalized.startsWith('192.168.') ||
            /^172\.(1[6-9]|2\d|3[01])\./.test(normalized) ||
            /^169\.254\./.test(normalized));
    }
    randomInt(min, max) {
        return Math.floor(Math.random() * (max - min + 1)) + min;
    }
};
exports.ArticlesService = ArticlesService;
exports.ArticlesService = ArticlesService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], ArticlesService);
//# sourceMappingURL=articles.service.js.map