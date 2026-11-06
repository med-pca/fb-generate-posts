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
exports.ProfilesController = exports.AssignProfilesDto = void 0;
const openapi = require("@nestjs/swagger");
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const admin_auth_guard_1 = require("../auth/admin-auth.guard");
const admin_role_guard_1 = require("../auth/admin-role.guard");
const class_validator_1 = require("class-validator");
class AssignProfilesDto {
    profileIds;
    ownerId;
    shareGroups;
}
exports.AssignProfilesDto = AssignProfilesDto;
__decorate([
    (0, class_validator_1.IsArray)(),
    (0, class_validator_1.ArrayMinSize)(1),
    (0, class_validator_1.ArrayMaxSize)(500),
    (0, class_validator_1.IsString)({ each: true }),
    __metadata("design:type", Array)
], AssignProfilesDto.prototype, "profileIds", void 0);
__decorate([
    (0, class_validator_1.ValidateIf)((_d, v) => v !== null),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", Object)
], AssignProfilesDto.prototype, "ownerId", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsBoolean)(),
    __metadata("design:type", Boolean)
], AssignProfilesDto.prototype, "shareGroups", void 0);
const current_user_1 = require("../auth/current-user");
const create_profile_dto_1 = require("./dto/create-profile.dto");
const profiles_service_1 = require("./profiles.service");
const update_profile_dto_1 = require("./dto/update-profile.dto");
const query_profiles_dto_1 = require("./dto/query-profiles.dto");
const profile_health_service_1 = require("./profile-health.service");
const profile_overview_service_1 = require("./profile-overview.service");
class ClearSuspensionDto {
    resume;
}
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsBoolean)(),
    __metadata("design:type", Boolean)
], ClearSuspensionDto.prototype, "resume", void 0);
let ProfilesController = class ProfilesController {
    profiles;
    health;
    overviewOf;
    constructor(profiles, health, overviewOf) {
        this.profiles = profiles;
        this.health = health;
        this.overviewOf = overviewOf;
    }
    overview(days, acting) {
        const n = Math.min(90, Math.max(1, Number(days) || 14));
        return this.overviewOf.overview(acting, n);
    }
    create(dto, acting) {
        return this.profiles.create(dto, acting);
    }
    removeFromGroups(id, acting) {
        return this.profiles.requestGroupRemoval(id, acting);
    }
    clearSuspension(id, dto, acting) {
        return this.profiles.clearSuspension(id, acting, { resume: dto?.resume === true });
    }
    assign(dto, acting) {
        return this.profiles.assign(dto, acting);
    }
    findAll(query, acting) {
        return this.profiles.findAll(query, acting);
    }
    detail(id, acting) {
        return this.health.detail(id, acting);
    }
    deactivate(id, dto, acting) {
        return this.health.deactivate(id, dto.transferTo ?? null, acting);
    }
    findOne(id, acting) {
        return this.profiles.findOne(id, acting);
    }
    update(id, dto, acting) {
        return this.profiles.update(id, dto, acting);
    }
    remove(id, acting) {
        return this.profiles.remove(id, acting);
    }
};
exports.ProfilesController = ProfilesController;
__decorate([
    openapi.ApiQuery({ name: "days", required: false }),
    (0, common_1.Get)('overview'),
    (0, swagger_1.ApiOperation)({ summary: 'Tableau de bord de tous les profils visibles : états, santé, publications, à traiter' }),
    openapi.ApiResponse({ status: 200 }),
    __param(0, (0, common_1.Query)('days')),
    __param(1, (0, current_user_1.ActingUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], ProfilesController.prototype, "overview", null);
__decorate([
    (0, common_1.Post)(),
    openapi.ApiResponse({ status: 201 }),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, current_user_1.ActingUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [create_profile_dto_1.CreateProfileDto, Object]),
    __metadata("design:returntype", void 0)
], ProfilesController.prototype, "create", null);
__decorate([
    (0, common_1.Post)(':id/remove-from-groups'),
    (0, swagger_1.ApiOperation)({ summary: 'Compte suspendu par Facebook : le modérateur le retire de nos groupes' }),
    openapi.ApiResponse({ status: 201 }),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, current_user_1.ActingUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], ProfilesController.prototype, "removeFromGroups", null);
__decorate([
    (0, common_1.Post)(':id/suspension/clear'),
    (0, swagger_1.ApiOperation)({ summary: 'Compte récupéré (vérification passée, reconnecté…) : lever l’arrêt ; avec `resume`, il retrouve son mode d’avant et reprend le travail' }),
    openapi.ApiResponse({ status: 201 }),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, current_user_1.ActingUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, ClearSuspensionDto, Object]),
    __metadata("design:returntype", void 0)
], ProfilesController.prototype, "clearSuspension", null);
__decorate([
    (0, common_1.Post)('assign'),
    (0, common_1.UseGuards)(admin_role_guard_1.AdminRoleGuard),
    (0, swagger_1.ApiOperation)({ summary: 'Confier des profils à un gestionnaire, ou les rendre à l’administration (ADMIN)' }),
    openapi.ApiResponse({ status: 201 }),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, current_user_1.ActingUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [AssignProfilesDto, Object]),
    __metadata("design:returntype", void 0)
], ProfilesController.prototype, "assign", null);
__decorate([
    (0, common_1.Get)(),
    openapi.ApiResponse({ status: 200 }),
    __param(0, (0, common_1.Query)()),
    __param(1, (0, current_user_1.ActingUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [query_profiles_dto_1.QueryProfilesDto, Object]),
    __metadata("design:returntype", void 0)
], ProfilesController.prototype, "findAll", null);
__decorate([
    (0, common_1.Get)(':id/health'),
    (0, swagger_1.ApiOperation)({ summary: 'Statistiques détaillées, score de santé, indice de désactivation et plan de transfert' }),
    openapi.ApiResponse({ status: 200 }),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, current_user_1.ActingUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], ProfilesController.prototype, "detail", null);
__decorate([
    (0, common_1.Post)(':id/deactivate'),
    (0, common_1.HttpCode)(200),
    (0, swagger_1.ApiOperation)({
        summary: 'Désactiver un profil et confier ses posts en attente à un autre',
        description: 'Libère son lot en cours, passe ses publications forcées et ses posts au profil choisi (là où il a rejoint le groupe), ' +
            'les autres retournent à la file. Signale les groupes où il était le seul profil.',
    }),
    openapi.ApiResponse({ status: 200 }),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, current_user_1.ActingUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, query_profiles_dto_1.DeactivateProfileDto, Object]),
    __metadata("design:returntype", void 0)
], ProfilesController.prototype, "deactivate", null);
__decorate([
    (0, common_1.Get)(':id'),
    openapi.ApiResponse({ status: 200, type: Object }),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, current_user_1.ActingUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], ProfilesController.prototype, "findOne", null);
__decorate([
    (0, common_1.Patch)(':id'),
    openapi.ApiResponse({ status: 200 }),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, current_user_1.ActingUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, update_profile_dto_1.UpdateProfileDto, Object]),
    __metadata("design:returntype", void 0)
], ProfilesController.prototype, "update", null);
__decorate([
    (0, common_1.Delete)(':id'),
    openapi.ApiResponse({ status: 200 }),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, current_user_1.ActingUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], ProfilesController.prototype, "remove", null);
exports.ProfilesController = ProfilesController = __decorate([
    (0, swagger_1.ApiTags)('profiles'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.UseGuards)(admin_auth_guard_1.AdminAuthGuard),
    (0, common_1.Controller)('profiles'),
    __metadata("design:paramtypes", [profiles_service_1.ProfilesService,
        profile_health_service_1.ProfileHealthService,
        profile_overview_service_1.ProfileOverviewService])
], ProfilesController);
//# sourceMappingURL=profiles.controller.js.map