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
var WordpressPullService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.WordpressPullService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const class_transformer_1 = require("class-transformer");
const class_validator_1 = require("class-validator");
const prisma_service_1 = require("../prisma/prisma.service");
const wordpress_service_1 = require("./wordpress.service");
const wordpress_dto_1 = require("./wordpress.dto");
const DEFAULT_INTERVAL_MINUTES = 2;
const STARTUP_DELAY_MS = 30_000;
const TIMEOUT_MS = 30_000;
let WordpressPullService = WordpressPullService_1 = class WordpressPullService {
    prisma;
    config;
    wordpress;
    logger = new common_1.Logger(WordpressPullService_1.name);
    timer;
    startup;
    running = false;
    constructor(prisma, config, wordpress) {
        this.prisma = prisma;
        this.config = config;
        this.wordpress = wordpress;
    }
    onModuleInit() {
        const raw = Number(this.config.get('WORDPRESS_PULL_INTERVAL_MINUTES') ?? DEFAULT_INTERVAL_MINUTES);
        const minutes = Number.isFinite(raw) && raw >= 0 ? raw : DEFAULT_INTERVAL_MINUTES;
        if (!minutes)
            return;
        this.startup = setTimeout(() => void this.pullAll(), STARTUP_DELAY_MS);
        this.timer = setInterval(() => void this.pullAll(), minutes * 60_000);
        this.startup.unref?.();
        this.timer.unref?.();
    }
    onModuleDestroy() {
        if (this.timer)
            clearInterval(this.timer);
        if (this.startup)
            clearTimeout(this.startup);
    }
    async pullAll() {
        if (this.running)
            return [];
        this.running = true;
        try {
            const sites = await this.prisma.contentSource.findMany({
                where: { status: 'ACTIVE' },
                select: { id: true, name: true, originUrl: true, depositKey: true },
            });
            const results = [];
            for (const site of sites) {
                results.push(await this.pullSite(site).catch((error) => ({ site: site.name, received: 0, error: error.message })));
            }
            return results;
        }
        finally {
            this.running = false;
        }
    }
    async pullSite(site) {
        const key = site.depositKey || this.config.get('WORDPRESS_API_KEY') || '';
        if (!key)
            return { site: site.name, received: 0, skipped: 'aucune clé' };
        const response = await fetch(`${site.originUrl}/wp-json/dfb/v1/pending`, {
            signal: AbortSignal.timeout(TIMEOUT_MS),
            headers: { accept: 'application/json', 'x-api-key': key },
        });
        if (response.status === 404)
            return { site: site.name, received: 0, skipped: 'plugin < 1.4.1' };
        if (!response.ok)
            throw new Error(`HTTP ${response.status} sur dfb/v1/pending`);
        const body = (await response.json().catch(() => null));
        const articles = Array.isArray(body?.articles) ? body.articles : [];
        if (!articles.length)
            return { site: site.name, received: 0 };
        const acked = [];
        const titles = [];
        const reasons = new Set();
        for (const article of articles) {
            if (article.error)
                reasons.add(article.error);
            try {
                const dto = (0, class_transformer_1.plainToInstance)(wordpress_dto_1.WordpressArticleDto, article.payload);
                const problems = await (0, class_validator_1.validate)(dto, { whitelist: true });
                if (problems.length) {
                    throw new Error(`article invalide (${problems.map((p) => p.property).join(', ')})`);
                }
                await this.wordpress.publish(dto);
                acked.push({ postId: String(article.payload.postId), hash: article.hash });
                titles.push(article.payload.title);
            }
            catch (error) {
                this.logger.warn(`${site.name} : « ${article.payload?.title} » non reçu — ${error.message}`);
            }
        }
        if (acked.length) {
            await fetch(`${site.originUrl}/wp-json/dfb/v1/ack`, {
                method: 'POST',
                signal: AbortSignal.timeout(TIMEOUT_MS),
                headers: { 'content-type': 'application/json', 'x-api-key': key },
                body: JSON.stringify({ articles: acked }),
            }).catch(() => undefined);
            const why = reasons.size ? ` Le site ne les envoyait pas : ${[...reasons].join(' ; ')}` : '';
            await this.prisma.activityLog.create({
                data: {
                    eventType: 'WORDPRESS_PULLED',
                    level: 'WARN',
                    message: `${acked.length} article(s) récupéré(s) sur ${site.name} par la plateforme : ` +
                        `${titles.slice(0, 3).map((t) => `« ${t} »`).join(', ')}${titles.length > 3 ? '…' : ''}.${why}`,
                    metadata: { siteId: site.id, postIds: acked.map((a) => a.postId), reasons: [...reasons] },
                },
            });
        }
        return { site: site.name, received: acked.length, failed: articles.length - acked.length };
    }
};
exports.WordpressPullService = WordpressPullService;
exports.WordpressPullService = WordpressPullService = WordpressPullService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        config_1.ConfigService,
        wordpress_service_1.WordpressService])
], WordpressPullService);
//# sourceMappingURL=wordpress-pull.service.js.map