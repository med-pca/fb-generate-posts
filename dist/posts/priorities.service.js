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
exports.PrioritiesService = void 0;
exports.nextPriority = nextPriority;
const common_1 = require("@nestjs/common");
const client_1 = require("@prisma/client");
const prisma_service_1 = require("../prisma/prisma.service");
const scope_1 = require("../auth/scope");
const insights_service_1 = require("../insights/insights.service");
function nextPriority(current, top, move, value) {
    if (value !== undefined)
        return value;
    if (move === 'top')
        return Math.max(top + 1, current + 1);
    if (move === 'up')
        return current + 1;
    if (move === 'down')
        return current - 1;
    return 0;
}
let PrioritiesService = class PrioritiesService {
    prisma;
    constructor(prisma) {
        this.prisma = prisma;
    }
    async overview(acting) {
        const scope = (0, scope_1.scopeOf)(acting);
        const settingsTz = await this.prisma.automationSetting.findUnique({ where: { id: 'global' }, select: { objectiveTimezone: true } });
        const dayStart = (0, insights_service_1.startOfLocalDay)(new Date(), settingsTz?.objectiveTimezone || 'Europe/Paris');
        const today = await this.prisma.postTarget.groupBy({
            by: ['groupId'],
            where: { status: client_1.TargetStatus.PUBLISHED, publishedAt: { gte: dayStart } },
            _count: { _all: true },
        });
        const publishedToday = new Map(today.map((r) => [r.groupId, r._count._all]));
        const [groups, waiting, settings] = await Promise.all([
            this.prisma.group.findMany({
                where: { status: 'ACTIVE', ...(0, scope_1.groupWhere)(scope) },
                select: { id: true, name: true, url: true, priority: true, dailyCap: true, hoursStart: true, hoursEnd: true, language: true, category: { select: { id: true, name: true } } },
                orderBy: [{ priority: 'desc' }, { name: 'asc' }],
            }),
            this.prisma.postTarget.findMany({
                where: { status: client_1.TargetStatus.AVAILABLE, post: { status: 'AVAILABLE', ...(0, scope_1.postWhere)(scope) } },
                select: { groupId: true, post: { select: { articleId: true } } },
                take: 50_000,
            }),
            this.prisma.automationSetting.findUnique({ where: { id: 'global' }, select: { rateLimitPauseDays: true, imageProvider: true } }),
        ]);
        const byGroup = new Map();
        const byArticle = new Map();
        for (const t of waiting) {
            byGroup.set(t.groupId, (byGroup.get(t.groupId) ?? 0) + 1);
            if (t.post.articleId)
                byArticle.set(t.post.articleId, (byArticle.get(t.post.articleId) ?? 0) + 1);
        }
        const articles = await this.prisma.article.findMany({
            where: { ...(0, scope_1.articleWhere)(scope), OR: [{ id: { in: [...byArticle.keys()] } }, { priority: { not: 0 } }] },
            select: { id: true, title: true, articleUrl: true, coverImageUrl: true, priority: true, publishedAt: true, source: { select: { name: true } } },
            orderBy: [{ priority: 'desc' }, { publishedAt: 'desc' }],
            take: 300,
        });
        return {
            settings: { rateLimitPauseDays: settings?.rateLimitPauseDays ?? 5, imageProvider: settings?.imageProvider ?? 'auto' },
            groups: groups.map((g) => ({ ...g, waiting: byGroup.get(g.id) ?? 0, publishedToday: publishedToday.get(g.id) ?? 0 })),
            articles: articles.map((a) => ({ ...a, site: a.source.name, source: undefined, waiting: byArticle.get(a.id) ?? 0 })),
        };
    }
    async setGroup(id, dto, acting) {
        const scope = (0, scope_1.scopeOf)(acting);
        const group = await this.prisma.group.findFirst({ where: { id, ...(0, scope_1.groupWhere)(scope) }, select: { id: true, name: true, priority: true } });
        if (!group)
            throw new common_1.NotFoundException('Groupe introuvable');
        const top = await this.prisma.group.aggregate({ where: (0, scope_1.groupWhere)(scope), _max: { priority: true } });
        const priority = nextPriority(group.priority, top._max.priority ?? 0, dto.move, dto.priority);
        await this.prisma.group.update({ where: { id }, data: { priority } });
        await this.log('GROUP_PRIORITY', `Priorité du groupe « ${group.name} » : ${priority}`, acting, { groupId: id, priority });
        return { id, priority };
    }
    async setGroupLimits(id, dto, acting) {
        const group = await this.prisma.group.findFirst({ where: { id, ...(0, scope_1.groupWhere)((0, scope_1.scopeOf)(acting)) }, select: { id: true, name: true } });
        if (!group)
            throw new common_1.NotFoundException('Groupe introuvable');
        const hours = dto.hoursStart != null && dto.hoursEnd != null ? { hoursStart: dto.hoursStart, hoursEnd: dto.hoursEnd } : { hoursStart: null, hoursEnd: null };
        const data = { dailyCap: dto.dailyCap ?? null, ...hours };
        await this.prisma.group.update({ where: { id }, data });
        const hhmm = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
        await this.log('GROUP_LIMITS', `Règles du groupe « ${group.name} » : ${data.dailyCap === null ? 'sans plafond' : `${data.dailyCap} post(s)/jour`}, ${data.hoursStart === null ? 'à toute heure' : `de ${hhmm(data.hoursStart)} à ${hhmm(data.hoursEnd)}`}`, acting, { groupId: id, ...data });
        return { id, ...data };
    }
    async setArticle(id, dto, acting) {
        const scope = (0, scope_1.scopeOf)(acting);
        const article = await this.prisma.article.findFirst({ where: { id, ...(0, scope_1.articleManageWhere)(scope) }, select: { id: true, title: true, priority: true } });
        if (!article)
            throw new common_1.NotFoundException('Article introuvable');
        const top = await this.prisma.article.aggregate({ where: (0, scope_1.articleWhere)(scope), _max: { priority: true } });
        const priority = nextPriority(article.priority, top._max.priority ?? 0, dto.move, dto.priority);
        const [, posts] = await this.prisma.$transaction([
            this.prisma.article.update({ where: { id }, data: { priority } }),
            this.prisma.post.updateMany({ where: { articleId: id, status: 'AVAILABLE', ...(0, scope_1.postWhere)(scope) }, data: { priority } }),
        ]);
        await this.log('ARTICLE_PRIORITY', `Priorité de l’article « ${article.title} » : ${priority} (${posts.count} post(s))`, acting, { articleId: id, priority, posts: posts.count });
        return { id, priority, posts: posts.count };
    }
    log(eventType, message, acting, metadata) {
        return this.prisma.activityLog.create({
            data: { eventType, message, metadata: { ...metadata, by: acting?.username ?? 'clé globale' } },
        });
    }
};
exports.PrioritiesService = PrioritiesService;
exports.PrioritiesService = PrioritiesService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], PrioritiesService);
//# sourceMappingURL=priorities.service.js.map