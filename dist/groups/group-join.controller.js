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
exports.GroupJoinController = void 0;
const openapi = require("@nestjs/swagger");
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const client_1 = require("@prisma/client");
const automation_auth_guard_1 = require("../auth/automation-auth.guard");
const update_join_status_dto_1 = require("./dto/update-join-status.dto");
const groups_service_1 = require("./groups.service");
let GroupJoinController = class GroupJoinController {
    groups;
    constructor(groups) {
        this.groups = groups;
    }
    list(profileExternalId, status) {
        const statuses = status === 'all'
            ? undefined
            : (status || 'NOT_JOINED,FAILED')
                .split(',')
                .map((s) => s.trim().toUpperCase())
                .filter((s) => s in client_1.JoinStatus);
        return this.groups.findForJoin(profileExternalId, statuses);
    }
    updateStatus(profileExternalId, groupId, dto) {
        return this.groups.updateJoinStatus(profileExternalId, groupId, dto);
    }
};
exports.GroupJoinController = GroupJoinController;
__decorate([
    (0, common_1.Get)(),
    (0, swagger_1.ApiOperation)({
        summary: 'Groupes liés au profil, avec leur statut d’adhésion',
        description: 'Utilisé par l’extension navigateur. Par défaut, seuls les groupes ' +
            'NOT_JOINED et FAILED sont rendus : ceux qu’il reste à rejoindre.',
    }),
    (0, swagger_1.ApiParam)({ name: 'profileExternalId', example: 'demo-profile' }),
    (0, swagger_1.ApiQuery)({
        name: 'status',
        required: false,
        description: 'Liste séparée par des virgules, ou "all"',
        example: 'NOT_JOINED,FAILED',
    }),
    openapi.ApiResponse({ status: 200 }),
    __param(0, (0, common_1.Param)('profileExternalId')),
    __param(1, (0, common_1.Query)('status')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", void 0)
], GroupJoinController.prototype, "list", null);
__decorate([
    (0, common_1.Post)(':groupId/join-status'),
    (0, swagger_1.ApiOperation)({
        summary: 'Enregistrer le résultat d’une tentative d’adhésion',
    }),
    openapi.ApiResponse({ status: 201 }),
    __param(0, (0, common_1.Param)('profileExternalId')),
    __param(1, (0, common_1.Param)('groupId')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, update_join_status_dto_1.UpdateJoinStatusDto]),
    __metadata("design:returntype", void 0)
], GroupJoinController.prototype, "updateStatus", null);
exports.GroupJoinController = GroupJoinController = __decorate([
    (0, swagger_1.ApiTags)('groups'),
    (0, swagger_1.ApiHeader)({ name: 'X-API-Key', required: true }),
    (0, common_1.UseGuards)(automation_auth_guard_1.AutomationAuthGuard),
    (0, common_1.Controller)('join/profiles/:profileExternalId/groups'),
    __metadata("design:paramtypes", [groups_service_1.GroupsService])
], GroupJoinController);
//# sourceMappingURL=group-join.controller.js.map