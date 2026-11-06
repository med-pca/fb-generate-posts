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
exports.AnalyticsService = void 0;
const common_1 = require("@nestjs/common");
const client_1 = require("@prisma/client");
const prisma_service_1 = require("../prisma/prisma.service");
const scope_1 = require("../auth/scope");
const insights_service_1 = require("../insights/insights.service");
const window_1 = require("../runners/window");
const DAY = 86_400_000;
const MAX_ROWS = 200_000;
let AnalyticsService = class AnalyticsService {
    prisma;
    constructor(prisma) {
        this.prisma = prisma;
    }
    async report(f, acting) {
        const tz = await this.timezone(f.tz);
        const range = this.range(f, tz);
        const where = await this.where(f, acting);
        const span = range.to.getTime() - range.from.getTime();
        const [published, failed, previous] = await Promise.all([
            this.published(where, range.from, range.to),
            this.failed(where, range.from, range.to),
            this.prisma.publicationJobItem.count({ where: this.publishedWhere(where, new Date(range.from.getTime() - span), range.from) }),
        ]);
        const names = await this.names(published, failed);
        const bucket = span <= 2 * DAY ? 'hour' : 'day';
        const slots = new Map();
        const slotOf = (d) => (bucket === 'hour' ? Math.floor(d.getTime() / 3_600_000) * 3_600_000 : (0, insights_service_1.startOfLocalDay)(d, tz).getTime());
        for (let t = slotOf(range.from); t < range.to.getTime(); t = bucket === 'hour' ? t + 3_600_000 : (0, insights_service_1.startOfLocalDay)(new Date(t + DAY + 12 * 3_600_000), tz).getTime()) {
            slots.set(t, { at: t, published: 0, failed: 0 });
        }
        for (const p of published) {
            const s = slots.get(slotOf(p.at));
            if (s)
                s.published += 1;
        }
        for (const x of failed) {
            const s = slots.get(slotOf(x.at));
            if (s)
                s.failed += 1;
        }
        const hours = Array.from({ length: 24 }, () => 0);
        for (const p of published)
            hours[Math.floor((0, window_1.localClock)(p.at, tz).minutes / 60)] += 1;
        const rank = (key, label, withFailures = false) => {
            const map = new Map();
            for (const p of published) {
                const k = p[key];
                if (!k)
                    continue;
                const e = map.get(k) ?? { published: 0, failed: 0 };
                e.published += 1;
                map.set(k, e);
            }
            if (withFailures) {
                for (const x of failed) {
                    const k = x[key];
                    if (!k)
                        continue;
                    const e = map.get(k) ?? { published: 0, failed: 0 };
                    e.failed += 1;
                    map.set(k, e);
                }
            }
            return [...map]
                .map(([id, e]) => ({ id, name: label.get(id) ?? '—', ...e, failureRate: e.published + e.failed ? Math.round((e.failed / (e.published + e.failed)) * 100) : 0 }))
                .sort((a, b) => b.published - a.published || b.failed - a.failed)
                .slice(0, 100);
        };
        const reasons = new Map();
        for (const x of failed) {
            const r = (x.error || 'sans motif').replace(/\s+/g, ' ').replace(/https?:\/\/\S+/g, '…').slice(0, 90);
            reasons.set(r, (reasons.get(r) ?? 0) + 1);
        }
        const days = Math.max(1, span / DAY);
        const total = published.length + failed.length;
        return {
            range: { from: range.from, to: range.to, timezone: tz, bucket },
            kpis: {
                published: published.length,
                failed: failed.length,
                failureRate: total ? Math.round((failed.length / total) * 1000) / 10 : 0,
                perDay: Math.round((published.length / days) * 10) / 10,
                articles: new Set(published.map((p) => p.articleId).filter(Boolean)).size,
                groups: new Set(published.map((p) => p.groupId)).size,
                profiles: new Set(published.map((p) => p.profileId)).size,
                linked: published.filter((p) => p.linked).length,
                verified: published.filter((p) => p.verified).length,
                previous,
                delta: previous ? Math.round(((published.length - previous) / previous) * 1000) / 10 : null,
            },
            series: [...slots.values()],
            hours,
            bySite: rank('siteId', names.sites),
            byArticle: rank('articleId', names.articles),
            byProfile: rank('profileId', names.profiles, true),
            byGroup: rank('groupId', names.groups, true),
            failureReasons: [...reasons].map(([reason, count]) => ({ reason, count })).sort((a, b) => b.count - a.count).slice(0, 15),
        };
    }
    async csv(f, acting) {
        const tz = await this.timezone(f.tz);
        const range = this.range(f, tz);
        const where = await this.where(f, acting);
        const rows = await this.prisma.publicationJobItem.findMany({
            where: this.publishedWhere(where, range.from, range.to),
            orderBy: { publishedAt: 'asc' },
            take: MAX_ROWS,
            select: {
                publishedAt: true,
                externalPostUrl: true,
                linkUpdatedAt: true,
                job: { select: { profile: { select: { name: true } } } },
                postTarget: { select: { verifyStatus: true, group: { select: { name: true, category: { select: { name: true } } } } } },
                post: { select: { title: true, article: { select: { title: true, articleUrl: true, source: { select: { name: true } } } } } },
            },
        });
        const cell = (v) => {
            const s = String(v ?? '');
            return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
        };
        const when = (d) => d ? new Intl.DateTimeFormat('fr-FR', { timeZone: tz, dateStyle: 'short', timeStyle: 'short' }).format(d) : '';
        const head = ['Date', 'Site', 'Article', 'Adresse article', 'Groupe', 'Catégorie', 'Profil', 'Publication Facebook', 'Lien posé', 'Vérifié'];
        const lines = rows.map((r) => [
            when(r.publishedAt),
            r.post.article?.source.name ?? '',
            r.post.article?.title ?? r.post.title,
            r.post.article?.articleUrl ?? '',
            r.postTarget.group.name,
            r.postTarget.group.category?.name ?? '',
            r.job.profile.name,
            r.externalPostUrl ?? '',
            r.linkUpdatedAt ? 'oui' : 'non',
            r.postTarget.verifyStatus === 'OK' ? 'oui' : '',
        ].map(cell).join(';'));
        return `﻿${[head.join(';'), ...lines].join('\n')}\n`;
    }
    async timezone(tz) {
        if (tz) {
            try {
                new Intl.DateTimeFormat('fr-FR', { timeZone: tz });
                return tz;
            }
            catch {
                throw new common_1.BadRequestException(`Fuseau inconnu : ${tz}`);
            }
        }
        const s = await this.prisma.automationSetting.findUnique({ where: { id: 'global' }, select: { objectiveTimezone: true } }).catch(() => null);
        return s?.objectiveTimezone || 'Europe/Paris';
    }
    range(f, tz) {
        const now = new Date();
        const local = (v, end) => {
            if (/^\d{4}-\d{2}-\d{2}$/.test(v)) {
                const noon = new Date(`${v}T12:00:00Z`);
                const start = (0, insights_service_1.startOfLocalDay)(noon, tz);
                return end ? (0, insights_service_1.startOfLocalDay)(new Date(start.getTime() + DAY + 12 * 3_600_000), tz) : start;
            }
            const d = new Date(v);
            if (Number.isNaN(d.getTime()))
                throw new common_1.BadRequestException(`Date illisible : ${v}`);
            return d;
        };
        const to = f.to ? local(f.to, true) : now;
        const from = f.from ? local(f.from, false) : (0, insights_service_1.startOfLocalDay)(new Date(now.getTime() - 6 * DAY), tz);
        if (from >= to)
            throw new common_1.BadRequestException('La date de début doit précéder la date de fin');
        if (to.getTime() - from.getTime() > 400 * DAY)
            throw new common_1.BadRequestException('Période trop longue (400 jours au plus)');
        return { from, to };
    }
    async where(f, acting) {
        const and = [{ job: (0, scope_1.jobWhere)((0, scope_1.scopeOf)(acting)) }];
        if (f.profileId)
            and.push({ job: { profileId: f.profileId } });
        if (f.groupId)
            and.push({ postTarget: { groupId: f.groupId } });
        if (f.categoryId)
            and.push({ postTarget: { group: { categoryId: f.categoryId === 'none' ? null : f.categoryId } } });
        if (f.siteId)
            and.push({ post: { article: { sourceId: f.siteId } } });
        if (f.articleId)
            and.push({ post: { articleId: f.articleId } });
        if (f.campaignId) {
            const c = await this.prisma.campaign.findFirst({
                where: { id: f.campaignId, ...(0, scope_1.ownedWhere)((0, scope_1.scopeOf)(acting)) },
                select: { id: true },
            });
            if (!c)
                throw new common_1.NotFoundException('Campagne introuvable');
            and.push({ campaignId: c.id });
        }
        return and;
    }
    publishedWhere(where, from, to) {
        return { AND: [...where, { status: client_1.TargetStatus.PUBLISHED, publishedAt: { gte: from, lt: to }, postTarget: { approvalPendingSince: null } }] };
    }
    async published(where, from, to) {
        const rows = await this.prisma.publicationJobItem.findMany({
            where: this.publishedWhere(where, from, to),
            take: MAX_ROWS,
            select: {
                publishedAt: true,
                linkUpdatedAt: true,
                job: { select: { profileId: true } },
                postTarget: { select: { groupId: true, verifyStatus: true } },
                post: { select: { articleId: true, article: { select: { sourceId: true } } } },
            },
        });
        return rows.map((r) => ({
            at: r.publishedAt,
            profileId: r.job.profileId,
            groupId: r.postTarget.groupId,
            articleId: r.post.articleId,
            siteId: r.post.article?.sourceId ?? null,
            linked: Boolean(r.linkUpdatedAt),
            verified: r.postTarget.verifyStatus === 'OK',
        }));
    }
    async failed(where, from, to) {
        const rows = await this.prisma.publicationJobItem.findMany({
            where: { AND: [...where, { status: client_1.TargetStatus.FAILED, updatedAt: { gte: from, lt: to } }] },
            take: MAX_ROWS,
            select: { updatedAt: true, error: true, job: { select: { profileId: true } }, postTarget: { select: { groupId: true } }, post: { select: { articleId: true, article: { select: { sourceId: true } } } } },
        });
        return rows.map((r) => ({
            at: r.updatedAt,
            error: r.error,
            profileId: r.job.profileId,
            groupId: r.postTarget.groupId,
            articleId: r.post.articleId,
            siteId: r.post.article?.sourceId ?? null,
        }));
    }
    async names(...lists) {
        const all = lists.flat();
        const ids = (k) => [...new Set(all.map((x) => x[k]).filter((v) => Boolean(v)))];
        const [profiles, groups, articles, sites] = await Promise.all([
            this.prisma.profile.findMany({ where: { id: { in: ids('profileId') } }, select: { id: true, name: true } }),
            this.prisma.group.findMany({ where: { id: { in: ids('groupId') } }, select: { id: true, name: true } }),
            this.prisma.article.findMany({ where: { id: { in: ids('articleId') } }, select: { id: true, title: true } }),
            this.prisma.contentSource.findMany({ where: { id: { in: ids('siteId') } }, select: { id: true, name: true } }),
        ]);
        return {
            profiles: new Map(profiles.map((x) => [x.id, x.name])),
            groups: new Map(groups.map((x) => [x.id, x.name])),
            articles: new Map(articles.map((x) => [x.id, x.title])),
            sites: new Map(sites.map((x) => [x.id, x.name])),
        };
    }
};
exports.AnalyticsService = AnalyticsService;
exports.AnalyticsService = AnalyticsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], AnalyticsService);
//# sourceMappingURL=analytics.service.js.map