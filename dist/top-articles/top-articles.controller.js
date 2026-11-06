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
exports.TopArticlesController = void 0;
const openapi = require("@nestjs/swagger");
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const admin_auth_guard_1 = require("../auth/admin-auth.guard");
const admin_role_guard_1 = require("../auth/admin-role.guard");
const current_user_1 = require("../auth/current-user");
const top_articles_service_1 = require("./top-articles.service");
let TopArticlesController = class TopArticlesController {
    top;
    constructor(top) {
        this.top = top;
    }
    list(acting) {
        return this.top.list(acting);
    }
    settings() {
        return this.top.settings();
    }
    updateSettings(body) {
        return this.top.updateSettings(body ?? {});
    }
    regenerate() {
        return this.top.regenerate();
    }
};
exports.TopArticlesController = TopArticlesController;
__decorate([
    (0, common_1.Get)(),
    (0, swagger_1.ApiOperation)({ summary: 'Les 10 articles concurrents du jour (Radar) : les siens, ou ceux de tous pour un admin' }),
    openapi.ApiResponse({ status: 200 }),
    __param(0, (0, current_user_1.ActingUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], TopArticlesController.prototype, "list", null);
__decorate([
    (0, common_1.Get)('settings'),
    (0, common_1.UseGuards)(admin_role_guard_1.AdminRoleGuard),
    (0, swagger_1.ApiOperation)({ summary: 'Réglages : nombre d’articles par jour, gestionnaires qui y ont accès (admin)' }),
    openapi.ApiResponse({ status: 200 }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], TopArticlesController.prototype, "settings", null);
__decorate([
    (0, common_1.Put)('settings'),
    (0, common_1.UseGuards)(admin_role_guard_1.AdminRoleGuard),
    (0, swagger_1.ApiOperation)({ summary: 'Régler le nombre d’articles par jour et les gestionnaires qui y ont accès (admin)' }),
    openapi.ApiResponse({ status: 200 }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], TopArticlesController.prototype, "updateSettings", null);
__decorate([
    (0, common_1.Post)('regenerate'),
    (0, common_1.HttpCode)(200),
    (0, common_1.UseGuards)(admin_role_guard_1.AdminRoleGuard),
    (0, swagger_1.ApiOperation)({ summary: 'Refaire la distribution du jour (admin)' }),
    openapi.ApiResponse({ status: 200 }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], TopArticlesController.prototype, "regenerate", null);
exports.TopArticlesController = TopArticlesController = __decorate([
    (0, swagger_1.ApiTags)('top-articles'),
    (0, common_1.UseGuards)(admin_auth_guard_1.AdminAuthGuard),
    (0, common_1.Controller)('top-articles'),
    __metadata("design:paramtypes", [top_articles_service_1.TopArticlesService])
], TopArticlesController);
//# sourceMappingURL=top-articles.controller.js.map