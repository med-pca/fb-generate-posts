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
var WordpressService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.WordpressService = void 0;
exports.groupPostExternalId = groupPostExternalId;
exports.wordpressCaption = wordpressCaption;
exports.wordpressArticleFields = wordpressArticleFields;
exports.facebookCaption = facebookCaption;
exports.ingestArticleFields = ingestArticleFields;
const common_1 = require("@nestjs/common");
const client_1 = require("@prisma/client");
const prisma_service_1 = require("../prisma/prisma.service");
const articles_service_1 = require("../articles/articles.service");
const scope_1 = require("../auth/scope");
function groupPostExternalId(articleId, groupId) {
    return `${articleId}:group:${groupId}`;
}
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
function facebookCaption(text) {
    return text
        .replace(/(?:https?:\/\/|www\.)\S+/gi, '')
        .replace(/[^\S\n]+/g, ' ')
        .replace(/ *\n */g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}
function ingestArticleFields(fields, ingest) {
    const original = facebookCaption(ingest?.fbCaption ?? '');
    const fallback = ingest?.generated?.caption ?? '';
    const text = original || fallback;
    if (!text)
        return fields;
    return {
        ...fields,
        captions: [{ text, angle: original ? 'facebook' : 'facebook-fallback' }],
        hashtags: original ? [] : (ingest?.generated?.hashtags ?? []),
    };
}
let WordpressService = WordpressService_1 = class WordpressService {
    prisma;
    articles;
    logger = new common_1.Logger(WordpressService_1.name);
    constructor(prisma, articles) {
        this.prisma = prisma;
        this.articles = articles;
    }
    async publish(dto) {
        const ignored = await this.ignoreIfPaused(dto);
        if (ignored)
            return ignored;
        let result;
        try {
            result = await this.receive(dto);
        }
        catch (error) {
            await this.trace('WORDPRESS_ARTICLE_REJECTED', 'ERROR', dto, {
                message: `« ${dto.title} » refusé : ${error instanceof Error ? error.message : String(error)}`,
            });
            throw error;
        }
        if (!result.duplicate) {
            const noPost = result.noPost === 'no_category'
                ? 'le site n’a pas de catégorie'
                : 'aucun groupe actif dans la catégorie du site';
            await this.trace(result.generated ? 'WORDPRESS_ARTICLE_RECEIVED' : 'WORDPRESS_ARTICLE_NO_POST', result.generated ? 'INFO' : 'WARN', dto, {
                message: result.generated
                    ? `« ${dto.title} » reçu de ${dto.siteName} : ${result.generated} post(s), un par groupe`
                    : `« ${dto.title} » reçu de ${dto.siteName} sans post : ${noPost}`,
                articleId: result.articleId,
            });
        }
        else if (result.updated) {
            await this.trace('WORDPRESS_ARTICLE_UPDATED', 'INFO', dto, {
                message: `« ${dto.title} » modifié sur ${dto.siteName} : ${result.synchronized} post(s) réalignés`,
                articleId: result.articleId,
            });
        }
        return result;
    }
    async ignoreIfPaused(dto) {
        let siteUrl;
        try {
            const site = new URL(dto.siteUrl);
            siteUrl = site.origin + site.pathname.replace(/\/+$/, '');
        }
        catch {
            return null;
        }
        const source = await this.prisma.contentSource.findUnique({
            where: { originUrl: siteUrl },
            select: { id: true, name: true, status: true },
        });
        if (!source)
            return null;
        const externalId = `wordpress:${dto.postId}`;
        const key = { sourceId_externalId: { sourceId: source.id, externalId } };
        const known = await this.prisma.ignoredArticle.findUnique({ where: key });
        const answer = (articleId, reason) => ({
            articleId,
            duplicate: false,
            updated: false,
            generated: 0,
            groups: 0,
            noPost: null,
            synchronized: 0,
            skipped: 0,
            ignored: true,
            reason,
        });
        if (known) {
            return answer(`ignored:${known.id}`, 'ignored_while_inactive');
        }
        if (source.status !== 'INACTIVE')
            return null;
        const existing = await this.prisma.article.findUnique({
            where: key,
            select: { id: true },
        });
        if (existing) {
            await this.trace('WORDPRESS_SITE_INACTIVE', 'WARN', dto, {
                message: `« ${dto.title} » modifié sur ${source.name}, désactivé : modification non reprise`,
                articleId: existing.id,
            });
            return answer(existing.id, 'site_inactive_update_skipped');
        }
        const record = await this.prisma.ignoredArticle.upsert({
            where: key,
            create: {
                sourceId: source.id,
                externalId,
                title: dto.title.slice(0, 500),
                reason: 'site_inactive',
            },
            update: {},
        });
        await this.trace('WORDPRESS_SITE_INACTIVE', 'WARN', dto, {
            message: `« ${dto.title} » ignoré : ${source.name} est désactivé (il ne sera pas créé, même après réactivation)`,
        });
        return answer(`ignored:${record.id}`, 'site_inactive');
    }
    trace(eventType, level, dto, { message, ...extra }) {
        return this.prisma.activityLog
            .create({
            data: {
                eventType,
                level,
                message,
                metadata: {
                    siteUrl: dto.siteUrl,
                    siteName: dto.siteName,
                    wordpressPostId: dto.postId,
                    articleUrl: dto.articleUrl,
                    ingestRef: dto.ingestRef ?? null,
                    ...extra,
                },
            },
        })
            .catch(() => undefined);
    }
    async receive(dto) {
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
        const ingest = await this.ingestFor(dto, siteUrl);
        const fields = ingestArticleFields(wordpressArticleFields(dto), ingest && {
            fbCaption: ingest.fbCaption,
            generated: ingest.generated,
        });
        return this.prisma.$transaction(async (tx) => {
            await tx.$executeRaw `SELECT pg_advisory_xact_lock(hashtext(${siteUrl}))`;
            const received = {
                lastDeliveryAt: new Date(),
                pluginMessage: 'Article reçu de l’extension',
            };
            const known = await tx.contentSource.findUnique({
                where: { originUrl: siteUrl },
                select: { pluginState: true },
            });
            const source = await tx.contentSource.upsert({
                where: { originUrl: siteUrl },
                create: {
                    originUrl: siteUrl,
                    name: dto.siteName,
                    pluginState: client_1.PluginState.CONNECTED,
                    ...received,
                },
                update: this.deliveryState(known?.pluginState, received),
            });
            const existing = await tx.article.findUnique({
                where: { sourceId_externalId: { sourceId: source.id, externalId } },
            });
            if (existing) {
                if (ingest)
                    await this.closeIngest(tx, ingest.id, existing.id);
                return this.synchronize(tx, existing, fields);
            }
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
            const groupIds = await this.audience(tx, source, ingest?.groupIds);
            const noPost = groupIds.length
                ? null
                : source.categoryId
                    ? 'no_group'
                    : 'no_category';
            if (groupIds.length) {
                for (const groupId of groupIds) {
                    await tx.post.create({
                        data: {
                            ...this.articles.postDataForSlot(article, 0, {
                                profileId: null,
                                delayMin: 10,
                                delayMax: 60,
                            }),
                            externalId: groupPostExternalId(article.id, groupId),
                            ownerId: source.ownerId,
                            targets: { create: { groupId } },
                        },
                    });
                }
            }
            else {
                this.logger.warn(`${source.name} : aucun groupe actif dans sa catégorie — ` +
                    `article « ${article.title} » reçu sans post`);
            }
            if (ingest)
                await this.closeIngest(tx, ingest.id, article.id);
            return {
                articleId: article.id,
                duplicate: false,
                updated: false,
                generated: groupIds.length,
                groups: groupIds.length,
                noPost,
                synchronized: 0,
                skipped: 0,
            };
        }, { timeout: 30000 });
    }
    deliveryState(known, received) {
        if (known === client_1.PluginState.BAD_KEY || known === client_1.PluginState.OUTDATED) {
            return { lastDeliveryAt: received.lastDeliveryAt };
        }
        if (known === client_1.PluginState.MISSING) {
            return {
                pluginState: client_1.PluginState.OUTDATED,
                lastDeliveryAt: received.lastDeliveryAt,
                pluginMessage: 'Ancienne extension : elle envoie ses articles, mais ne se laisse pas ' +
                    'vérifier et ne reçoit pas les reprises. Installer la version 1.3.0.',
            };
        }
        return { pluginState: client_1.PluginState.CONNECTED, ...received };
    }
    async audience(tx, source, chosen) {
        if (chosen?.length) {
            const groups = await tx.group.findMany({
                where: { id: { in: chosen }, status: 'ACTIVE' },
                select: { id: true },
            });
            return groups.map(({ id }) => id);
        }
        if (!source.categoryId)
            return [];
        const owner = source.ownerId
            ? await tx.user.findUnique({
                where: { id: source.ownerId },
                select: { id: true, role: true },
            })
            : null;
        const groups = await tx.group.findMany({
            where: {
                categoryId: source.categoryId,
                status: 'ACTIVE',
                ...(owner && owner.role !== client_1.Role.ADMIN
                    ? (0, scope_1.groupWhere)({ ownerId: owner.id })
                    : {}),
            },
            select: { id: true },
        });
        return groups.map(({ id }) => id);
    }
    async ingestFor(dto, siteUrl) {
        if (!dto.ingestRef)
            return null;
        const ingest = await this.prisma.sourceIngest.findUnique({
            where: { id: dto.ingestRef },
        });
        if (!ingest) {
            this.logger.warn(`Reprise ${dto.ingestRef} inconnue : article reçu seul`);
            return null;
        }
        if (ingest.siteUrl !== siteUrl) {
            this.logger.warn(`Reprise ${dto.ingestRef} rattachée à ${ingest.siteUrl}, dépôt reçu de ${siteUrl}`);
            return null;
        }
        return ingest;
    }
    async closeIngest(tx, ingestId, articleId) {
        const { count } = await tx.sourceIngest.updateMany({
            where: { id: ingestId, OR: [{ articleId: null }, { articleId }] },
            data: { articleId, status: client_1.IngestStatus.COMPLETED, lastError: null },
        });
        if (!count) {
            this.logger.warn(`Reprise ${ingestId} déjà rattachée à un autre article : rattachement ignoré`);
        }
    }
    async synchronize(tx, existing, fields) {
        const unchanged = {
            articleId: existing.id,
            duplicate: true,
            updated: false,
            generated: 0,
            groups: 0,
            noPost: null,
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
            caption?.text !== fields.captions[0].text ||
            (fields.hashtags !== undefined &&
                existing.hashtags.join(' ') !== fields.hashtags.join(' ')));
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
exports.WordpressService = WordpressService = WordpressService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        articles_service_1.ArticlesService])
], WordpressService);
//# sourceMappingURL=wordpress.service.js.map