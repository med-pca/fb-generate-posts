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
exports.TopArticlesService = exports.MAX_PER_USER = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const client_1 = require("@prisma/client");
const prisma_service_1 = require("../prisma/prisma.service");
const distribute_1 = require("./distribute");
const TIMEZONE = 'Europe/Paris';
const POOL_SIZE = 500;
exports.MAX_PER_USER = 50;
let TopArticlesService = class TopArticlesService {
    prisma;
    config;
    constructor(prisma, config) {
        this.prisma = prisma;
        this.config = config;
    }
    today(now = new Date()) {
        return new Intl.DateTimeFormat('en-CA', { timeZone: TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
    }
    async list(acting, day = this.today()) {
        const admin = !acting || acting.role === client_1.Role.ADMIN;
        if (!admin) {
            const me = await this.prisma.user.findUnique({ where: { id: acting.id }, select: { topArticles: true } });
            if (!me?.topArticles)
                throw new common_1.ForbiddenException('« Top 10 articles » n’est pas activé pour votre compte');
        }
        const error = await this.ensure(day).then(() => null, (e) => (e instanceof Error ? e.message : String(e)));
        const perUser = await this.perUser();
        const picks = await this.prisma.topArticlePick.findMany({
            where: { day, rank: { lte: perUser }, user: { topArticles: true, role: client_1.Role.MANAGER }, ...(admin ? {} : { userId: acting.id }) },
            orderBy: [{ userId: 'asc' }, { rank: 'asc' }],
            include: { user: { select: { id: true, username: true } } },
        });
        const byUser = new Map();
        for (const p of picks) {
            if (!byUser.has(p.userId))
                byUser.set(p.userId, { user: p.user, items: [] });
            byUser.get(p.userId).items.push(p);
        }
        return {
            day,
            admin,
            perUser,
            error,
            lists: [...byUser.values()].map(({ user, items }) => ({
                user,
                items: items.map((p) => ({ rank: p.rank, url: p.url, title: p.title, image: p.image, domain: p.domain, views: p.views, viral: p.viral })),
            })),
        };
    }
    async regenerate(day = this.today()) {
        await this.prisma.topArticlePick.deleteMany({ where: { day } });
        await this.ensure(day);
        return this.list(null, day);
    }
    async settings() {
        const [perUser, managers] = await Promise.all([
            this.perUser(),
            this.prisma.user.findMany({
                where: { role: client_1.Role.MANAGER },
                orderBy: { username: 'asc' },
                select: { id: true, username: true, status: true, topArticles: true },
            }),
        ]);
        return { perUser, max: exports.MAX_PER_USER, managers: managers.map((m) => ({ id: m.id, username: m.username, active: m.status === 'ACTIVE', enabled: m.topArticles })) };
    }
    async updateSettings(dto) {
        if (dto.perUser !== undefined) {
            const n = Number(dto.perUser);
            if (!Number.isInteger(n) || n < 1 || n > exports.MAX_PER_USER)
                throw new common_1.BadRequestException(`Le nombre d’articles va de 1 à ${exports.MAX_PER_USER}`);
            await this.prisma.automationSetting.upsert({ where: { id: 'global' }, create: { id: 'global', topArticlesPerUser: n }, update: { topArticlesPerUser: n } });
        }
        if (dto.enabledUserIds) {
            const ids = [...new Set(dto.enabledUserIds.filter((x) => typeof x === 'string'))];
            await this.prisma.$transaction([
                this.prisma.user.updateMany({ where: { role: client_1.Role.MANAGER, id: { in: ids } }, data: { topArticles: true } }),
                this.prisma.user.updateMany({ where: { role: client_1.Role.MANAGER, id: { notIn: ids } }, data: { topArticles: false } }),
            ]);
        }
        return this.settings();
    }
    async perUser() {
        const s = await this.prisma.automationSetting.findUnique({ where: { id: 'global' }, select: { topArticlesPerUser: true } }).catch(() => null);
        return Math.min(exports.MAX_PER_USER, Math.max(1, s?.topArticlesPerUser ?? 10));
    }
    async ensure(day) {
        const perUser = await this.perUser();
        const managers = await this.prisma.user.findMany({
            where: { role: client_1.Role.MANAGER, status: 'ACTIVE', topArticles: true },
            orderBy: { createdAt: 'asc' },
            select: { id: true },
        });
        const count = async (db) => new Map((await db.topArticlePick.groupBy({ by: ['userId'], where: { day }, _count: { _all: true } })).map((g) => [g.userId, g._count._all]));
        const served = await count(this.prisma);
        if (managers.every((m) => (served.get(m.id) ?? 0) >= perUser))
            return;
        const pool = await this.fetchTop();
        await this.prisma.$transaction(async (tx) => {
            await tx.$executeRaw `SELECT pg_advisory_xact_lock(hashtext('top_article_picks'))`;
            const today = await tx.topArticlePick.findMany({ where: { day }, select: { userId: true, url: true } });
            const have = new Map();
            for (const p of today)
                have.set(p.userId, (have.get(p.userId) ?? 0) + 1);
            const need = new Map(managers.map((m) => [m.id, Math.max(0, perUser - (have.get(m.id) ?? 0))]));
            const missing = managers.map((m) => m.id).filter((id) => (need.get(id) ?? 0) > 0);
            if (!missing.length)
                return;
            const since = new Date(`${day}T00:00:00Z`);
            since.setUTCDate(since.getUTCDate() - distribute_1.OTHERS_COOLDOWN_DAYS - 1);
            const past = await tx.topArticlePick.findMany({
                where: { day: { lt: day }, OR: [{ userId: { in: missing } }, { createdAt: { gte: since } }] },
                select: { userId: true, url: true, day: true },
            });
            const out = (0, distribute_1.distribute)(pool, missing, past, day, new Set(today.map((p) => p.url)), need);
            await tx.topArticlePick.createMany({
                data: [...out].flatMap(([userId, items]) => items.map((a, i) => ({ day, userId, rank: (have.get(userId) ?? 0) + i + 1, url: a.url, title: a.title, image: a.image, domain: a.domain, views: a.views, viral: a.viral }))),
                skipDuplicates: true,
            });
        });
    }
    async fetchTop() {
        const base = (this.config.get('RADAR_API_URL') || 'https://radar.pulserecipe.com').replace(/\/+$/, '');
        const key = this.config.get('RADAR_API_KEY');
        if (!key)
            throw new common_1.ServiceUnavailableException('Radar non relié : RADAR_API_KEY manquante dans la configuration du serveur');
        const res = await fetch(`${base}/api/feed/top?days=7&limit=${POOL_SIZE}`, {
            headers: { 'x-api-key': key },
            signal: AbortSignal.timeout(60_000),
        }).catch((e) => {
            throw new common_1.ServiceUnavailableException(`Radar injoignable (${base}) : ${e instanceof Error ? e.message : e}`);
        });
        if (!res.ok)
            throw new common_1.ServiceUnavailableException(`Radar a répondu ${res.status}${res.status === 401 ? ' : clé RADAR_API_KEY refusée' : ''}`);
        const body = (await res.json());
        return (body.items ?? [])
            .filter((a) => typeof a.url === 'string' && Boolean(a.url))
            .map((a) => ({ url: a.url, title: a.title || a.url, image: a.image ?? null, domain: a.domain || new URL(a.url).host, views: Number(a.views) || 0, viral: Boolean(a.viral) }));
    }
};
exports.TopArticlesService = TopArticlesService;
exports.TopArticlesService = TopArticlesService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        config_1.ConfigService])
], TopArticlesService);
//# sourceMappingURL=top-articles.service.js.map