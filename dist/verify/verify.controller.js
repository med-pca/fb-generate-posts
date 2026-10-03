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
exports.AdminVerifyController = exports.VerifyController = void 0;
const openapi = require("@nestjs/swagger");
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const automation_auth_guard_1 = require("../auth/automation-auth.guard");
const admin_auth_guard_1 = require("../auth/admin-auth.guard");
const current_user_1 = require("../auth/current-user");
const verify_dto_1 = require("./dto/verify.dto");
const verify_service_1 = require("./verify.service");
const members_service_1 = require("./members.service");
let VerifyController = class VerifyController {
    verify;
    members;
    constructor(verify, members) {
        this.verify = verify;
        this.members = members;
    }
    claimMembers(dto, acting) {
        return this.members.claim(dto.profileExternalId, dto.limit ?? 5, acting);
    }
    memberResult(taskId, dto, acting) {
        return this.members.report(taskId, dto, acting);
    }
    claim(dto, acting) {
        return this.verify.claim(dto.profileExternalId, dto.limit ?? 5, acting);
    }
    result(targetId, dto, acting) {
        return this.verify.report(targetId, dto, acting);
    }
};
exports.VerifyController = VerifyController;
__decorate([
    (0, common_1.Post)('members/claim'),
    (0, common_1.HttpCode)(200),
    (0, swagger_1.ApiOperation)({
        summary: 'Réserver les adhésions à accepter et les profils à pré-approuver',
        description: 'Uniquement NOS profils, désignés par leur identifiant Facebook numérique. ' +
            'Le vérificateur doit être admin ou modérateur des groupes.',
    }),
    openapi.ApiResponse({ status: 200 }),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, current_user_1.ActingUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [verify_dto_1.VerifyClaimDto, Object]),
    __metadata("design:returntype", void 0)
], VerifyController.prototype, "claimMembers", null);
__decorate([
    (0, common_1.Post)('members/:taskId/result'),
    (0, common_1.HttpCode)(200),
    (0, swagger_1.ApiOperation)({ summary: 'Rapporter une adhésion acceptée / une pré-approbation' }),
    openapi.ApiResponse({ status: 200 }),
    __param(0, (0, common_1.Param)('taskId')),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, current_user_1.ActingUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, verify_dto_1.MemberResultDto, Object]),
    __metadata("design:returntype", void 0)
], VerifyController.prototype, "memberResult", null);
__decorate([
    (0, common_1.Post)('claim'),
    (0, common_1.HttpCode)(200),
    (0, swagger_1.ApiOperation)({
        summary: 'Réserver des publications à vérifier',
        description: 'Publiées depuis au moins VERIFY_AFTER_MINUTES (30 min par défaut), ' +
            'pas encore vérifiées. Réservées 20 min pour ce vérificateur.',
    }),
    openapi.ApiResponse({ status: 200 }),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, current_user_1.ActingUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [verify_dto_1.VerifyClaimDto, Object]),
    __metadata("design:returntype", void 0)
], VerifyController.prototype, "claim", null);
__decorate([
    (0, common_1.Post)(':targetId/result'),
    (0, common_1.HttpCode)(200),
    (0, swagger_1.ApiOperation)({
        summary: 'Rapporter ce que le vérificateur a vu',
        description: 'ok → vérifié ; missing_post → republié ; missing_link + deleted → ' +
            'republié, sans deleted → à traiter ; pending / unreachable → plus tard.',
    }),
    openapi.ApiResponse({ status: 200 }),
    __param(0, (0, common_1.Param)('targetId')),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, current_user_1.ActingUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, verify_dto_1.VerifyResultDto, Object]),
    __metadata("design:returntype", void 0)
], VerifyController.prototype, "result", null);
exports.VerifyController = VerifyController = __decorate([
    (0, swagger_1.ApiTags)('verify'),
    (0, swagger_1.ApiHeader)({ name: 'X-API-Key', required: true }),
    (0, common_1.UseGuards)(automation_auth_guard_1.AutomationAuthGuard),
    (0, common_1.Controller)('verify'),
    __metadata("design:paramtypes", [verify_service_1.VerifyService,
        members_service_1.MembersService])
], VerifyController);
let AdminVerifyController = class AdminVerifyController {
    verify;
    members;
    constructor(verify, members) {
        this.verify = verify;
        this.members = members;
    }
    async overview(acting) {
        const [stats, review, members] = await Promise.all([
            this.verify.stats(acting),
            this.verify.review(acting),
            this.members.overview(acting),
        ]);
        return { ...stats, review, members };
    }
    moderator(profileId, dto, acting) {
        return this.verify.setModerator(profileId, dto, acting);
    }
    retryMember(taskId, acting) {
        return this.members.retry(taskId, acting);
    }
    resolve(targetId, dto, acting) {
        return this.verify.resolve(targetId, dto.action, acting);
    }
};
exports.AdminVerifyController = AdminVerifyController;
__decorate([
    (0, common_1.Get)(),
    (0, swagger_1.ApiOperation)({ summary: 'Bilan de la vérification et publications à traiter' }),
    openapi.ApiResponse({ status: 200 }),
    __param(0, (0, current_user_1.ActingUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], AdminVerifyController.prototype, "overview", null);
__decorate([
    (0, common_1.Patch)('profiles/:profileId'),
    (0, swagger_1.ApiOperation)({ summary: 'Désigner (ou non) un profil vérificateur' }),
    openapi.ApiResponse({ status: 200 }),
    __param(0, (0, common_1.Param)('profileId')),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, current_user_1.ActingUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, verify_dto_1.ModeratorDto, Object]),
    __metadata("design:returntype", void 0)
], AdminVerifyController.prototype, "moderator", null);
__decorate([
    (0, common_1.Post)('members/:taskId/retry'),
    (0, common_1.HttpCode)(200),
    (0, swagger_1.ApiOperation)({ summary: 'Relancer une adhésion / pré-approbation abandonnée' }),
    openapi.ApiResponse({ status: 200 }),
    __param(0, (0, common_1.Param)('taskId')),
    __param(1, (0, current_user_1.ActingUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], AdminVerifyController.prototype, "retryMember", null);
__decorate([
    (0, common_1.Post)('targets/:targetId/resolve'),
    (0, common_1.HttpCode)(200),
    (0, swagger_1.ApiOperation)({ summary: 'Trancher une publication à traiter : ok ou republier' }),
    openapi.ApiResponse({ status: 200 }),
    __param(0, (0, common_1.Param)('targetId')),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, current_user_1.ActingUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, verify_dto_1.ResolveDto, Object]),
    __metadata("design:returntype", void 0)
], AdminVerifyController.prototype, "resolve", null);
exports.AdminVerifyController = AdminVerifyController = __decorate([
    (0, swagger_1.ApiTags)('verify'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.UseGuards)(admin_auth_guard_1.AdminAuthGuard),
    (0, common_1.Controller)('admin/verify'),
    __metadata("design:paramtypes", [verify_service_1.VerifyService,
        members_service_1.MembersService])
], AdminVerifyController);
//# sourceMappingURL=verify.controller.js.map