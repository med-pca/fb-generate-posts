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
exports.CampaignsController = void 0;
const openapi = require("@nestjs/swagger");
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const admin_auth_guard_1 = require("../auth/admin-auth.guard");
const current_user_1 = require("../auth/current-user");
const short_cache_service_1 = require("../perf/short-cache.service");
const campaigns_service_1 = require("./campaigns.service");
const campaign_dto_1 = require("./dto/campaign.dto");
let CampaignsController = class CampaignsController {
    campaigns;
    cache;
    constructor(campaigns, cache) {
        this.campaigns = campaigns;
        this.cache = cache;
    }
    list(acting) {
        return this.cache.get(acting, 'campaigns', 20_000, () => this.campaigns.list(acting));
    }
    teams(acting) {
        return this.cache.get(acting, 'campaigns/teams', 60_000, () => this.campaigns.teams(acting));
    }
    detail(id, acting) {
        return this.campaigns.detail(id, acting);
    }
    create(dto, acting) {
        return this.campaigns.create(dto, acting);
    }
    update(id, dto, acting) {
        return this.campaigns.update(id, dto, acting);
    }
    remove(id, acting) {
        return this.campaigns.remove(id, acting);
    }
};
exports.CampaignsController = CampaignsController;
__decorate([
    (0, common_1.Get)(),
    (0, swagger_1.ApiOperation)({ summary: 'Les campagnes du compte, avec leur avancement' }),
    openapi.ApiResponse({ status: 200 }),
    __param(0, (0, current_user_1.ActingUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], CampaignsController.prototype, "list", null);
__decorate([
    (0, common_1.Get)('teams'),
    (0, swagger_1.ApiOperation)({ summary: 'Les équipes (groupes NSTBrowser des profils) pour la rotation' }),
    openapi.ApiResponse({ status: 200 }),
    __param(0, (0, current_user_1.ActingUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], CampaignsController.prototype, "teams", null);
__decorate([
    (0, common_1.Get)(':id'),
    (0, swagger_1.ApiOperation)({ summary: 'Une campagne : avancement, série, statistiques par article, profil, groupe' }),
    openapi.ApiResponse({ status: 200 }),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, current_user_1.ActingUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], CampaignsController.prototype, "detail", null);
__decorate([
    (0, common_1.Post)(),
    (0, swagger_1.ApiOperation)({ summary: 'Créer une campagne (site obligatoire)' }),
    openapi.ApiResponse({ status: 201 }),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, current_user_1.ActingUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [campaign_dto_1.CreateCampaignDto, Object]),
    __metadata("design:returntype", void 0)
], CampaignsController.prototype, "create", null);
__decorate([
    (0, common_1.Patch)(':id'),
    (0, swagger_1.ApiOperation)({ summary: 'Modifier une campagne, la mettre en pause, la terminer' }),
    openapi.ApiResponse({ status: 200 }),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, current_user_1.ActingUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, campaign_dto_1.UpdateCampaignDto, Object]),
    __metadata("design:returntype", void 0)
], CampaignsController.prototype, "update", null);
__decorate([
    (0, common_1.Delete)(':id'),
    (0, swagger_1.ApiOperation)({ summary: 'Supprimer une campagne (posts et articles intacts)' }),
    openapi.ApiResponse({ status: 200 }),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, current_user_1.ActingUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], CampaignsController.prototype, "remove", null);
exports.CampaignsController = CampaignsController = __decorate([
    (0, swagger_1.ApiTags)('campaigns'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.UseGuards)(admin_auth_guard_1.AdminAuthGuard),
    (0, common_1.Controller)('campaigns'),
    __metadata("design:paramtypes", [campaigns_service_1.CampaignsService,
        short_cache_service_1.ShortCacheService])
], CampaignsController);
//# sourceMappingURL=campaigns.controller.js.map