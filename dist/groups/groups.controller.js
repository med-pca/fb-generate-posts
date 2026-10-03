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
exports.GroupsCatalogController = exports.GroupsController = void 0;
const openapi = require("@nestjs/swagger");
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const admin_auth_guard_1 = require("../auth/admin-auth.guard");
const current_user_1 = require("../auth/current-user");
const create_group_dto_1 = require("./dto/create-group.dto");
const groups_service_1 = require("./groups.service");
const update_group_dto_1 = require("./dto/update-group.dto");
const update_join_status_dto_1 = require("./dto/update-join-status.dto");
const pagination_dto_1 = require("../common/dto/pagination.dto");
let GroupsController = class GroupsController {
    groups;
    constructor(groups) {
        this.groups = groups;
    }
    create(profileId, dto, acting) {
        return this.groups.create(profileId, dto, acting);
    }
    findAll(profileId, acting) {
        return this.groups.findAll(profileId, acting);
    }
    link(profileId, groupId, acting) {
        return this.groups.link(profileId, groupId, acting);
    }
    unlink(profileId, groupId, acting) {
        return this.groups.unlink(profileId, groupId, acting);
    }
    update(groupId, dto, acting) {
        return this.groups.update(groupId, dto, acting);
    }
};
exports.GroupsController = GroupsController;
__decorate([
    (0, common_1.Post)(),
    openapi.ApiResponse({ status: 201, type: Object }),
    __param(0, (0, common_1.Param)('profileId')),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, current_user_1.ActingUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, create_group_dto_1.CreateGroupDto, Object]),
    __metadata("design:returntype", void 0)
], GroupsController.prototype, "create", null);
__decorate([
    (0, common_1.Get)(),
    openapi.ApiResponse({ status: 200 }),
    __param(0, (0, common_1.Param)('profileId')),
    __param(1, (0, current_user_1.ActingUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], GroupsController.prototype, "findAll", null);
__decorate([
    (0, common_1.Post)(':groupId/link'),
    openapi.ApiResponse({ status: 201, type: Object }),
    __param(0, (0, common_1.Param)('profileId')),
    __param(1, (0, common_1.Param)('groupId')),
    __param(2, (0, current_user_1.ActingUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, Object]),
    __metadata("design:returntype", void 0)
], GroupsController.prototype, "link", null);
__decorate([
    (0, common_1.Delete)(':groupId/link'),
    openapi.ApiResponse({ status: 200 }),
    __param(0, (0, common_1.Param)('profileId')),
    __param(1, (0, common_1.Param)('groupId')),
    __param(2, (0, current_user_1.ActingUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, Object]),
    __metadata("design:returntype", void 0)
], GroupsController.prototype, "unlink", null);
__decorate([
    (0, common_1.Patch)(':groupId'),
    openapi.ApiResponse({ status: 200 }),
    __param(0, (0, common_1.Param)('groupId')),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, current_user_1.ActingUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, update_group_dto_1.UpdateGroupDto, Object]),
    __metadata("design:returntype", void 0)
], GroupsController.prototype, "update", null);
exports.GroupsController = GroupsController = __decorate([
    (0, swagger_1.ApiTags)('groups'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.UseGuards)(admin_auth_guard_1.AdminAuthGuard),
    (0, common_1.Controller)('profiles/:profileId/groups'),
    __metadata("design:paramtypes", [groups_service_1.GroupsService])
], GroupsController);
let GroupsCatalogController = class GroupsCatalogController {
    groups;
    constructor(groups) {
        this.groups = groups;
    }
    findAll(pagination, acting) {
        return this.groups.findCatalog(pagination, acting);
    }
    remove(id, acting) {
        return this.groups.remove(id, acting);
    }
    setJoinStatus(id, profileId, dto, acting) {
        return this.groups.setJoinStatus(id, profileId, dto.joinStatus, acting);
    }
    removePosts(id, dryRun, acting) {
        return this.groups.removePosts(id, acting, dryRun === 'true');
    }
    update(id, dto, acting) {
        return this.groups.update(id, dto, acting);
    }
};
exports.GroupsCatalogController = GroupsCatalogController;
__decorate([
    (0, common_1.Get)(),
    openapi.ApiResponse({ status: 200 }),
    __param(0, (0, common_1.Query)()),
    __param(1, (0, current_user_1.ActingUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [pagination_dto_1.PaginationDto, Object]),
    __metadata("design:returntype", void 0)
], GroupsCatalogController.prototype, "findAll", null);
__decorate([
    (0, common_1.Delete)(':id'),
    openapi.ApiResponse({ status: 200 }),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, current_user_1.ActingUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], GroupsCatalogController.prototype, "remove", null);
__decorate([
    (0, common_1.Patch)(':id/profiles/:profileId/join-status'),
    (0, swagger_1.ApiOperation)({
        summary: 'Corriger à la main l’adhésion d’un profil à un groupe',
        description: 'Quand un profil a rejoint le groupe sans que l’extension le remonte ' +
            '(demande acceptée plus tard, adhésion faite à la main). Seul un profil ' +
            '« Rejoint » peut publier dans le groupe.',
    }),
    openapi.ApiResponse({ status: 200 }),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Param)('profileId')),
    __param(2, (0, common_1.Body)()),
    __param(3, (0, current_user_1.ActingUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, update_join_status_dto_1.SetJoinStatusDto, Object]),
    __metadata("design:returntype", void 0)
], GroupsCatalogController.prototype, "setJoinStatus", null);
__decorate([
    openapi.ApiQuery({ name: "dryRun", required: false }),
    (0, common_1.Delete)(':id/posts'),
    (0, swagger_1.ApiOperation)({
        summary: 'Retirer de ce groupe les posts qui y attendent',
        description: 'Seule la cible de ce groupe part : un post qui vise aussi d’autres ' +
            'groupes y reste, un post qui ne visait que celui-ci est supprimé. Les ' +
            'publications faites ou en cours sont conservées. `dryRun=true` compte ' +
            'sans rien toucher.',
    }),
    openapi.ApiResponse({ status: 200 }),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Query)('dryRun')),
    __param(2, (0, current_user_1.ActingUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", void 0)
], GroupsCatalogController.prototype, "removePosts", null);
__decorate([
    (0, common_1.Patch)(':id'),
    openapi.ApiResponse({ status: 200 }),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, current_user_1.ActingUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, update_group_dto_1.UpdateGroupDto, Object]),
    __metadata("design:returntype", void 0)
], GroupsCatalogController.prototype, "update", null);
exports.GroupsCatalogController = GroupsCatalogController = __decorate([
    (0, swagger_1.ApiTags)('groups'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.UseGuards)(admin_auth_guard_1.AdminAuthGuard),
    (0, common_1.Controller)('groups'),
    __metadata("design:paramtypes", [groups_service_1.GroupsService])
], GroupsCatalogController);
//# sourceMappingURL=groups.controller.js.map