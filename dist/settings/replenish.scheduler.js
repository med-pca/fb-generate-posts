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
var ReplenishScheduler_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.ReplenishScheduler = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const prisma_service_1 = require("../prisma/prisma.service");
const settings_service_1 = require("./settings.service");
const DEFAULT_INTERVAL_MINUTES = 15;
const STARTUP_DELAY_MS = 30_000;
let ReplenishScheduler = ReplenishScheduler_1 = class ReplenishScheduler {
    config;
    settings;
    prisma;
    logger = new common_1.Logger(ReplenishScheduler_1.name);
    timer;
    startup;
    running = false;
    constructor(config, settings, prisma) {
        this.config = config;
        this.settings = settings;
        this.prisma = prisma;
    }
    onModuleInit() {
        const minutes = this.intervalMinutes();
        if (minutes <= 0) {
            this.logger.log('Alimentation périodique désactivée (REPLENISH_INTERVAL_MINUTES=0)');
            return;
        }
        this.logger.log(`Alimentation périodique toutes les ${minutes} minute(s)`);
        this.startup = setTimeout(() => void this.run(), STARTUP_DELAY_MS);
        this.timer = setInterval(() => void this.run(), minutes * 60_000);
        this.timer.unref?.();
        this.startup.unref?.();
    }
    onModuleDestroy() {
        if (this.timer)
            clearInterval(this.timer);
        if (this.startup)
            clearTimeout(this.startup);
    }
    intervalMinutes() {
        const raw = this.config.get('REPLENISH_INTERVAL_MINUTES');
        if (raw === undefined || raw === null || raw === '') {
            return DEFAULT_INTERVAL_MINUTES;
        }
        const minutes = Number(raw);
        return Number.isFinite(minutes) && minutes >= 0
            ? Math.floor(minutes)
            : DEFAULT_INTERVAL_MINUTES;
    }
    async run() {
        if (this.running) {
            this.logger.warn('Passage précédent encore en cours, tour sauté');
            return { skipped: 'already_running' };
        }
        this.running = true;
        try {
            const results = await this.settings.replenishAll();
            const generated = results.reduce((total, r) => total + r.generated, 0);
            const reused = results.reduce((total, r) => total + r.reused, 0);
            if (generated || reused) {
                await this.prisma.activityLog.create({
                    data: {
                        eventType: 'REPLENISH_SCHEDULED',
                        message: `${generated} post(s) créé(s) et ${reused} rattaché(s) sur ${results.length} profil(s)`,
                        metadata: { generated, reused, profiles: results.length },
                    },
                });
            }
            this.logger.log(`Alimentation : ${generated} créé(s), ${reused} rattaché(s), ${results.length} profil(s)`);
            return { profiles: results.length, generated, reused };
        }
        catch (error) {
            const message = error instanceof Error ? error.message : 'Erreur inconnue';
            this.logger.error(`Alimentation périodique en échec : ${message}`);
            await this.prisma.activityLog
                .create({
                data: {
                    eventType: 'REPLENISH_FAILED',
                    level: 'ERROR',
                    message,
                },
            })
                .catch(() => undefined);
            return { error: message };
        }
        finally {
            this.running = false;
        }
    }
};
exports.ReplenishScheduler = ReplenishScheduler;
exports.ReplenishScheduler = ReplenishScheduler = ReplenishScheduler_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService,
        settings_service_1.SettingsService,
        prisma_service_1.PrismaService])
], ReplenishScheduler);
//# sourceMappingURL=replenish.scheduler.js.map