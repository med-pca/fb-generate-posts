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
var SiteRelayService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.SiteRelayService = exports.RELAY_PLUGIN_VERSION = void 0;
exports.versionAtLeast = versionAtLeast;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const prisma_service_1 = require("../prisma/prisma.service");
const scope_1 = require("../auth/scope");
const wordpress_service_1 = require("../wordpress/wordpress.service");
const wordpress_writer_service_1 = require("../ingest/wordpress-writer.service");
const TIMEOUT_MS = 60_000;
exports.RELAY_PLUGIN_VERSION = '1.6.0';
function versionAtLeast(version, wanted) {
    const parts = (v) => v.split('.').map((n) => Number.parseInt(n, 10) || 0);
    const [a, b] = [parts(version || '0'), parts(wanted)];
    for (let i = 0; i < Math.max(a.length, b.length); i++) {
        if ((a[i] ?? 0) !== (b[i] ?? 0))
            return (a[i] ?? 0) > (b[i] ?? 0);
    }
    return true;
}
let SiteRelayService = SiteRelayService_1 = class SiteRelayService {
    prisma;
    config;
    wordpress;
    writer;
    logger = new common_1.Logger(SiteRelayService_1.name);
    running = new Set();
    constructor(prisma, config, wordpress, writer) {
        this.prisma = prisma;
        this.config = config;
        this.wordpress = wordpress;
        this.writer = writer;
    }
    async pause(id, dto, acting) {
        const site = await this.manageable(id, acting);
        if (site.pausedAt)
            throw new common_1.ConflictException(`${site.name} est déjà en pause`);
        let relay = null;
        const warnings = [];
        if (dto.relaySiteId) {
            relay = await this.manageable(dto.relaySiteId, acting);
            if (relay.id === site.id)
                throw new common_1.BadRequestException('Un site ne peut pas se relayer lui-même');
            if (relay.status !== 'ACTIVE' || relay.pausedAt) {
                throw new common_1.BadRequestException(`${relay.name} n’est pas actif : choisissez un site qui publie`);
            }
            const [from, to] = await Promise.all([this.pluginStatus(site), this.pluginStatus(relay)]);
            for (const [s, status] of [[site, from], [relay, to]]) {
                if (!versionAtLeast(status.version, exports.RELAY_PLUGIN_VERSION)) {
                    throw new common_1.BadRequestException(`Le plugin de ${s.name} est en version ${status.version || 'inconnue'} : installez la ${exports.RELAY_PLUGIN_VERSION} (page Sites) sur les deux sites`);
                }
            }
            if ((from.permalinkStructure ?? '') !== (to.permalinkStructure ?? '')) {
                warnings.push(`Structure des liens différente (${from.permalinkStructure || 'par défaut'} sur ${site.name}, ` +
                    `${to.permalinkStructure || 'par défaut'} sur ${relay.name}) : alignez-les dans Réglages → Permaliens, ` +
                    'sinon les anciens liens redirigés ne trouveront pas leur article.');
            }
        }
        const reason = dto.reason?.trim() || 'limite';
        await this.prisma.$transaction([
            this.prisma.contentSource.update({
                where: { id: site.id },
                data: { pausedAt: new Date(), pauseReason: reason, relayId: relay?.id ?? null, redirectError: null },
            }),
            this.prisma.activityLog.create({
                data: {
                    eventType: 'SITE_PAUSED',
                    level: 'WARN',
                    message: `⏸ ${site.name} en pause (${reason})` + (relay ? ` : ${relay.name} prend le relais` : ' : ses posts attendent la réactivation'),
                    metadata: { siteId: site.id, relayId: relay?.id ?? null, by: by(acting) },
                },
            }),
        ]);
        let copies = 0;
        if (relay) {
            copies = await this.plan(site, relay);
            this.start(site.id);
        }
        return { ...(await this.detail(site.id, acting)), copies, warnings };
    }
    async resume(id, acting) {
        const site = await this.manageable(id, acting);
        if (!site.pausedAt)
            throw new common_1.ConflictException(`${site.name} n’est pas en pause`);
        let redirectError = null;
        try {
            await this.setRedirect(site, null);
        }
        catch (error) {
            redirectError = `Redirection non retirée : ${message(error)} — retirez-la avec « Réactiver » à nouveau ou dans le plugin`;
        }
        await this.prisma.$transaction([
            this.prisma.articleCopy.updateMany({
                where: { status: 'pending', sourceArticle: { sourceId: site.id } },
                data: { status: 'cancelled', error: 'site réactivé avant la copie' },
            }),
            this.prisma.contentSource.update({
                where: { id: site.id },
                data: {
                    pausedAt: null,
                    pauseReason: null,
                    relayId: null,
                    ...(redirectError ? { redirectError } : { redirectSince: null, redirectError: null }),
                },
            }),
            this.prisma.activityLog.create({
                data: {
                    eventType: 'SITE_RESUMED',
                    message: `▶ ${site.name} réactivé` + (redirectError ? ` — ${redirectError}` : ' : redirection retirée'),
                    metadata: { siteId: site.id, by: by(acting) },
                },
            }),
        ]);
        return { ...(await this.detail(site.id, acting)), warnings: redirectError ? [redirectError] : [] };
    }
    async retry(id, acting) {
        const site = await this.pausedWithRelay(id, acting);
        await this.prisma.articleCopy.updateMany({
            where: { status: 'failed', targetSiteId: site.relayId, sourceArticle: { sourceId: site.id } },
            data: { status: 'pending', error: null },
        });
        this.start(site.id);
        return this.detail(site.id, acting);
    }
    async redirectNow(id, acting) {
        const site = await this.pausedWithRelay(id, acting);
        const relay = await this.prisma.contentSource.findUniqueOrThrow({ where: { id: site.relayId } });
        await this.redirectTo(site, relay);
        return this.detail(site.id, acting);
    }
    async detail(id, acting) {
        const site = await this.manageable(id, acting);
        const full = await this.prisma.contentSource.findUniqueOrThrow({
            where: { id: site.id },
            select: {
                pausedAt: true,
                pauseReason: true,
                redirectSince: true,
                redirectError: true,
                relay: { select: { id: true, name: true, originUrl: true } },
            },
        });
        const rows = full.relay
            ? await this.prisma.articleCopy.findMany({
                where: { targetSiteId: full.relay.id, sourceArticle: { sourceId: site.id } },
                select: { status: true, movedPosts: true, error: true, permalink: true, sourceArticle: { select: { title: true } } },
                orderBy: { updatedAt: 'desc' },
            })
            : [];
        const count = (status) => rows.filter((r) => r.status === status).length;
        return {
            siteId: site.id,
            name: site.name,
            pausedAt: full.pausedAt,
            reason: full.pauseReason,
            relay: full.relay,
            redirect: { since: full.redirectSince, error: full.redirectError, target: full.relay?.originUrl ?? null },
            running: this.running.has(site.id),
            copies: {
                total: rows.length,
                pending: count('pending'),
                done: count('done'),
                failed: count('failed'),
                skipped: count('skipped'),
                movedPosts: rows.reduce((n, r) => n + r.movedPosts, 0),
            },
            errors: rows
                .filter((r) => r.status === 'failed' || r.status === 'skipped')
                .slice(0, 20)
                .map((r) => ({ title: r.sourceArticle.title, status: r.status, error: r.error })),
        };
    }
    async copyArticles(dto, acting) {
        const target = await this.usable(dto.targetSiteId, acting);
        if (target.status !== 'ACTIVE' || target.pausedAt)
            throw new common_1.BadRequestException(`${target.name} n’est pas actif : choisissez un site qui publie`);
        const postsMode = dto.posts === 'move' ? 'move' : 'new';
        const ids = [...new Set(dto.articleIds ?? [])];
        if (!ids.length)
            throw new common_1.BadRequestException('Choisissez au moins un article');
        if (ids.length > 500)
            throw new common_1.BadRequestException('500 articles au plus par copie');
        const articles = await this.prisma.article.findMany({
            where: { id: { in: ids }, ...(0, scope_1.articleWhere)((0, scope_1.scopeOf)(acting)) },
            select: {
                id: true,
                title: true,
                externalId: true,
                source: { select: { id: true, name: true, originUrl: true, depositKey: true, status: true, pausedAt: true, relayId: true, ownerId: true } },
                copies: { where: { targetSiteId: target.id }, select: { id: true, status: true, newArticleId: true } },
            },
        });
        const scope = (0, scope_1.scopeOf)(acting);
        const mayMove = (a) => !scope || a.source.ownerId === scope.ownerId;
        const targetPlugin = await this.pluginStatus(target);
        if (!versionAtLeast(targetPlugin.version, exports.RELAY_PLUGIN_VERSION)) {
            throw new common_1.BadRequestException(`Le plugin de ${target.name} est en version ${targetPlugin.version || 'inconnue'} : installez la ${exports.RELAY_PLUGIN_VERSION} (page Sites)`);
        }
        const sourceOk = new Map();
        const skipped = [];
        const planned = [];
        for (const missing of ids.filter((id) => !articles.some((a) => a.id === id)))
            skipped.push({ title: missing, reason: 'article introuvable' });
        for (const a of articles) {
            if (!a.externalId.startsWith('wordpress:')) {
                skipped.push({ title: a.title, reason: 'pas un article WordPress : rien à copier' });
                continue;
            }
            if (a.source.id === target.id) {
                skipped.push({ title: a.title, reason: 'déjà sur ce site' });
                continue;
            }
            if (postsMode === 'move' && !mayMove(a)) {
                skipped.push({ title: a.title, reason: `réaffecter ses posts est réservé au propriétaire de ${a.source.name} : choisissez « Créer de nouveaux posts »` });
                continue;
            }
            const before = a.copies[0];
            if (before?.status === 'done' && before.newArticleId) {
                skipped.push({ title: a.title, reason: `déjà copié vers ${target.name}` });
                continue;
            }
            const relaying = a.source.pausedAt && a.source.relayId === target.id;
            if (before && (this.manualRunning.has(before.id) || (before.status === 'pending' && relaying))) {
                skipped.push({ title: a.title, reason: 'copie déjà en cours' });
                continue;
            }
            if (!sourceOk.has(a.source.id)) {
                const status = await this.pluginStatus(a.source).catch((e) => ({ version: undefined, error: message(e) }));
                sourceOk.set(a.source.id, versionAtLeast(status.version, exports.RELAY_PLUGIN_VERSION) ? null : `plugin de ${a.source.name} en version ${status.version || 'inconnue'} : installez la ${exports.RELAY_PLUGIN_VERSION}`);
            }
            const bad = sourceOk.get(a.source.id);
            if (bad) {
                skipped.push({ title: a.title, reason: bad });
                continue;
            }
            const copy = await this.prisma.articleCopy.upsert({
                where: { sourceArticleId_targetSiteId: { sourceArticleId: a.id, targetSiteId: target.id } },
                create: { sourceArticleId: a.id, targetSiteId: target.id, status: 'pending', postsMode },
                update: { status: 'pending', postsMode, error: null, newArticleId: null, movedPosts: 0 },
            });
            planned.push(copy.id);
        }
        if (planned.length) {
            await this.prisma.activityLog.create({
                data: {
                    eventType: 'ARTICLES_COPIED',
                    message: `📋 ${planned.length} article(s) copié(s) vers ${target.name} (${postsMode === 'new' ? 'nouveaux posts' : 'posts en attente déplacés'})`,
                    metadata: { targetSiteId: target.id, copyIds: planned, postsMode, by: by(acting) },
                },
            });
            this.startManual(planned);
        }
        return { target: { id: target.id, name: target.name }, postsMode, planned: planned.length, copyIds: planned, skipped };
    }
    async copies(ids, acting) {
        const rows = await this.prisma.articleCopy.findMany({
            where: { id: { in: ids.slice(0, 500) }, sourceArticle: (0, scope_1.articleWhere)((0, scope_1.scopeOf)(acting)) },
            select: {
                id: true,
                status: true,
                error: true,
                permalink: true,
                movedPosts: true,
                postsMode: true,
                sourceArticle: { select: { title: true } },
                targetSite: { select: { name: true } },
            },
        });
        const count = (s) => rows.filter((r) => r.status === s).length;
        return {
            total: rows.length,
            pending: count('pending'),
            done: count('done'),
            failed: count('failed'),
            posts: rows.reduce((n, r) => n + r.movedPosts, 0),
            rows: rows.map((r) => ({ id: r.id, title: r.sourceArticle.title, target: r.targetSite.name, status: r.status, error: r.error, permalink: r.permalink, posts: r.movedPosts, postsMode: r.postsMode })),
        };
    }
    manualRunning = new Set();
    startManual(copyIds) {
        const todo = copyIds.filter((id) => !this.manualRunning.has(id));
        todo.forEach((id) => this.manualRunning.add(id));
        void (async () => {
            for (const id of todo) {
                try {
                    const copy = await this.prisma.articleCopy.findUnique({
                        where: { id },
                        include: {
                            sourceArticle: { select: { id: true, title: true, externalId: true, source: { select: { id: true, name: true, originUrl: true, depositKey: true, status: true, pausedAt: true, relayId: true } } } },
                            targetSite: { select: { id: true, name: true, originUrl: true, depositKey: true, status: true, pausedAt: true, relayId: true } },
                        },
                    });
                    if (!copy || copy.status !== 'pending')
                        continue;
                    try {
                        await this.copyOne(copy, copy.sourceArticle.source, copy.targetSite);
                    }
                    catch (error) {
                        await this.prisma.articleCopy.update({ where: { id }, data: { status: 'failed', error: message(error).slice(0, 1000) } });
                        this.logger.warn(`Copie de « ${copy.sourceArticle.title} » vers ${copy.targetSite.name} : ${message(error)}`);
                    }
                }
                finally {
                    this.manualRunning.delete(id);
                }
            }
        })().catch((error) => this.logger.error(`Copie manuelle : ${message(error)}`));
    }
    async plan(site, relay) {
        const articles = await this.prisma.article.findMany({
            where: { sourceId: site.id, posts: { some: {} } },
            select: { id: true, externalId: true },
        });
        let planned = 0;
        for (const a of articles) {
            const wordpress = a.externalId.startsWith('wordpress:');
            await this.prisma.articleCopy.upsert({
                where: { sourceArticleId_targetSiteId: { sourceArticleId: a.id, targetSiteId: relay.id } },
                create: {
                    sourceArticleId: a.id,
                    targetSiteId: relay.id,
                    status: wordpress ? 'pending' : 'skipped',
                    error: wordpress ? null : 'pas un article WordPress : rien à copier',
                },
                update: {},
            });
            if (wordpress)
                planned += 1;
        }
        return planned;
    }
    start(siteId) {
        if (this.running.has(siteId))
            return;
        this.running.add(siteId);
        void this.process(siteId)
            .catch((error) => this.logger.error(`Relais de ${siteId} : ${message(error)}`))
            .finally(() => this.running.delete(siteId));
    }
    async process(siteId) {
        const site = await this.prisma.contentSource.findUniqueOrThrow({ where: { id: siteId } });
        if (!site.pausedAt || !site.relayId)
            return;
        const relay = await this.prisma.contentSource.findUniqueOrThrow({ where: { id: site.relayId } });
        for (;;) {
            const copy = await this.prisma.articleCopy.findFirst({
                where: { status: 'pending', targetSiteId: relay.id, sourceArticle: { sourceId: site.id } },
                include: { sourceArticle: { select: { id: true, title: true, externalId: true } } },
                orderBy: { createdAt: 'asc' },
            });
            if (!copy)
                break;
            const still = await this.prisma.contentSource.findUnique({ where: { id: site.id }, select: { pausedAt: true } });
            if (!still?.pausedAt)
                return;
            try {
                await this.copyOne(copy, site, relay);
            }
            catch (error) {
                await this.prisma.articleCopy.update({ where: { id: copy.id }, data: { status: 'failed', error: message(error).slice(0, 1000) } });
                this.logger.warn(`Copie de « ${copy.sourceArticle.title} » vers ${relay.name} : ${message(error)}`);
            }
        }
        const failed = await this.prisma.articleCopy.count({
            where: { status: 'failed', targetSiteId: relay.id, sourceArticle: { sourceId: site.id } },
        });
        if (failed) {
            await this.prisma.contentSource.update({
                where: { id: site.id },
                data: { redirectError: `${failed} copie(s) en erreur : redirection pas encore posée (« Réessayer », ou « Rediriger maintenant »)` },
            });
            return;
        }
        await this.redirectTo(site, relay).catch(() => undefined);
    }
    async copyOne(copy, site, relay) {
        const wpId = copy.sourceArticle.externalId.slice('wordpress:'.length);
        const exported = await this.call(site, 'GET', `/export/${encodeURIComponent(wpId)}`);
        const image = exported.imageUrl && this.writer ? await this.writer.loadImage(exported.imageUrl).catch(() => null) : null;
        const deposit = await this.call(relay, 'POST', '/articles', {
            title: exported.title,
            slug: exported.slug,
            excerpt: exported.excerpt ?? '',
            contentHtml: exported.contentHtml,
            image,
            keepExisting: true,
            copyRef: copy.id,
        });
        if (!deposit.postId || !deposit.permalink)
            throw new common_1.BadGatewayException('Réponse du relais incomplète');
        await this.prisma.articleCopy.update({
            where: { id: copy.id },
            data: { slug: exported.slug, wpPostId: String(deposit.postId), permalink: deposit.permalink },
        });
        if (!this.writer)
            throw new common_1.BadGatewayException('Relecture WordPress indisponible');
        const pulled = await this.writer.fetchArticle({
            siteUrl: relay.originUrl,
            siteName: relay.name,
            apiKey: relay.depositKey,
            postId: String(deposit.postId),
        });
        await this.wordpress.publish({ ...pulled, copyRef: copy.id });
        const done = await this.prisma.articleCopy.findUnique({ where: { id: copy.id }, select: { status: true } });
        if (done?.status !== 'done') {
            throw new common_1.BadGatewayException('Article créé sur le relais, mais pas encore rattaché : réessayer');
        }
    }
    async redirectTo(site, relay) {
        try {
            await this.setRedirect(site, relay.originUrl);
            await this.prisma.$transaction([
                this.prisma.contentSource.update({ where: { id: site.id }, data: { redirectSince: new Date(), redirectError: null } }),
                this.prisma.activityLog.create({
                    data: {
                        eventType: 'SITE_REDIRECTED',
                        message: `↪ ${site.name} redirige ses visiteurs vers ${relay.name} (même chemin, 302)`,
                        metadata: { siteId: site.id, relayId: relay.id },
                    },
                }),
            ]);
        }
        catch (error) {
            await this.prisma.contentSource.update({
                where: { id: site.id },
                data: { redirectError: `Redirection non posée : ${message(error)}` },
            });
            throw error;
        }
    }
    setRedirect(site, target) {
        return this.call(site, 'POST', '/redirect', { target });
    }
    async pluginStatus(site) {
        try {
            return await this.call(site, 'GET', '/status');
        }
        catch (error) {
            throw new common_1.BadRequestException(`Le plugin de ${site.name} ne répond pas : ${message(error)}`);
        }
    }
    async call(site, method, path, body) {
        const key = site.depositKey || this.config.get('WORDPRESS_API_KEY') || '';
        const url = `${site.originUrl}/wp-json/dfb/v1${path}`;
        let response;
        try {
            response = await fetch(url, {
                method,
                signal: AbortSignal.timeout(TIMEOUT_MS),
                headers: { accept: 'application/json', 'x-api-key': key, ...(body !== undefined ? { 'content-type': 'application/json' } : {}) },
                ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
            });
        }
        catch {
            throw new common_1.BadGatewayException(`${site.name} injoignable (${url})`);
        }
        const text = await response.text();
        if (response.status === 404 && /rest_no_route/.test(text)) {
            throw new common_1.BadGatewayException(`le plugin de ${site.name} est trop ancien : installez la ${exports.RELAY_PLUGIN_VERSION}`);
        }
        if (!response.ok) {
            throw new common_1.BadGatewayException(`${site.name} a répondu HTTP ${response.status} : ${text.slice(0, 200)}`);
        }
        try {
            return JSON.parse(text);
        }
        catch {
            throw new common_1.BadGatewayException(`${site.name} n’a pas répondu en JSON`);
        }
    }
    async manageable(id, acting) {
        const site = await this.prisma.contentSource.findFirst({
            where: { id, ...(0, scope_1.siteManageWhere)((0, scope_1.scopeOf)(acting)) },
            select: { id: true, name: true, originUrl: true, depositKey: true, status: true, pausedAt: true, relayId: true },
        });
        if (!site)
            throw new common_1.NotFoundException('Site introuvable');
        return site;
    }
    async usable(id, acting) {
        const site = await this.prisma.contentSource.findFirst({
            where: { id, ...(0, scope_1.siteWhere)((0, scope_1.scopeOf)(acting)) },
            select: { id: true, name: true, originUrl: true, depositKey: true, status: true, pausedAt: true, relayId: true },
        });
        if (!site)
            throw new common_1.NotFoundException('Site introuvable');
        return site;
    }
    async pausedWithRelay(id, acting) {
        const site = await this.manageable(id, acting);
        if (!site.pausedAt || !site.relayId)
            throw new common_1.ConflictException(`${site.name} n’est pas en pause avec un relais`);
        return site;
    }
};
exports.SiteRelayService = SiteRelayService;
exports.SiteRelayService = SiteRelayService = SiteRelayService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(3, (0, common_1.Optional)()),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        config_1.ConfigService,
        wordpress_service_1.WordpressService,
        wordpress_writer_service_1.WordpressWriterService])
], SiteRelayService);
const by = (acting) => acting?.username ?? 'clé globale';
const message = (error) => (error instanceof Error ? error.message : String(error));
//# sourceMappingURL=site-relay.service.js.map