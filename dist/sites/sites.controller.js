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
exports.SiteTargetsController = exports.SitesController = void 0;
const openapi = require("@nestjs/swagger");
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const admin_auth_guard_1 = require("../auth/admin-auth.guard");
const current_user_1 = require("../auth/current-user");
const automation_auth_guard_1 = require("../auth/automation-auth.guard");
const site_dto_1 = require("./dto/site.dto");
const sites_service_1 = require("./sites.service");
const plugin_check_service_1 = require("./plugin-check.service");
let SitesController = class SitesController {
    sites;
    plugins;
    constructor(sites, plugins) {
        this.sites = sites;
        this.plugins = plugins;
    }
    async checkAll(acting) {
        const sites = await this.sites.findAll(acting);
        await this.plugins.checkAll(sites.map(({ id }) => id));
        return this.sites.findAll(acting);
    }
    async check(id, acting) {
        await this.sites.findOne(id, acting);
        await this.plugins.check(id);
        return this.sites.findOne(id, acting);
    }
    findAll(acting) {
        return this.sites.findAll(acting);
    }
    create(dto, acting) {
        return this.sites.create(dto, acting);
    }
    update(id, dto, acting) {
        return this.sites.update(id, dto, acting);
    }
    remove(id, acting) {
        return this.sites.remove(id, acting);
    }
};
exports.SitesController = SitesController;
__decorate([
    (0, common_1.Post)('check'),
    (0, swagger_1.ApiOperation)({
        summary: 'Vérifier l’extension WordPress de tous ses sites',
        description: 'Interroge la route `dfb/v1/status` de chaque site : connecté, clé ' +
            'refusée, extension absente ou site injoignable.',
    }),
    openapi.ApiResponse({ status: 201 }),
    __param(0, (0, current_user_1.ActingUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], SitesController.prototype, "checkAll", null);
__decorate([
    (0, common_1.Post)(':id/check'),
    (0, swagger_1.ApiOperation)({ summary: 'Vérifier l’extension WordPress d’un site' }),
    openapi.ApiResponse({ status: 201 }),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, current_user_1.ActingUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], SitesController.prototype, "check", null);
__decorate([
    (0, common_1.Get)(),
    (0, swagger_1.ApiOperation)({ summary: 'Les sites WordPress déclarés' }),
    openapi.ApiResponse({ status: 200 }),
    __param(0, (0, current_user_1.ActingUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], SitesController.prototype, "findAll", null);
__decorate([
    (0, common_1.Post)(),
    openapi.ApiResponse({ status: 201 }),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, current_user_1.ActingUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [site_dto_1.CreateSiteDto, Object]),
    __metadata("design:returntype", void 0)
], SitesController.prototype, "create", null);
__decorate([
    (0, common_1.Patch)(':id'),
    (0, swagger_1.ApiOperation)({
        summary: 'Modifier un site',
        description: 'Une clé absente du corps laisse en place celle déjà enregistrée.',
    }),
    openapi.ApiResponse({ status: 200 }),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, current_user_1.ActingUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, site_dto_1.UpdateSiteDto, Object]),
    __metadata("design:returntype", void 0)
], SitesController.prototype, "update", null);
__decorate([
    (0, common_1.Delete)(':id'),
    (0, swagger_1.ApiOperation)({
        summary: 'Supprimer un site sans article',
        description: 'Un site qui porte des articles est refusé : le supprimer les ' +
            'emporterait, et avec eux les posts qui en sont nés. Le désactiver.',
    }),
    openapi.ApiResponse({ status: 200 }),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, current_user_1.ActingUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], SitesController.prototype, "remove", null);
exports.SitesController = SitesController = __decorate([
    (0, swagger_1.ApiTags)('sites'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.UseGuards)(admin_auth_guard_1.AdminAuthGuard),
    (0, common_1.Controller)('sites'),
    __metadata("design:paramtypes", [sites_service_1.SitesService,
        plugin_check_service_1.PluginCheckService])
], SitesController);
let SiteTargetsController = class SiteTargetsController {
    sites;
    constructor(sites) {
        this.sites = sites;
    }
    targets(acting) {
        return this.sites.targets(acting);
    }
};
exports.SiteTargetsController = SiteTargetsController;
__decorate([
    (0, common_1.Get)(),
    (0, swagger_1.ApiOperation)({ summary: 'Les sites où une reprise peut être déposée' }),
    openapi.ApiResponse({ status: 200 }),
    __param(0, (0, current_user_1.ActingUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], SiteTargetsController.prototype, "targets", null);
exports.SiteTargetsController = SiteTargetsController = __decorate([
    (0, swagger_1.ApiTags)('jobs'),
    (0, swagger_1.ApiHeader)({ name: 'X-API-Key', required: true }),
    (0, common_1.UseGuards)(automation_auth_guard_1.AutomationAuthGuard),
    (0, common_1.Controller)('jobs/sites'),
    __metadata("design:paramtypes", [sites_service_1.SitesService])
], SiteTargetsController);
//# sourceMappingURL=sites.controller.js.map