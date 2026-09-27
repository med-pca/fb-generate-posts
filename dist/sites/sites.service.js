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
const common_1 = require("@nestjs/common");
const client_1 = require("@prisma/client");
const prisma_service_1 = require("../prisma/prisma.service");
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
        articles: site._count?.articles ?? 0,
        createdAt: site.createdAt,
    };
}
let SitesService = class SitesService {
    prisma;
    constructor(prisma) {
        this.prisma = prisma;
    }
    async findAll(acting) {
        const sites = await this.prisma.contentSource.findMany({
            where: (0, scope_1.siteWhere)((0, scope_1.scopeOf)(acting)),
            include: {
                _count: { select: { articles: true } },
                owner: { select: { username: true } },
            },
            orderBy: [{ status: 'asc' }, { name: 'asc' }],
        });
        return sites.map(publicSite);
    }
    async targets(acting) {
        const sites = await this.prisma.contentSource.findMany({
            where: { status: client_1.RecordStatus.ACTIVE, ...(0, scope_1.siteWhere)((0, scope_1.scopeOf)(acting)) },
            select: { id: true, name: true, originUrl: true },
            orderBy: { name: 'asc' },
        });
        return {
            sites: sites.map(({ id, name, originUrl }) => ({
                id,
                name,
                siteUrl: originUrl,
            })),
        };
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
                depositKey: dto.depositKey?.trim() || null,
                ownerId: owner?.id ?? null,
                status: dto.status ?? client_1.RecordStatus.ACTIVE,
            },
            include: {
                _count: { select: { articles: true } },
                owner: { select: { username: true } },
            },
        });
        return publicSite(site);
    }
    async update(id, dto, acting) {
        await this.owned(id, acting);
        const site = await this.prisma.contentSource.update({
            where: { id },
            data: {
                ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
                ...(dto.originUrl !== undefined
                    ? { originUrl: normalizeSiteUrl(dto.originUrl) }
                    : {}),
                ...(dto.depositKey ? { depositKey: dto.depositKey.trim() } : {}),
                ...(dto.status !== undefined ? { status: dto.status } : {}),
                ...(dto.ownerId !== undefined && (0, scope_1.seesEverything)((0, scope_1.scopeOf)(acting))
                    ? { ownerId: dto.ownerId || null }
                    : {}),
            },
            include: {
                _count: { select: { articles: true } },
                owner: { select: { username: true } },
            },
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
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], SitesService);
//# sourceMappingURL=sites.service.js.map