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
exports.WordpressService = void 0;
exports.wordpressCaption = wordpressCaption;
exports.wordpressArticleFields = wordpressArticleFields;
const common_1 = require("@nestjs/common");
const client_1 = require("@prisma/client");
const prisma_service_1 = require("../prisma/prisma.service");
const articles_service_1 = require("../articles/articles.service");
function wordpressCaption(dto) {
    const clean = (value) => value
        .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
        .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
        .replace(/<[^>]*>/g, ' ')
        .replace(/(?:https?:\/\/|www\.)\S+/gi, '')
        .replace(/\s+/g, ' ')
        .trim();
    const text = clean(dto.excerpt || '') || clean(dto.content) || clean(dto.title);
    const excerpt = text.length > 280 ? text.slice(0, 277).replace(/\s+\S*$/, '') + '…' : text;
    return `${excerpt}\n\n📖 Read more on our website 👉 Link in the comments 👇`;
}
function wordpressArticleFields(dto) {
    return {
        title: dto.title,
        articleUrl: dto.articleUrl,
        coverImageUrl: dto.imageUrl ?? null,
        excerpt: dto.excerpt ?? null,
        publishedAt: new Date(dto.publishedAt),
        captions: [{ text: wordpressCaption(dto), angle: 'wordpress' }],
        rawData: { ...dto },
    };
}
let WordpressService = class WordpressService {
    prisma;
    articles;
    constructor(prisma, articles) {
        this.prisma = prisma;
        this.articles = articles;
    }
    async publish(dto) {
        const site = new URL(dto.siteUrl);
        const articleUrl = new URL(dto.articleUrl);
        if (site.username ||
            site.password ||
            site.search ||
            site.hash ||
            articleUrl.username ||
            articleUrl.password ||
            site.origin !== articleUrl.origin) {
            throw new common_1.BadRequestException('Le site et l’article doivent appartenir au même domaine, sans identifiants dans les URL');
        }
        const siteUrl = site.origin + site.pathname.replace(/\/+$/, '');
        const externalId = `wordpress:${dto.postId}`;
        const fields = wordpressArticleFields(dto);
        return this.prisma.$transaction(async (tx) => {
            await tx.$executeRaw `SELECT pg_advisory_xact_lock(hashtext(${siteUrl}))`;
            const source = await tx.contentSource.upsert({
                where: { originUrl: siteUrl },
                create: { originUrl: siteUrl, name: dto.siteName },
                update: {},
            });
            const existing = await tx.article.findUnique({
                where: { sourceId_externalId: { sourceId: source.id, externalId } },
            });
            if (existing)
                return this.synchronize(tx, existing, fields);
            const article = await tx.article.create({
                data: {
                    sourceId: source.id,
                    externalId,
                    slug: externalId,
                    jsonUrl: `${siteUrl}/?rest_route=/wp/v2/posts/${dto.postId}`,
                    hashtags: [],
                    ...fields,
                },
            });
            const profiles = await tx.profile.findMany({
                where: { status: 'ACTIVE' },
                include: {
                    profileGroups: {
                        where: { status: 'ACTIVE', group: { status: 'ACTIVE' } },
                    },
                },
            });
            for (const profile of profiles) {
                await tx.post.create({
                    data: {
                        ...this.articles.postDataForSlot(article, 0, {
                            profileId: profile.id,
                            delayMin: 10,
                            delayMax: 60,
                        }),
                        targets: {
                            create: profile.profileGroups.map(({ groupId }) => ({
                                groupId,
                            })),
                        },
                    },
                });
            }
            return {
                articleId: article.id,
                duplicate: false,
                updated: false,
                generated: profiles.length,
                synchronized: 0,
                skipped: 0,
            };
        }, { timeout: 30000 });
    }
    async synchronize(tx, existing, fields) {
        const unchanged = {
            articleId: existing.id,
            duplicate: true,
            updated: false,
            generated: 0,
            synchronized: 0,
            skipped: 0,
        };
        if (!this.hasChanges(existing, fields))
            return unchanged;
        const article = await tx.article.update({
            where: { id: existing.id },
            data: fields,
        });
        const { count } = await tx.post.updateMany({
            where: this.syncablePosts(article.id),
            data: this.articles.postContent(article),
        });
        const total = await tx.post.count({ where: { articleId: article.id } });
        return {
            ...unchanged,
            updated: true,
            synchronized: count,
            skipped: total - count,
        };
    }
    hasChanges(existing, fields) {
        const [caption] = this.articles.captionsOf(existing);
        return (existing.title !== fields.title ||
            existing.articleUrl !== fields.articleUrl ||
            existing.coverImageUrl !== fields.coverImageUrl ||
            existing.excerpt !== fields.excerpt ||
            existing.publishedAt?.getTime() !== fields.publishedAt.getTime() ||
            caption?.text !== fields.captions[0].text);
    }
    syncablePosts(articleId) {
        return {
            articleId,
            status: { not: client_1.PostStatus.ARCHIVED },
            targets: {
                none: {
                    status: client_1.TargetStatus.CLAIMED,
                    claimExpiresAt: { gt: new Date() },
                },
            },
            OR: [
                { targets: { none: {} } },
                {
                    targets: {
                        some: {
                            status: { in: [client_1.TargetStatus.AVAILABLE, client_1.TargetStatus.CLAIMED] },
                        },
                    },
                },
            ],
        };
    }
};
exports.WordpressService = WordpressService;
exports.WordpressService = WordpressService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        articles_service_1.ArticlesService])
], WordpressService);
//# sourceMappingURL=wordpress.service.js.map