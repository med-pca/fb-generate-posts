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
exports.articleFilters = articleFilters;
const common_1 = require("@nestjs/common");
const client_1 = require("@prisma/client");
const prisma_service_1 = require("../prisma/prisma.service");
const paginated_1 = require("../common/paginated");
const scope_1 = require("../auth/scope");
const post_groups_1 = require("../posts/post-groups");
const safe_fetch_1 = require("../common/safe-fetch");
function articleFilters(q, scope) {
    const and = [scope];
    const search = q.search?.trim();
    if (search) {
        and.push({
            OR: [
                { title: { contains: search, mode: 'insensitive' } },
                { articleUrl: { contains: search, mode: 'insensitive' } },
                { slug: { contains: search, mode: 'insensitive' } },
                { externalId: { contains: search } },
            ],
        });
    }
    if (q.siteId)
        and.push({ sourceId: q.siteId });
    if (q.categoryId)
        and.push({ source: { categoryId: q.categoryId === 'none' ? null : q.categoryId } });
    if (q.status)
        and.push({ status: q.status });
    if (q.archived === 'yes')
        and.push({ archivedAt: { not: null } });
    if (q.archived === 'no')
        and.push({ archivedAt: null });
    const inQueue = { status: { in: ['AVAILABLE', 'CLAIMED', 'CONSUMED'] } };
    if (q.diffusion === 'queued')
        and.push({ posts: { some: { targets: { some: inQueue } } } });
    if (q.diffusion === 'published')
        and.push({ posts: { some: { targets: { some: { status: 'PUBLISHED' } } } } });
    if (q.diffusion === 'failed')
        and.push({ posts: { some: { targets: { some: { status: 'FAILED' } } } } });
    if (q.diffusion === 'never')
        and.push({ posts: { none: {} } });
    if (q.diffusion === 'idle')
        and.push({ posts: { some: {} } }, { posts: { none: { targets: { some: inQueue } } } });
    if (q.from)
        and.push({ importedAt: { gte: new Date(q.from) } });
    if (q.to) {
        const to = new Date(q.to);
        if (/^\d{4}-\d{2}-\d{2}$/.test(q.to))
            to.setUTCDate(to.getUTCDate() + 1);
        and.push({ importedAt: { lt: to } });
    }
    return and;
}
let ArticlesService = class ArticlesService {
    prisma;
    constructor(prisma) {
        this.prisma = prisma;
    }
    async findAll(query, acting) {
        const { page, limit } = query;
        const where = { AND: articleFilters(query, (0, scope_1.articleWhere)((0, scope_1.scopeOf)(acting))) };
        const orderBy = query.sort === 'oldest'
            ? [{ importedAt: 'asc' }]
            : query.sort === 'title'
                ? [{ title: 'asc' }]
                : query.sort === 'priority'
                    ? [{ priority: 'desc' }, { importedAt: 'desc' }]
                    : query.sort === 'published'
                        ? [{ publishedAt: { sort: 'desc', nulls: 'last' } }]
                        : [{ importedAt: 'desc' }];
        const [data, total] = await this.prisma.$transaction([
            this.prisma.article.findMany({
                where,
                include: { source: true, _count: { select: { posts: true } } },
                orderBy,
                skip: (page - 1) * limit,
                take: limit,
            }),
            this.prisma.article.count({ where }),
        ]);
        return (0, paginated_1.paginated)(data, total, page, limit);
    }
    async findOne(id, acting) {
        const article = await this.prisma.article.findFirst({
            where: { id, ...(0, scope_1.articleWhere)((0, scope_1.scopeOf)(acting)) },
            include: { source: true, posts: { include: { targets: true } } },
        });
        if (!article)
            throw new common_1.NotFoundException('Article introuvable');
        return article;
    }
    async reachable(id, acting) {
        const article = await this.prisma.article.findFirst({
            where: { id, ...(0, scope_1.articleWhere)((0, scope_1.scopeOf)(acting)) },
            select: { id: true },
        });
        if (!article)
            throw new common_1.NotFoundException('Article introuvable');
        return article;
    }
    async manageable(id, acting) {
        const article = await this.prisma.article.findFirst({
            where: { id, ...(0, scope_1.articleManageWhere)((0, scope_1.scopeOf)(acting)) },
            select: { id: true },
        });
        if (!article)
            throw new common_1.NotFoundException('Article introuvable');
        return article;
    }
    async update(id, dto, acting) {
        await this.manageable(id, acting);
        return this.prisma.article.update({ where: { id }, data: dto });
    }
    async remove(id, acting) {
        await this.manageable(id, acting);
        return this.prisma.article.delete({ where: { id } });
    }
    async import(dto, acting = null) {
        const normalizedJsonUrl = this.toJsonUrl(dto.jsonUrl);
        const jsonUrl = await (0, safe_fetch_1.assertSafeRemoteUrl)(normalizedJsonUrl);
        const payload = await this.fetchPayload(jsonUrl);
        this.validatePayload(payload);
        const articleUrl = new URL(payload.articleUrl);
        if (articleUrl.protocol !== 'https:' ||
            articleUrl.origin !== jsonUrl.origin) {
            throw new common_1.BadRequestException('articleUrl doit utiliser HTTPS et appartenir au même site que jsonUrl');
        }
        const coverImageUrl = payload.coverImage
            ? new URL(payload.coverImage, articleUrl.origin).toString()
            : undefined;
        const scope = (0, scope_1.scopeOf)(acting);
        const known = await this.prisma.contentSource.findUnique({
            where: { originUrl: articleUrl.origin },
            select: { id: true },
        });
        if (known) {
            const usable = await this.prisma.contentSource.findFirst({
                where: { id: known.id, ...(0, scope_1.siteWhere)(scope) },
                select: { id: true },
            });
            if (!usable)
                throw new common_1.NotFoundException('Site introuvable');
        }
        const owns = !known ||
            !!(await this.prisma.contentSource.findFirst({
                where: { id: known.id, ...(0, scope_1.siteManageWhere)(scope) },
                select: { id: true },
            }));
        const source = await this.prisma.contentSource.upsert({
            where: { originUrl: articleUrl.origin },
            create: {
                originUrl: articleUrl.origin,
                name: dto.sourceName?.trim() || articleUrl.hostname,
                ownerId: acting?.id ?? null,
            },
            update: owns && dto.sourceName?.trim() ? { name: dto.sourceName.trim() } : {},
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
    async generatePosts(id, dto, acting = null) {
        await this.reachable(id, acting);
        if (dto.delayMin > dto.delayMax) {
            throw new common_1.BadRequestException('delayMin doit être inférieur ou égal à delayMax');
        }
        const article = await this.prisma.article.findUnique({ where: { id } });
        if (!article)
            throw new common_1.NotFoundException('Article introuvable');
        if (article.archivedAt) {
            throw new common_1.ConflictException('Cet article est archivé : ses posts ont commencé à être publiés, il ne sert plus');
        }
        const groupIds = await (0, post_groups_1.postGroupIds)(this.prisma, dto.groupIds, acting);
        const captions = this.captionsOf(article);
        if (!captions.length) {
            throw new common_1.BadRequestException('Cet article ne contient aucune légende exploitable');
        }
        return this.prisma.$transaction(captions.map((_, slot) => {
            const { profileId, sourceType, externalId, ...content } = this.postDataForSlot(article, slot, { ...dto, profileId: null });
            return this.prisma.post.upsert({
                where: { sourceType_externalId: { sourceType, externalId } },
                create: {
                    ...content,
                    profileId,
                    ownerId: acting?.id ?? null,
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
    async recreatePreview(id, acting) {
        await this.reachable(id, acting);
        const article = await this.prisma.article.findUnique({
            where: { id },
            select: { id: true, title: true, archivedAt: true, status: true, source: { select: { categoryId: true, category: { select: { name: true } } } } },
        });
        if (!article)
            throw new common_1.NotFoundException('Article introuvable');
        const posts = await this.prisma.post.findMany({ where: { articleId: id }, select: { id: true } });
        const categoryId = article.source.categoryId;
        const groups = categoryId
            ? await this.prisma.group.findMany({
                where: { categoryId, status: 'ACTIVE', ...(0, scope_1.groupWhere)((0, scope_1.scopeOf)(acting)) },
                select: { id: true, name: true },
                orderBy: { name: 'asc' },
            })
            : [];
        const targets = posts.length
            ? await this.prisma.postTarget.findMany({
                where: { postId: { in: posts.map((p) => p.id) } },
                select: { groupId: true, status: true, publishedAt: true, repeatRound: true },
            })
            : [];
        const byGroup = new Map();
        const busy = (x) => Boolean(x && ['AVAILABLE', 'CLAIMED', 'CONSUMED'].includes(x.status));
        for (const t of targets)
            if (!busy(byGroup.get(t.groupId)))
                byGroup.set(t.groupId, t);
        return {
            article: { id: article.id, title: article.title, archivedAt: article.archivedAt, status: article.status, category: article.source.category?.name ?? null },
            hasPost: posts.length > 0,
            groups: groups.map((g) => {
                const t = byGroup.get(g.id);
                return { id: g.id, name: g.name, state: t ? t.status : 'NEVER', publishedAt: t?.publishedAt ?? null, times: t ? t.repeatRound + (t.status === 'PUBLISHED' ? 1 : 0) : 0 };
            }),
        };
    }
    async recreatePosts(id, dto, acting) {
        const preview = await this.recreatePreview(id, acting);
        if (!preview.hasPost) {
            throw new common_1.BadRequestException('Cet article n’a encore aucun post : utilisez « Créer les posts »');
        }
        const known = new Set(preview.groups.map((g) => g.id));
        const wanted = (dto.groupIds?.length ? dto.groupIds : [...known]).filter((g) => known.has(g));
        if (!wanted.length)
            throw new common_1.BadRequestException('Choisissez au moins un groupe actif de sa catégorie');
        const now = new Date();
        const posts = await this.prisma.post.findMany({ where: { articleId: id }, orderBy: { createdAt: 'asc' }, select: { id: true, title: true } });
        const post = posts[0];
        const result = await this.prisma.$transaction(async (tx) => {
            await tx.article.update({ where: { id }, data: { status: 'ACTIVE' } });
            const existing = await tx.postTarget.findMany({
                where: { post: { articleId: id }, groupId: { in: wanted } },
                orderBy: { createdAt: 'asc' },
                select: { id: true, postId: true, groupId: true, status: true, facebookUrl: true },
            });
            const busy = (x) => Boolean(x && ['AVAILABLE', 'CLAIMED', 'CONSUMED'].includes(x.status));
            const have = new Map();
            for (const t of existing)
                if (!busy(have.get(t.groupId)))
                    have.set(t.groupId, t);
            const reopened = [...new Set([post.id, ...[...have.values()].map((t) => t.postId)])];
            await tx.post.updateMany({ where: { id: { in: reopened } }, data: { status: 'AVAILABLE' } });
            const kept = [...have.values()];
            const again = kept.filter((t) => ['PUBLISHED', 'FAILED', 'CANCELLED'].includes(t.status));
            const queued = kept.filter((t) => ['AVAILABLE', 'CLAIMED', 'CONSUMED'].includes(t.status)).length;
            if (again.length) {
                await tx.$executeRaw(client_1.Prisma.sql `
          UPDATE post_targets SET
            status = 'AVAILABLE'::"TargetStatus",
            repeat_round = repeat_round + 1,
            claimed_at = NULL, claim_expires_at = NULL, consumed_at = NULL,
            published_at = NULL, comment_external_id = NULL, commented_at = NULL,
            link_updated_at = NULL, facebook_url = NULL, last_error = NULL,
            verify_status = NULL, verified_at = NULL, verify_detail = NULL,
            verify_claimed_until = NULL, verify_attempts = 0, republish_count = 0,
            approval_pending_since = NULL, approval_checked_at = NULL, approval_checks = 0,
            forced_profile_id = NULL, forced_at = NULL, avoid_profile_id = NULL,
            updated_at = ${now}
          WHERE id IN (${client_1.Prisma.join(again.map((t) => t.id))})`);
                await tx.publicationTrace.createMany({
                    data: again.map((t) => ({ postTargetId: t.id, kind: 'RECREATED', facebookUrl: t.facebookUrl, actor: acting?.username ?? 'clé globale', detail: 'recréé depuis la page Articles' })),
                });
            }
            const missing = wanted.filter((g) => !have.has(g));
            if (missing.length)
                await tx.postTarget.createMany({ data: missing.map((groupId) => ({ postId: post.id, groupId })), skipDuplicates: true });
            await tx.activityLog.create({
                data: {
                    postId: post.id,
                    eventType: 'ARTICLE_POSTS_RECREATED',
                    message: `« ${preview.article.title} » recréé : ${again.length} groupe(s) remis en file, ${missing.length} ajouté(s)${queued ? `, ${queued} déjà en file` : ''}`,
                    metadata: { articleId: id, requeued: again.length, created: missing.length, alreadyQueued: queued, by: acting?.username ?? 'clé globale' },
                },
            });
            return { requeued: again.length, created: missing.length, alreadyQueued: queued };
        });
        return { ...result, groups: wanted.length };
    }
    async recreateMany(articleIds, acting) {
        const ids = [...new Set(articleIds)];
        if (!ids.length)
            throw new common_1.BadRequestException('Choisissez au moins un article');
        if (ids.length > 200)
            throw new common_1.BadRequestException('200 articles au plus à la fois');
        const results = [];
        for (const id of ids) {
            const title = (await this.prisma.article.findUnique({ where: { id }, select: { title: true } }))?.title ?? id;
            try {
                const r = await this.recreatePosts(id, {}, acting);
                results.push({ id, title, ok: true, requeued: r.requeued, created: r.created, alreadyQueued: r.alreadyQueued });
            }
            catch (error) {
                results.push({ id, title, ok: false, requeued: 0, created: 0, alreadyQueued: 0, error: error instanceof Error ? error.message : String(error) });
            }
        }
        const sum = (k) => results.reduce((n, r) => n + r[k], 0);
        return {
            articles: results.filter((r) => r.ok).length,
            failed: results.filter((r) => !r.ok).length,
            requeued: sum('requeued'),
            created: sum('created'),
            alreadyQueued: sum('alreadyQueued'),
            results,
        };
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
            priority: article.priority ?? 0,
        };
    }
    postContent(article, slot = 0) {
        const { profileId, delay, sourceType, externalId, priority, ...content } = this.postDataForSlot(article, slot, {
            profileId: '',
            delayMin: 0,
            delayMax: 0,
        });
        return content;
    }
    slotExternalId(articleId, profileId, slot, captionCount) {
        const index = slot % captionCount;
        const variant = Math.floor(slot / captionCount);
        const owner = profileId ?? 'open';
        return variant === 0
            ? `${articleId}:${owner}:${index}`
            : `${articleId}:${owner}:${index}:v${variant}`;
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
            publishedAt: payload.publishedAt
                ? new Date(payload.publishedAt)
                : undefined,
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