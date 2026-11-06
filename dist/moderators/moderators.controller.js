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
exports.ModeratorControlController = exports.ModeratorsController = exports.ModeratorControlDto = exports.ModeratorRunDto = exports.ModeratorSettingsDto = void 0;
const openapi = require("@nestjs/swagger");
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const class_validator_1 = require("class-validator");
const admin_auth_guard_1 = require("../auth/admin-auth.guard");
const admin_role_guard_1 = require("../auth/admin-role.guard");
const automation_auth_guard_1 = require("../auth/automation-auth.guard");
const current_user_1 = require("../auth/current-user");
const verify_dto_1 = require("../verify/dto/verify.dto");
const members_service_1 = require("../verify/members.service");
const audit_service_1 = require("../verify/audit.service");
const common_2 = require("@nestjs/common");
const moderators_service_1 = require("./moderators.service");
class ModeratorSettingsDto {
    paused;
    batchSize;
    everyMinutes;
    members;
    postsCheck;
    removals;
    spam;
    pending;
    windowStart;
    windowEnd;
    timezone;
    hourlyLimit;
    dailyLimit;
}
exports.ModeratorSettingsDto = ModeratorSettingsDto;
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsBoolean)(),
    __metadata("design:type", Boolean)
], ModeratorSettingsDto.prototype, "paused", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ minimum: 1, maximum: 20 }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(1),
    (0, class_validator_1.Max)(20),
    __metadata("design:type", Number)
], ModeratorSettingsDto.prototype, "batchSize", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ minimum: 2, maximum: 240 }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(2),
    (0, class_validator_1.Max)(240),
    __metadata("design:type", Number)
], ModeratorSettingsDto.prototype, "everyMinutes", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsBoolean)(),
    __metadata("design:type", Boolean)
], ModeratorSettingsDto.prototype, "members", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsBoolean)(),
    __metadata("design:type", Boolean)
], ModeratorSettingsDto.prototype, "postsCheck", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsBoolean)(),
    __metadata("design:type", Boolean)
], ModeratorSettingsDto.prototype, "removals", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsBoolean)(),
    __metadata("design:type", Boolean)
], ModeratorSettingsDto.prototype, "spam", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsBoolean)(),
    __metadata("design:type", Boolean)
], ModeratorSettingsDto.prototype, "pending", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ minimum: 0, maximum: 1439 }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(0),
    (0, class_validator_1.Max)(1439),
    __metadata("design:type", Number)
], ModeratorSettingsDto.prototype, "windowStart", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ minimum: 0, maximum: 1439 }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(0),
    (0, class_validator_1.Max)(1439),
    __metadata("design:type", Number)
], ModeratorSettingsDto.prototype, "windowEnd", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: 'Europe/Paris' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(60),
    __metadata("design:type", String)
], ModeratorSettingsDto.prototype, "timezone", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ minimum: 1, maximum: 60 }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(1),
    (0, class_validator_1.Max)(60),
    __metadata("design:type", Number)
], ModeratorSettingsDto.prototype, "hourlyLimit", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ minimum: 1, maximum: 400 }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(1),
    (0, class_validator_1.Max)(400),
    __metadata("design:type", Number)
], ModeratorSettingsDto.prototype, "dailyLimit", void 0);
class ModeratorRunDto {
    kind;
}
exports.ModeratorRunDto = ModeratorRunDto;
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ enum: ['posts', 'members'] }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsIn)(['posts', 'members']),
    __metadata("design:type", String)
], ModeratorRunDto.prototype, "kind", void 0);
class ModeratorControlDto extends verify_dto_1.VerifyClaimDto {
    agent;
}
exports.ModeratorControlDto = ModeratorControlDto;
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(200),
    __metadata("design:type", String)
], ModeratorControlDto.prototype, "agent", void 0);
let ModeratorsController = class ModeratorsController {
    moderators;
    audit;
    members;
    constructor(moderators, audit, members) {
        this.moderators = moderators;
        this.audit = audit;
        this.members = members;
    }
    preapprovals(acting, profileId, state, search) {
        return this.members.preapprovals({ profileId, state, search }, acting);
    }
    membersSummary(acting) {
        return this.members.summary(acting);
    }
    requestMembers(dto, acting) {
        return this.members.request(dto.kind, { profileGroupIds: dto.profileGroupIds, profileId: dto.profileId }, acting);
    }
    markManual(dto, acting) {
        return this.members.markManual(dto.profileGroupIds, dto.state, acting);
    }
    requestAudit(dto, acting) {
        return this.audit.request(dto, acting);
    }
    auditResults(acting, profileId) {
        return this.audit.results(acting, profileId);
    }
    list(acting) {
        return this.moderators.list(acting);
    }
    detail(id, acting) {
        return this.moderators.detail(id, acting);
    }
    settings(id, dto, acting) {
        return this.moderators.updateSettings(id, dto, acting);
    }
    run(id, dto, acting) {
        return this.moderators.run(id, acting, dto?.kind ?? 'posts');
    }
    recheck(id, acting) {
        return this.moderators.recheck(id, acting);
    }
    retryMembers(id, acting) {
        return this.moderators.retryMembers(id, acting);
    }
};
exports.ModeratorsController = ModeratorsController;
__decorate([
    openapi.ApiQuery({ name: "profileId", required: false }),
    openapi.ApiQuery({ name: "state", required: false }),
    openapi.ApiQuery({ name: "search", required: false }),
    (0, common_1.Get)('preapprovals'),
    (0, swagger_1.ApiOperation)({ summary: 'Pré-approbations : nos profils × groupes (profils récents d’abord), filtres profil / état / recherche' }),
    openapi.ApiResponse({ status: 200 }),
    __param(0, (0, current_user_1.ActingUser)()),
    __param(1, (0, common_2.Query)('profileId')),
    __param(2, (0, common_2.Query)('state')),
    __param(3, (0, common_2.Query)('search')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String, String]),
    __metadata("design:returntype", void 0)
], ModeratorsController.prototype, "preapprovals", null);
__decorate([
    (0, common_1.Get)('members'),
    (0, swagger_1.ApiOperation)({ summary: 'Nos profils dans les groupes : adhésions à accepter, pré-approbations à faire, bloqués' }),
    openapi.ApiResponse({ status: 200 }),
    __param(0, (0, current_user_1.ActingUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], ModeratorsController.prototype, "membersSummary", null);
__decorate([
    (0, common_1.Post)('members'),
    (0, common_1.HttpCode)(200),
    (0, swagger_1.ApiOperation)({ summary: 'Demander au modérateur d’accepter les adhésions / de pré-approuver (tout, un profil, des liaisons) — ses profils, ses groupes' }),
    openapi.ApiResponse({ status: 200 }),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, current_user_1.ActingUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [verify_dto_1.MemberRequestDto, Object]),
    __metadata("design:returntype", void 0)
], ModeratorsController.prototype, "requestMembers", null);
__decorate([
    (0, common_1.Post)('members/manual'),
    (0, common_1.HttpCode)(200),
    (0, swagger_1.ApiOperation)({ summary: 'Marquer des pré-approbations faites à la main sur Facebook, ou annuler ce marquage — ses profils, ses groupes' }),
    openapi.ApiResponse({ status: 200 }),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, current_user_1.ActingUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [verify_dto_1.MemberManualDto, Object]),
    __metadata("design:returntype", void 0)
], ModeratorsController.prototype, "markManual", null);
__decorate([
    (0, common_1.Post)('audit'),
    (0, common_1.HttpCode)(200),
    (0, swagger_1.ApiOperation)({ summary: 'Contrôler la pré-approbation de nos profils (tous, un profil, ou des liaisons précises) — ses profils, ses groupes' }),
    openapi.ApiResponse({ status: 200 }),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, current_user_1.ActingUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [verify_dto_1.AuditRequestDto, Object]),
    __metadata("design:returntype", void 0)
], ModeratorsController.prototype, "requestAudit", null);
__decorate([
    openapi.ApiQuery({ name: "profileId", required: false }),
    (0, common_1.Get)('audit'),
    (0, swagger_1.ApiOperation)({ summary: 'Résultats des contrôles de pré-approbation' }),
    openapi.ApiResponse({ status: 200 }),
    __param(0, (0, current_user_1.ActingUser)()),
    __param(1, (0, common_2.Query)('profileId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], ModeratorsController.prototype, "auditResults", null);
__decorate([
    (0, common_1.Get)(),
    (0, swagger_1.ApiOperation)({ summary: 'Les modérateurs, leur état et leurs chiffres' }),
    openapi.ApiResponse({ status: 200 }),
    __param(0, (0, current_user_1.ActingUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], ModeratorsController.prototype, "list", null);
__decorate([
    (0, common_1.Get)(':id'),
    (0, swagger_1.ApiOperation)({ summary: 'Un modérateur : chiffres, 14 jours, dernières actions' }),
    openapi.ApiResponse({ status: 200 }),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, current_user_1.ActingUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], ModeratorsController.prototype, "detail", null);
__decorate([
    (0, common_1.Patch)(':id/settings'),
    (0, common_1.UseGuards)(admin_role_guard_1.AdminRoleGuard),
    (0, swagger_1.ApiOperation)({ summary: 'Régler un modérateur : suspendre, taille de lot, fréquence, adhésions (admin)' }),
    openapi.ApiResponse({ status: 200 }),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, current_user_1.ActingUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, ModeratorSettingsDto, Object]),
    __metadata("design:returntype", void 0)
], ModeratorsController.prototype, "settings", null);
__decorate([
    (0, common_1.Post)(':id/run'),
    (0, common_1.HttpCode)(200),
    (0, common_1.UseGuards)(admin_role_guard_1.AdminRoleGuard),
    (0, swagger_1.ApiOperation)({ summary: 'Lancer un passage maintenant (admin)' }),
    openapi.ApiResponse({ status: 200 }),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, current_user_1.ActingUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, ModeratorRunDto, Object]),
    __metadata("design:returntype", void 0)
], ModeratorsController.prototype, "run", null);
__decorate([
    (0, common_1.Post)(':id/recheck'),
    (0, common_1.HttpCode)(200),
    (0, common_1.UseGuards)(admin_role_guard_1.AdminRoleGuard),
    (0, swagger_1.ApiOperation)({ summary: 'Remettre en vérification les publications « à traiter » (admin)' }),
    openapi.ApiResponse({ status: 200 }),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, current_user_1.ActingUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], ModeratorsController.prototype, "recheck", null);
__decorate([
    (0, common_1.Post)(':id/retry-members'),
    (0, common_1.HttpCode)(200),
    (0, common_1.UseGuards)(admin_role_guard_1.AdminRoleGuard),
    (0, swagger_1.ApiOperation)({ summary: 'Relancer les adhésions / pré-approbations abandonnées (admin)' }),
    openapi.ApiResponse({ status: 200 }),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, current_user_1.ActingUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], ModeratorsController.prototype, "retryMembers", null);
exports.ModeratorsController = ModeratorsController = __decorate([
    (0, swagger_1.ApiTags)('moderators'),
    (0, common_1.UseGuards)(admin_auth_guard_1.AdminAuthGuard),
    (0, common_1.Controller)('moderators'),
    __metadata("design:paramtypes", [moderators_service_1.ModeratorsService,
        audit_service_1.AuditService,
        members_service_1.MembersService])
], ModeratorsController);
let ModeratorControlController = class ModeratorControlController {
    moderators;
    constructor(moderators) {
        this.moderators = moderators;
    }
    control(dto, acting) {
        return this.moderators.control(dto.profileExternalId, dto.agent, acting);
    }
};
exports.ModeratorControlController = ModeratorControlController;
__decorate([
    (0, common_1.Post)('control'),
    (0, common_1.HttpCode)(200),
    (0, swagger_1.ApiOperation)({ summary: 'Réglages du modérateur et passage demandé (relu chaque minute par l’extension)' }),
    openapi.ApiResponse({ status: 200 }),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, current_user_1.ActingUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [ModeratorControlDto, Object]),
    __metadata("design:returntype", void 0)
], ModeratorControlController.prototype, "control", null);
exports.ModeratorControlController = ModeratorControlController = __decorate([
    (0, swagger_1.ApiTags)('moderators'),
    (0, swagger_1.ApiHeader)({ name: 'X-API-Key', required: true }),
    (0, common_1.UseGuards)(automation_auth_guard_1.AutomationAuthGuard),
    (0, common_1.Controller)('verify'),
    __metadata("design:paramtypes", [moderators_service_1.ModeratorsService])
], ModeratorControlController);
//# sourceMappingURL=moderators.controller.js.map