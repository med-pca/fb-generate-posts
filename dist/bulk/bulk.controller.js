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
exports.BulkController = void 0;
const openapi = require("@nestjs/swagger");
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const admin_auth_guard_1 = require("../auth/admin-auth.guard");
const current_user_1 = require("../auth/current-user");
const bulk_dto_1 = require("./bulk.dto");
const bulk_service_1 = require("./bulk.service");
let BulkController = class BulkController {
    bulk;
    constructor(bulk) {
        this.bulk = bulk;
    }
    groups(query, acting) {
        return this.bulk.groupOptions(query, acting);
    }
    profiles(query, acting) {
        return this.bulk.profileOptions(query, acting);
    }
    link(dto, acting) {
        return this.bulk.link(dto, acting);
    }
    memberships(dto, acting) {
        return this.bulk.memberships(dto, acting);
    }
    share(dto, acting) {
        return this.bulk.share(dto, acting);
    }
};
exports.BulkController = BulkController;
__decorate([
    (0, common_1.Get)('groups'),
    (0, swagger_1.ApiOperation)({ summary: 'Tous les groupes visibles (léger), pour cocher en masse' }),
    openapi.ApiResponse({ status: 200 }),
    __param(0, (0, common_1.Query)()),
    __param(1, (0, current_user_1.ActingUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [bulk_dto_1.OptionsQueryDto, Object]),
    __metadata("design:returntype", void 0)
], BulkController.prototype, "groups", null);
__decorate([
    (0, common_1.Get)('profiles'),
    (0, swagger_1.ApiOperation)({ summary: 'Tous les profils visibles (léger), pour cocher en masse' }),
    openapi.ApiResponse({ status: 200, type: Object }),
    __param(0, (0, common_1.Query)()),
    __param(1, (0, current_user_1.ActingUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [bulk_dto_1.OptionsQueryDto, Object]),
    __metadata("design:returntype", void 0)
], BulkController.prototype, "profiles", null);
__decorate([
    (0, common_1.Post)('link'),
    (0, common_1.HttpCode)(200),
    (0, swagger_1.ApiOperation)({ summary: 'Lier ou délier plusieurs profils à plusieurs groupes' }),
    openapi.ApiResponse({ status: 200 }),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, current_user_1.ActingUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [bulk_dto_1.BulkLinkDto, Object]),
    __metadata("design:returntype", void 0)
], BulkController.prototype, "link", null);
__decorate([
    (0, common_1.Post)('memberships'),
    (0, common_1.HttpCode)(200),
    (0, swagger_1.ApiOperation)({ summary: 'Marquer à la main l’adhésion et/ou la pré-approbation de plusieurs profils dans plusieurs groupes' }),
    openapi.ApiResponse({ status: 200 }),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, current_user_1.ActingUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [bulk_dto_1.BulkMembershipDto, Object]),
    __metadata("design:returntype", void 0)
], BulkController.prototype, "memberships", null);
__decorate([
    (0, common_1.Post)('share'),
    (0, common_1.HttpCode)(200),
    (0, swagger_1.ApiOperation)({ summary: 'Partager ou retirer plusieurs groupes / sites avec plusieurs comptes' }),
    openapi.ApiResponse({ status: 200 }),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, current_user_1.ActingUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [bulk_dto_1.BulkShareDto, Object]),
    __metadata("design:returntype", void 0)
], BulkController.prototype, "share", null);
exports.BulkController = BulkController = __decorate([
    (0, swagger_1.ApiTags)('bulk'),
    (0, common_1.UseGuards)(admin_auth_guard_1.AdminAuthGuard),
    (0, common_1.Controller)('bulk'),
    __metadata("design:paramtypes", [bulk_service_1.BulkService])
], BulkController);
//# sourceMappingURL=bulk.controller.js.map