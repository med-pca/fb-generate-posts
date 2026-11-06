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
exports.ExtensionsController = void 0;
const openapi = require("@nestjs/swagger");
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const admin_auth_guard_1 = require("../auth/admin-auth.guard");
const admin_role_guard_1 = require("../auth/admin-role.guard");
const current_user_1 = require("../auth/current-user");
const cookies_1 = require("../auth/cookies");
const extensions_service_1 = require("./extensions.service");
let ExtensionsController = class ExtensionsController {
    extensions;
    constructor(extensions) {
        this.extensions = extensions;
    }
    list() {
        return this.extensions.list();
    }
    async download(key, version, preset, acting, request, reply) {
        const host = String(request.headers['x-forwarded-host'] || request.headers.host || '').split(',')[0].trim();
        const origin = `${(0, cookies_1.isSecure)(request.headers) ? 'https' : 'http'}://${host}`;
        const { fileName, zip } = await this.extensions.download(key, version, { preset: preset === '1' || preset === 'true', origin }, acting);
        return reply
            .header('content-type', 'application/zip')
            .header('content-disposition', `attachment; filename="${fileName}"`)
            .header('cache-control', 'no-store')
            .send(zip);
    }
    sync() {
        return this.extensions.syncAll();
    }
    pin(key, body, acting) {
        return this.extensions.pin(key, body?.version ?? null, acting);
    }
};
exports.ExtensionsController = ExtensionsController;
__decorate([
    (0, common_1.Get)(),
    (0, swagger_1.ApiOperation)({ summary: 'Nos extensions : version courante et historique de toutes les versions' }),
    openapi.ApiResponse({ status: 200 }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], ExtensionsController.prototype, "list", null);
__decorate([
    openapi.ApiQuery({ name: "preset", required: false }),
    (0, common_1.Get)(':key/:version/download'),
    (0, swagger_1.ApiOperation)({ summary: 'Télécharger une version (préconfigurée avec la clé du compte si ?preset=1)' }),
    openapi.ApiResponse({ status: 200 }),
    __param(0, (0, common_1.Param)('key')),
    __param(1, (0, common_1.Param)('version')),
    __param(2, (0, common_1.Query)('preset')),
    __param(3, (0, current_user_1.ActingUser)()),
    __param(4, (0, common_1.Req)()),
    __param(5, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, Object, Object, Object, Object]),
    __metadata("design:returntype", Promise)
], ExtensionsController.prototype, "download", null);
__decorate([
    (0, common_1.Post)('sync'),
    (0, common_1.HttpCode)(200),
    (0, common_1.UseGuards)(admin_role_guard_1.AdminRoleGuard),
    (0, swagger_1.ApiOperation)({ summary: 'Relire le dossier extension/ et enregistrer les nouvelles versions (admin)' }),
    openapi.ApiResponse({ status: 200, type: [String] }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], ExtensionsController.prototype, "sync", null);
__decorate([
    (0, common_1.Post)(':key/pin'),
    (0, common_1.HttpCode)(200),
    (0, common_1.UseGuards)(admin_role_guard_1.AdminRoleGuard),
    (0, swagger_1.ApiOperation)({ summary: 'Revenir à une version (ou { version: null } pour suivre la plus récente) (admin)' }),
    openapi.ApiResponse({ status: 200 }),
    __param(0, (0, common_1.Param)('key')),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, current_user_1.ActingUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", void 0)
], ExtensionsController.prototype, "pin", null);
exports.ExtensionsController = ExtensionsController = __decorate([
    (0, swagger_1.ApiTags)('extensions'),
    (0, common_1.UseGuards)(admin_auth_guard_1.AdminAuthGuard),
    (0, common_1.Controller)('extensions'),
    __metadata("design:paramtypes", [extensions_service_1.ExtensionsService])
], ExtensionsController);
//# sourceMappingURL=extensions.controller.js.map