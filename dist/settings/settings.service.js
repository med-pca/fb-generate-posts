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
exports.SettingsService = void 0;
const common_1 = require("@nestjs/common");
const articles_service_1 = require("../articles/articles.service");
const prisma_service_1 = require("../prisma/prisma.service");
let SettingsService = class SettingsService {
    prisma;
    articles;
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
        return Promise.all(profiles.map(({ id }) => this.replenishProfile(id)));
    }
    async replenishProfile(profileId) {
        const settings = await this.get();
        if (!settings.autoReplenishEnabled) {
            return { profileId, generated: 0, skipped: 'automation_disabled' };
        }
        const profile = await this.prisma.profile.findFirst({
            where: { id: profileId, status: 'ACTIVE' },
        });
        if (!profile)
            return { profileId, generated: 0, skipped: 'inactive_profile' };
        const available = await this.prisma.post.count({
            where: {
                profileId,
                status: 'AVAILABLE',
                OR: [{ articleId: null }, { article: { status: 'ACTIVE' } }],
                targets: {
                    some: { status: 'AVAILABLE', group: { status: 'ACTIVE' } },
                },
            },
        });
        if (available >= settings.minimumAvailablePerProfile) {
            return { profileId, available, generated: 0 };
        }
        const groups = await this.prisma.group.findMany({
            where: {
                status: 'ACTIVE',
                profiles: { some: { profileId, status: 'ACTIVE' } },
            },
            select: { id: true },
        });
        if (!groups.length)
            return { profileId, available, generated: 0, skipped: 'no_active_group' };
        const candidates = await this.prisma.article.findMany({
            where: {
                status: 'ACTIVE',
                posts: { none: { profileId } },
            },
            orderBy: { publishedAt: 'desc' },
        });
        let generated = 0;
        for (const article of candidates) {
            if (available + generated >= settings.minimumAvailablePerProfile)
                break;
            const posts = await this.articles.generatePosts(article.id, {
                profileId,
                groupIds: groups.map(({ id }) => id),
                delayMin: 10,
                delayMax: 60,
            });
            generated += posts.length;
        }
        return {
            profileId,
            available,
            generated,
            remaining: Math.max(0, settings.minimumAvailablePerProfile - available - generated),
        };
    }
};
exports.SettingsService = SettingsService;
exports.SettingsService = SettingsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        articles_service_1.ArticlesService])
], SettingsService);
//# sourceMappingURL=settings.service.js.map