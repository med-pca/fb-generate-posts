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
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SettingsController = void 0;
const openapi = require("@nestjs/swagger");
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const admin_auth_guard_1 = require("../auth/admin-auth.guard");
const update_settings_dto_1 = require("./dto/update-settings.dto");
const replenish_scheduler_1 = require("./replenish.scheduler");
const settings_service_1 = require("./settings.service");
let SettingsController = class SettingsController {
    settings;
    scheduler;
    constructor(settings, scheduler) {
        this.settings = settings;
        this.scheduler = scheduler;
    }
    async get() {
        const settings = await this.settings.get();
        return {
            ...settings,
            replenishIntervalMinutes: this.scheduler.intervalMinutes(),
        };
    }
    update(dto) {
        return this.settings.update(dto);
    }
    replenishNow() {
        return this.settings.replenishAll();
    }
    runScheduledPass() {
        return this.scheduler.run();
    }
    replenishProfile(profileId) {
        return this.settings.replenishProfile(profileId);
    }
};
exports.SettingsController = SettingsController;
__decorate([
    (0, common_1.Get)(),
    openapi.ApiResponse({ status: 200 }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], SettingsController.prototype, "get", null);
__decorate([
    (0, common_1.Patch)(),
    openapi.ApiResponse({ status: 200 }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [update_settings_dto_1.UpdateSettingsDto]),
    __metadata("design:returntype", void 0)
], SettingsController.prototype, "update", null);
__decorate([
    (0, common_1.Post)('replenish-now'),
    (0, swagger_1.ApiOperation)({
        summary: 'Compléter le stock de chaque groupe des profils actifs',
    }),
    openapi.ApiResponse({ status: 201, type: [Object] }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], SettingsController.prototype, "replenishNow", null);
__decorate([
    (0, common_1.Post)('replenish-now/all'),
    (0, swagger_1.ApiOperation)({
        summary: 'Déclencher un passage du minuteur, avec sa protection anti-chevauchement',
        description: 'Identique au passage périodique : si un passage est déjà en cours, ' +
            'celui-ci est ignoré plutôt que de doubler la charge.',
    }),
    openapi.ApiResponse({ status: 201, type: Object }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], SettingsController.prototype, "runScheduledPass", null);
__decorate([
    (0, common_1.Post)('replenish-now/:profileId'),
    (0, swagger_1.ApiOperation)({ summary: 'Compléter le stock des groupes d’un seul profil' }),
    openapi.ApiResponse({ status: 201, type: Object }),
    __param(0, (0, common_1.Param)('profileId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], SettingsController.prototype, "replenishProfile", null);
exports.SettingsController = SettingsController = __decorate([
    (0, swagger_1.ApiTags)('settings'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.UseGuards)(admin_auth_guard_1.AdminAuthGuard),
    (0, common_1.Controller)('settings'),
    __metadata("design:paramtypes", [settings_service_1.SettingsService,
        replenish_scheduler_1.ReplenishScheduler])
], SettingsController);
//# sourceMappingURL=settings.controller.js.map