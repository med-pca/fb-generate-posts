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
exports.PublishedService = void 0;
exports.linkState = linkState;
const common_1 = require("@nestjs/common");
const client_1 = require("@prisma/client");
const prisma_service_1 = require("../prisma/prisma.service");
const scope_1 = require("../auth/scope");
const link_why_1 = require("./link-why");
const MAX_AUDITED = 50_000;
function linkState(r) {
    if (r.linkUpdatedAt)
        return 'placed';
    if (!r.post.url)
        return 'none';
    return r.commentedAt ? 'waiting' : 'missing';
}
function dayIn(at, timeZone) {
    try {
        return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(at);
    }
    catch {
        return at.toISOString().slice(0, 10);
    }
}
function hourIn(at, timeZone) {
    try {
        return Number(new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', hour12: false }).format(at)) % 24;
    }
    catch {
        return at.getUTCHours();
    }
}
const OTHER = 'Profil d’un autre compte';
function maskProfile(scope, p) {
    if (!p)
        return null;
    if (scope && p.ownerId !== scope.ownerId)
        return { id: null, name: OTHER };
    return { id: p.id, name: p.name };
}
let PublishedService = class PublishedService {
    prisma;
    constructor(prisma) {
        this.prisma = prisma;
    }
    where(q, acting) {
        const and = [{ status: client_1.TargetStatus.PUBLISHED }, { post: (0, scope_1.postWhere)((0, scope_1.scopeOf)(acting)) }];
        if (q.from || q.to) {
            and.push({ publishedAt: { ...(q.from ? { gte: new Date(q.from) } : {}), ...(q.to ? { lt: new Date(q.to) } : {}) } });
        }
        if (q.groupId)
            and.push({ groupId: q.groupId });
        if (q.categoryId)
            and.push({ group: { categoryId: q.categoryId } });
        if (q.siteId)
            and.push({ post: { article: { sourceId: q.siteId } } });
        if (q.profileId)
            and.push({ jobItems: { some: { status: client_1.TargetStatus.PUBLISHED, job: { profileId: q.profileId } } } });
        if (q.verify === 'ok')
            and.push({ verifyStatus: client_1.VerifyStatus.OK });
        if (q.verify === 'republished')
            and.push({ verifyStatus: client_1.VerifyStatus.REPUBLISHED });
        if (q.verify === 'needs_action')
            and.push({ verifyStatus: client_1.VerifyStatus.NEEDS_ACTION });
        if (q.verify === 'unverified')
            and.push({ verifyStatus: null });
        if (q.link === 'placed')
            and.push({ linkUpdatedAt: { not: null } });
        if (q.link === 'waiting')
            and.push({ linkUpdatedAt: null, commentedAt: { not: null }, post: { url: { not: null } } });
        if (q.link === 'missing') {
            and.push({ linkUpdatedAt: null, commentedAt: null, post: { url: { not: null } } });
            if (q.why)
                and.push((0, link_why_1.missingWhyWhere)(q.why));
        }
        if (q.link === 'none')
            and.push({ linkUpdatedAt: null, post: { url: null } });
        if (q.kind === 'article')
            and.push({ post: { articleId: { not: null } } });
        if (q.kind === 'visual')
            and.push({ post: { visualId: { not: null } } });
        if (q.kind === 'manual')
            and.push({ post: { articleId: null, visualId: null } });
        if (q.url === 'with')
            and.push({ facebookUrl: { not: null } });
        if (q.url === 'without')
            and.push({ facebookUrl: null });
        const needle = q.search?.trim();
        if (needle) {
            and.push({ post: { OR: [{ title: { contains: needle, mode: 'insensitive' } }, { description: { contains: needle, mode: 'insensitive' } }] } });
        }
        return { AND: and };
    }
    async audit(q, acting) {
        const shown = (p) => maskProfile((0, scope_1.scopeOf)(acting), p);
        const where = this.where(q, acting);
        const settings = await this.prisma.automationSetting.findUnique({ where: { id: 'global' }, select: { objectiveTimezone: true } });
        const timeZone = settings?.objectiveTimezone || 'Europe/Paris';
        const [total, rows, all] = await Promise.all([
            this.prisma.postTarget.count({ where }),
            this.prisma.postTarget.findMany({
                where,
                orderBy: { publishedAt: 'desc' },
                skip: (q.page - 1) * q.limit,
                take: q.limit,
                select: {
                    id: true,
                    publishedAt: true,
                    commentedAt: true,
                    linkUpdatedAt: true,
                    verifyStatus: true,
                    verifyDetail: true,
                    verifiedAt: true,
                    republishCount: true,
                    repeatRound: true,
                    facebookUrl: true,
                    approvalPendingSince: true,
                    rescueStatus: true,
                    rescueDetail: true,
                    post: { select: { id: true, title: true, imageUrl: true, url: true, priority: true, visualId: true, articleId: true } },
                    group: { select: { id: true, name: true, url: true, category: { select: { id: true, name: true } } } },
                    jobItems: {
                        where: { status: client_1.TargetStatus.PUBLISHED },
                        orderBy: { publishedAt: 'desc' },
                        take: 1,
                        select: { externalPostUrl: true, error: true, job: { select: { profile: { select: { id: true, name: true, ownerId: true } } } } },
                    },
                },
            }),
            this.prisma.postTarget.findMany({
                where,
                take: MAX_AUDITED,
                select: {
                    id: true,
                    publishedAt: true,
                    commentedAt: true,
                    linkUpdatedAt: true,
                    verifyStatus: true,
                    facebookUrl: true,
                    groupId: true,
                    approvalPendingSince: true,
                    verifyDetail: true,
                    rescueStatus: true,
                    rescueDetail: true,
                    post: { select: { url: true } },
                    jobItems: { where: { status: client_1.TargetStatus.PUBLISHED }, orderBy: { publishedAt: 'desc' }, take: 1, select: { error: true, job: { select: { profileId: true } } } },
                },
            }),
        ]);
        const tally = (keyOf) => {
            const out = new Map();
            for (const r of all) {
                const k = keyOf(r);
                if (k !== null)
                    out.set(k, (out.get(k) ?? 0) + 1);
            }
            return out;
        };
        const byProfileId = tally((r) => r.jobItems[0]?.job.profileId ?? null);
        const byGroupId = tally((r) => r.groupId);
        const byDay = tally((r) => (r.publishedAt ? dayIn(r.publishedAt, timeZone) : null));
        const byHour = tally((r) => (r.publishedAt ? String(hourIn(r.publishedAt, timeZone)) : null));
        const verify = tally((r) => (r.verifyStatus ? r.verifyStatus.toLowerCase() : 'unverified'));
        const link = tally((r) => linkState(r));
        const now = new Date();
        const why = tally((r) => (linkState(r) === 'missing' ? (0, link_why_1.missingWhy)(r, now).code : null));
        const [profiles, groups] = await Promise.all([
            this.prisma.profile.findMany({ where: { id: { in: [...byProfileId.keys()] }, ...(0, scope_1.profileWhere)((0, scope_1.scopeOf)(acting)) }, select: { id: true, name: true } }),
            this.prisma.group.findMany({ where: { id: { in: [...byGroupId.keys()] } }, select: { id: true, name: true } }),
        ]);
        const named = (m, names) => [...m.entries()]
            .map(([id, count]) => ({ id, name: names.find((n) => n.id === id)?.name ?? 'Profil d’un autre compte', count }))
            .sort((a, b) => b.count - a.count);
        return {
            timeZone,
            total,
            truncated: total > MAX_AUDITED,
            summary: {
                total,
                withUrl: all.filter((r) => r.facebookUrl).length,
                verify: Object.fromEntries(verify),
                link: Object.fromEntries(link),
                missingWhy: Object.fromEntries(why),
                byProfile: named(byProfileId, profiles),
                byGroup: named(byGroupId, groups),
                byDay: [...byDay.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([day, count]) => ({ day, count })),
                byHour: Array.from({ length: 24 }, (_, h) => byHour.get(String(h)) ?? 0),
            },
            rows: rows.map((r) => ({
                targetId: r.id,
                publishedAt: r.publishedAt,
                post: r.post,
                group: r.group,
                profile: shown(r.jobItems[0]?.job.profile ?? null),
                facebookUrl: r.facebookUrl ?? r.jobItems[0]?.externalPostUrl ?? null,
                link: linkState(r),
                why: linkState(r) === 'missing' ? (0, link_why_1.missingWhy)(r, now) : null,
                verify: { status: r.verifyStatus, at: r.verifiedAt, detail: r.verifyDetail, republishCount: r.republishCount },
                repeatRound: r.repeatRound,
            })),
            page: q.page,
            limit: q.limit,
        };
    }
    async csv(q, acting) {
        const scope = (0, scope_1.scopeOf)(acting);
        const csvProfile = (p) => !p ? '' : scope && p.ownerId !== scope.ownerId ? OTHER : p.name;
        const rows = await this.prisma.postTarget.findMany({
            where: this.where(q, acting),
            orderBy: { publishedAt: 'desc' },
            take: MAX_AUDITED,
            select: {
                publishedAt: true,
                commentedAt: true,
                linkUpdatedAt: true,
                verifyStatus: true,
                facebookUrl: true,
                approvalPendingSince: true,
                verifyDetail: true,
                rescueStatus: true,
                rescueDetail: true,
                post: { select: { title: true, url: true } },
                group: { select: { name: true, category: { select: { name: true } } } },
                jobItems: { where: { status: client_1.TargetStatus.PUBLISHED }, orderBy: { publishedAt: 'desc' }, take: 1, select: { error: true, job: { select: { profile: { select: { name: true, ownerId: true } } } } } },
            },
        });
        const now = new Date();
        const cell = (v) => {
            const s = v === null || v === undefined ? '' : String(v);
            const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
            return /[";\n,]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
        };
        const head = ['publie_le', 'profil', 'groupe', 'categorie', 'post', 'lien_article', 'etat_lien', 'pourquoi_manquant', 'verification', 'adresse_facebook'];
        const lines = rows.map((r) => [
            r.publishedAt?.toISOString() ?? '',
            csvProfile(r.jobItems[0]?.job.profile),
            r.group.name,
            r.group.category?.name ?? '',
            r.post.title,
            r.post.url ?? '',
            linkState(r),
            linkState(r) === 'missing' ? (0, link_why_1.missingWhy)(r, now).title.replace(/^\S+\s/, '') : '',
            r.verifyStatus ?? 'non vérifié',
            r.facebookUrl ?? '',
        ].map(cell).join(';'));
        return '﻿' + [head.join(';'), ...lines].join('\n');
    }
};
exports.PublishedService = PublishedService;
exports.PublishedService = PublishedService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], PublishedService);
//# sourceMappingURL=published.service.js.map