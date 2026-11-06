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
exports.SitesService = void 0;
exports.normalizeSiteUrl = normalizeSiteUrl;
exports.publicSite = publicSite;
exports.pluginBlocker = pluginBlocker;
exports.siteBlocker = siteBlocker;
const languages_registry_1 = require("../languages/languages.registry");
const common_1 = require("@nestjs/common");
const client_1 = require("@prisma/client");
const prisma_service_1 = require("../prisma/prisma.service");
const categories_service_1 = require("../categories/categories.service");
const site_key_1 = require("./site-key");
const scope_1 = require("../auth/scope");
function normalizeSiteUrl(value) {
    const url = new URL(value);
    if (url.protocol !== 'https:') {
        throw new common_1.BadRequestException('Un site doit être en HTTPS');
    }
    if (url.username || url.password || url.search || url.hash) {
        throw new common_1.BadRequestException('L’adresse du site ne doit porter ni identifiants, ni paramètres');
    }
    return url.origin + url.pathname.replace(/\/+$/, '');
}
function publicSite(site) {
    return {
        id: site.id,
        name: site.name,
        originUrl: site.originUrl,
        status: site.status,
        ownerId: site.ownerId,
        owner: site.owner?.username ?? null,
        hasOwnKey: Boolean(site.depositKey),
        categoryId: site.categoryId,
        category: site.category?.name ?? null,
        plugin: {
            state: site.pluginState,
            version: site.pluginVersion,
            message: site.pluginMessage,
            checkedAt: site.pluginCheckedAt,
            lastDeliveryAt: site.lastDeliveryAt,
        },
        articles: site._count?.articles ?? 0,
        pause: site.pausedAt
            ? {
                since: site.pausedAt,
                reason: site.pauseReason,
                relay: site.relay ?? null,
                redirectSince: site.redirectSince,
                redirectError: site.redirectError,
            }
            : null,
        createdAt: site.createdAt,
    };
}
function pluginBlocker(state) {
    switch (state) {
        case client_1.PluginState.MISSING:
            return 'extension WordPress absente';
        case client_1.PluginState.OUTDATED:
            return 'extension WordPress à mettre à jour (1.3.0)';
        case client_1.PluginState.BAD_KEY:
            return 'l’extension WordPress refuse la clé';
        default:
            return null;
    }
}
function siteBlocker(site) {
    if (site.pluginState !== client_1.PluginState.CONNECTED) {
        return pluginBlocker(site.pluginState) ?? 'extension WordPress non vérifiée';
    }
    if (!site.categoryId)
        return 'sans catégorie : aucun post';
    return null;
}
const SITE_INCLUDE = {
    _count: { select: { articles: true } },
    owner: { select: { username: true } },
    category: { select: { id: true, name: true } },
    relay: { select: { id: true, name: true } },
};
let SitesService = class SitesService {
    prisma;
    categories;
    constructor(prisma, categories) {
        this.prisma = prisma;
        this.categories = categories;
    }
    async findAll(acting) {
        const sites = await this.prisma.contentSource.findMany({
            where: (0, scope_1.siteWhere)((0, scope_1.scopeOf)(acting)),
            include: SITE_INCLUDE,
            orderBy: [{ status: 'asc' }, { name: 'asc' }],
        });
        return sites.map(publicSite);
    }
    async targets(acting) {
        const sites = await this.prisma.contentSource.findMany({
            where: { status: client_1.RecordStatus.ACTIVE, pausedAt: null, ...(0, scope_1.siteWhere)((0, scope_1.scopeOf)(acting)) },
            select: {
                id: true,
                name: true,
                originUrl: true,
                pluginState: true,
                categoryId: true,
                category: { select: { name: true } },
            },
            orderBy: { name: 'asc' },
        });
        const byLanguage = await this.prisma.group.groupBy({
            by: ['categoryId', 'language'],
            where: { status: client_1.RecordStatus.ACTIVE, language: { not: null } },
            _count: { _all: true },
        });
        const engagementRows = await this.prisma.group.groupBy({
            by: ['language', 'categoryId'],
            where: { status: client_1.RecordStatus.ACTIVE, language: { not: null }, profiles: { some: { status: client_1.RecordStatus.ACTIVE } }, ...(0, scope_1.groupWhere)((0, scope_1.scopeOf)(acting)) },
            _count: { _all: true },
        });
        const categoryNames = new Map((await this.prisma.category.findMany({ where: { id: { in: engagementRows.map((r) => r.categoryId).filter((x) => Boolean(x)) } }, select: { id: true, name: true } })).map((c) => [c.id, c.name]));
        const languages = new Map();
        for (const r of engagementRows) {
            const code = r.language;
            const entry = languages.get(code) ?? { code, name: (0, languages_registry_1.languageName)(code), groups: 0, categories: [] };
            entry.groups += r._count._all;
            entry.categories.push({ id: r.categoryId ?? 'none', name: r.categoryId ? categoryNames.get(r.categoryId) ?? '—' : 'Sans catégorie', groups: r._count._all });
            languages.set(code, entry);
        }
        return {
            engagement: { languages: [...languages.values()].sort((a, b) => a.name.localeCompare(b.name)) },
            sites: sites.map((site) => {
                const blocker = siteBlocker(site);
                return {
                    id: site.id,
                    name: site.name,
                    siteUrl: site.originUrl,
                    category: site.category?.name ?? null,
                    plugin: site.pluginState,
                    ready: !blocker,
                    reason: blocker,
                    languages: byLanguage
                        .filter((row) => row.categoryId === site.categoryId && row.language)
                        .map((row) => ({ code: row.language, name: (0, languages_registry_1.languageName)(row.language), groups: row._count._all })),
                };
            }),
        };
    }
    async findOne(id, acting) {
        const site = await this.prisma.contentSource.findFirst({
            where: { id, ...(0, scope_1.siteWhere)((0, scope_1.scopeOf)(acting)) },
            include: SITE_INCLUDE,
        });
        if (!site)
            throw new common_1.NotFoundException('Site introuvable');
        return publicSite(site);
    }
    async create(dto, owner) {
        const originUrl = normalizeSiteUrl(dto.originUrl);
        const existing = await this.prisma.contentSource.findUnique({
            where: { originUrl },
        });
        if (existing) {
            throw new common_1.ConflictException(`Ce site est déjà déclaré : ${existing.name}`);
        }
        const site = await this.prisma.contentSource.create({
            data: {
                name: dto.name.trim(),
                originUrl,
                depositKey: dto.depositKey?.trim() || (0, site_key_1.generateSiteKey)(),
                categoryId: (await this.categories.resolve(dto.categoryId)) ?? null,
                ownerId: owner?.id ?? null,
                status: dto.status ?? client_1.RecordStatus.ACTIVE,
            },
            include: SITE_INCLUDE,
        });
        return publicSite(site);
    }
    async update(id, dto, acting) {
        await this.owned(id, acting);
        const category = await this.categories.resolve(dto.categoryId);
        const site = await this.prisma.contentSource.update({
            where: { id },
            data: {
                ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
                ...(dto.originUrl !== undefined
                    ? { originUrl: normalizeSiteUrl(dto.originUrl) }
                    : {}),
                ...(dto.depositKey ? { depositKey: dto.depositKey.trim() } : {}),
                ...(dto.status !== undefined ? { status: dto.status } : {}),
                ...(category !== undefined ? { categoryId: category } : {}),
                ...(dto.ownerId !== undefined && (0, scope_1.seesEverything)((0, scope_1.scopeOf)(acting))
                    ? { ownerId: dto.ownerId || null }
                    : {}),
            },
            include: SITE_INCLUDE,
        });
        return publicSite(site);
    }
    async remove(id, acting) {
        const site = await this.owned(id, acting);
        const articles = await this.prisma.article.count({
            where: { sourceId: id },
        });
        if (articles) {
            throw new common_1.ConflictException(`${site.name} porte ${articles} article(s) : le désactiver plutôt que le supprimer`);
        }
        await this.prisma.contentSource.delete({ where: { id } });
        return { deleted: true };
    }
    async load(id, acting) {
        const site = await this.prisma.contentSource.findFirst({
            where: { id, ...(0, scope_1.siteWhere)((0, scope_1.scopeOf)(acting)) },
        });
        if (!site)
            throw new common_1.NotFoundException('Site introuvable');
        return site;
    }
    async pluginKey(id, acting) {
        const site = await this.owned(id, acting);
        return { siteId: site.id, originUrl: site.originUrl, key: site.depositKey ?? null, endpoint: this.endpoint() };
    }
    async regeneratePluginKey(id, acting) {
        const site = await this.owned(id, acting);
        const key = (0, site_key_1.generateSiteKey)();
        await this.prisma.$transaction([
            this.prisma.contentSource.update({ where: { id: site.id }, data: { depositKey: key } }),
            this.prisma.activityLog.create({
                data: {
                    eventType: 'SITE_KEY_REGENERATED',
                    message: `Nouvelle clé de plugin pour « ${site.name} » : l’ancienne ne fonctionne plus`,
                    metadata: { siteId: site.id, by: acting?.username ?? 'clé globale', hadOwnKey: Boolean(site.depositKey) },
                },
            }),
        ]);
        return { siteId: site.id, originUrl: site.originUrl, key, endpoint: this.endpoint() };
    }
    endpoint() {
        const base = (process.env.PUBLIC_URL || 'https://post.pulserecipe.com').replace(/\/+$/, '');
        return `${base}/api/wordpress/articles`;
    }
    async owned(id, acting) {
        const site = await this.prisma.contentSource.findFirst({
            where: { id, ...(0, scope_1.siteManageWhere)((0, scope_1.scopeOf)(acting)) },
        });
        if (site)
            return site;
        const shared = await this.prisma.contentSource.findFirst({
            where: { id, ...(0, scope_1.siteWhere)((0, scope_1.scopeOf)(acting)) },
            select: { id: true },
        });
        throw shared
            ? new common_1.ForbiddenException('Ce site vous est partagé pour y déposer : seul son propriétaire le modifie')
            : new common_1.NotFoundException('Site introuvable');
    }
};
exports.SitesService = SitesService;
exports.SitesService = SitesService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        categories_service_1.CategoriesService])
], SitesService);
//# sourceMappingURL=sites.service.js.map