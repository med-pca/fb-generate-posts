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
var SettingsService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.SettingsService = void 0;
const common_1 = require("@nestjs/common");
const client_1 = require("@prisma/client");
const articles_service_1 = require("../articles/articles.service");
const prisma_service_1 = require("../prisma/prisma.service");
const DELAY_MIN = 10;
const DELAY_MAX = 60;
const MAX_POSTS_PER_RUN = 200;
let SettingsService = SettingsService_1 = class SettingsService {
    prisma;
    articles;
    logger = new common_1.Logger(SettingsService_1.name);
    constructor(prisma, articles) {
        this.prisma = prisma;
        this.articles = articles;
    }
    get() {
        return this.prisma.automationSetting.upsert({
            where: { id: 'global' },
            create: { id: 'global' },
            update: {},
        });
    }
    update(dto) {
        return this.prisma.automationSetting.upsert({
            where: { id: 'global' },
            create: { id: 'global', ...dto },
            update: dto,
        });
    }
    async replenishAll() {
        const profiles = await this.prisma.profile.findMany({
            where: { status: 'ACTIVE' },
            select: { id: true },
        });
        const results = [];
        for (const { id } of profiles)
            results.push(await this.replenishProfile(id));
        return results;
    }
    async replenishProfile(profileId) {
        const settings = await this.get();
        if (!settings.autoReplenishEnabled) {
            return this.empty(profileId, 'automation_disabled');
        }
        const profile = await this.prisma.profile.findFirst({
            where: { id: profileId, status: 'ACTIVE' },
            select: { id: true },
        });
        if (!profile)
            return this.empty(profileId, 'inactive_profile');
        const groups = await this.prisma.group.findMany({
            where: {
                status: 'ACTIVE',
                profiles: { some: { profileId, status: 'ACTIVE' } },
            },
            select: { id: true, name: true },
            orderBy: { createdAt: 'asc' },
        });
        if (!groups.length)
            return this.empty(profileId, 'no_active_group');
        const stocks = await this.groupStocks(profileId, groups, settings.minimumAvailablePerGroup);
        const reused = await this.reuseExistingPosts(profileId, stocks);
        const profileAvailable = await this.countAvailablePosts(profileId);
        const profileMissing = Math.max(0, settings.minimumAvailablePerProfile - profileAvailable);
        const missing = Math.max(profileMissing, ...stocks.map((stock) => stock.missing));
        const toCreate = Math.min(MAX_POSTS_PER_RUN, missing);
        if (toCreate === 0) {
            return this.report(profileId, profileAvailable, 0, reused, stocks);
        }
        const { generated, skipped } = await this.generatePosts(profileId, stocks, groups.map(({ id }) => id), toCreate);
        if (generated || reused) {
            await this.logReplenishment(profileId, generated, reused, stocks);
        }
        return this.report(profileId, profileAvailable + generated, generated, reused, stocks, skipped);
    }
    async groupStocks(profileId, groups, minimum) {
        const counts = await this.prisma.postTarget.groupBy({
            by: ['groupId'],
            where: {
                groupId: { in: groups.map(({ id }) => id) },
                status: 'AVAILABLE',
                post: this.availablePostWhere(profileId),
            },
            _count: { _all: true },
        });
        const byGroup = new Map(counts.map((count) => [count.groupId, count._count._all]));
        return groups.map(({ id, name }) => {
            const available = byGroup.get(id) ?? 0;
            return {
                groupId: id,
                name,
                available,
                missing: Math.max(0, minimum - available),
            };
        });
    }
    async reuseExistingPosts(profileId, stocks) {
        let reused = 0;
        for (const stock of stocks) {
            if (!stock.missing)
                continue;
            const posts = await this.prisma.post.findMany({
                where: {
                    ...this.availablePostWhere(profileId),
                    targets: { none: { groupId: stock.groupId } },
                },
                select: { id: true },
                orderBy: { createdAt: 'asc' },
                take: stock.missing,
            });
            if (!posts.length)
                continue;
            const { count } = await this.prisma.postTarget.createMany({
                data: posts.map(({ id }) => ({ postId: id, groupId: stock.groupId })),
                skipDuplicates: true,
            });
            this.fill(stock, count);
            reused += count;
        }
        return reused;
    }
    async generatePosts(profileId, stocks, allGroupIds, toCreate) {
        const articles = (await this.prisma.article.findMany({
            where: { status: 'ACTIVE' },
            select: {
                id: true,
                title: true,
                articleUrl: true,
                coverImageUrl: true,
                hashtags: true,
                captions: true,
            },
            orderBy: { publishedAt: 'desc' },
        })).filter((article) => this.articles.captionsOf(article).length > 0);
        if (!articles.length)
            return { generated: 0, skipped: 'no_article' };
        const taken = await this.takenSlots(profileId, articles);
        const ordered = [...articles].sort((a, b) => (taken.get(a.id)?.size ?? 0) - (taken.get(b.id)?.size ?? 0));
        const cursors = new Map();
        let generated = 0;
        let attempts = 0;
        const maxAttempts = toCreate * 4 + ordered.length;
        while (generated < toCreate && attempts < maxAttempts) {
            for (const article of ordered) {
                if (generated >= toCreate || attempts >= maxAttempts)
                    break;
                attempts += 1;
                const groupIds = this.groupsToFill(stocks, allGroupIds);
                const slot = this.nextFreeSlot(article, profileId, taken, cursors);
                const data = this.articles.postDataForSlot(article, slot, {
                    profileId,
                    delayMin: DELAY_MIN,
                    delayMax: DELAY_MAX,
                });
                taken.get(article.id)?.add(data.externalId);
                try {
                    await this.prisma.post.create({
                        data: {
                            ...data,
                            targets: { create: groupIds.map((groupId) => ({ groupId })) },
                        },
                    });
                }
                catch (error) {
                    if (this.isUniqueViolation(error))
                        continue;
                    throw error;
                }
                for (const groupId of groupIds) {
                    const stock = stocks.find((item) => item.groupId === groupId);
                    if (stock)
                        this.fill(stock, 1);
                }
                generated += 1;
            }
        }
        if (generated < toCreate) {
            this.logger.warn(`Alimentation partielle du profil ${profileId} : ${generated}/${toCreate} post(s)`);
        }
        return { generated, skipped: undefined };
    }
    async takenSlots(profileId, articles) {
        const posts = await this.prisma.post.findMany({
            where: {
                profileId,
                sourceType: 'JSON',
                articleId: { in: articles.map(({ id }) => id) },
            },
            select: { articleId: true, externalId: true },
        });
        const taken = new Map(articles.map(({ id }) => [id, new Set()]));
        for (const { articleId, externalId } of posts) {
            if (articleId && externalId)
                taken.get(articleId)?.add(externalId);
        }
        return taken;
    }
    nextFreeSlot(article, profileId, taken, cursors) {
        const captionCount = this.articles.captionsOf(article).length;
        const used = taken.get(article.id) ?? new Set();
        let slot = cursors.get(article.id) ?? 0;
        while (used.has(this.articles.slotExternalId(article.id, profileId, slot, captionCount))) {
            slot += 1;
        }
        cursors.set(article.id, slot + 1);
        return slot;
    }
    groupsToFill(stocks, allGroupIds) {
        const starving = stocks
            .filter((stock) => stock.missing > 0)
            .map((stock) => stock.groupId);
        return starving.length ? starving : allGroupIds;
    }
    countAvailablePosts(profileId) {
        return this.prisma.post.count({
            where: {
                ...this.availablePostWhere(profileId),
                targets: { some: { status: 'AVAILABLE', group: { status: 'ACTIVE' } } },
            },
        });
    }
    availablePostWhere(profileId) {
        return {
            profileId,
            status: 'AVAILABLE',
            OR: [{ articleId: null }, { article: { status: 'ACTIVE' } }],
        };
    }
    fill(stock, count) {
        stock.available += count;
        stock.missing = Math.max(0, stock.missing - count);
    }
    isUniqueViolation(error) {
        return (error instanceof client_1.Prisma.PrismaClientKnownRequestError &&
            error.code === 'P2002');
    }
    logReplenishment(profileId, generated, reused, stocks) {
        return this.prisma.activityLog.create({
            data: {
                profileId,
                eventType: 'POSTS_REPLENISHED',
                message: `${generated} post(s) créé(s), ${reused} cible(s) réutilisée(s)`,
                metadata: {
                    groups: stocks.map(({ groupId, name, available, missing }) => ({
                        groupId,
                        name,
                        available,
                        missing,
                    })),
                },
            },
        });
    }
    empty(profileId, skipped) {
        return {
            profileId,
            available: 0,
            generated: 0,
            reused: 0,
            skipped,
            groups: [],
        };
    }
    report(profileId, available, generated, reused, stocks, skipped) {
        return {
            profileId,
            available,
            generated,
            reused,
            skipped,
            groups: stocks,
            remaining: stocks.reduce((total, stock) => total + stock.missing, 0),
        };
    }
};
exports.SettingsService = SettingsService;
exports.SettingsService = SettingsService = SettingsService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        articles_service_1.ArticlesService])
], SettingsService);
//# sourceMappingURL=settings.service.js.map