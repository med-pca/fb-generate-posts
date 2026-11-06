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
exports.LanguagesController = exports.UpdateLanguageDto = exports.CreateLanguageDto = void 0;
const openapi = require("@nestjs/swagger");
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const class_validator_1 = require("class-validator");
const admin_auth_guard_1 = require("../auth/admin-auth.guard");
const admin_role_guard_1 = require("../auth/admin-role.guard");
const current_user_1 = require("../auth/current-user");
const languages_service_1 = require("./languages.service");
class CreateLanguageDto {
    code;
    name;
}
exports.CreateLanguageDto = CreateLanguageDto;
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: 'sv' }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsNotEmpty)(),
    __metadata("design:type", String)
], CreateLanguageDto.prototype, "code", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: 'Swedish' }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsNotEmpty)(),
    __metadata("design:type", String)
], CreateLanguageDto.prototype, "name", void 0);
class UpdateLanguageDto {
    code;
    name;
}
exports.UpdateLanguageDto = UpdateLanguageDto;
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsNotEmpty)(),
    __metadata("design:type", String)
], UpdateLanguageDto.prototype, "code", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsNotEmpty)(),
    __metadata("design:type", String)
], UpdateLanguageDto.prototype, "name", void 0);
let LanguagesController = class LanguagesController {
    languages;
    constructor(languages) {
        this.languages = languages;
    }
    list() {
        return this.languages.list();
    }
    create(dto, acting) {
        return this.languages.create(dto, acting);
    }
    update(code, dto, acting) {
        return this.languages.update(code, dto, acting);
    }
    remove(code, detach, acting) {
        return this.languages.remove(code, detach === 'true', acting);
    }
};
exports.LanguagesController = LanguagesController;
__decorate([
    (0, common_1.Get)(),
    (0, swagger_1.ApiOperation)({ summary: 'Les langues (code ISO + nom en anglais), avec leur usage' }),
    openapi.ApiResponse({ status: 200 }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], LanguagesController.prototype, "list", null);
__decorate([
    (0, common_1.Post)(),
    (0, common_1.UseGuards)(admin_role_guard_1.AdminRoleGuard),
    (0, swagger_1.ApiOperation)({ summary: 'Ajouter une langue' }),
    openapi.ApiResponse({ status: 201 }),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, current_user_1.ActingUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [CreateLanguageDto, Object]),
    __metadata("design:returntype", void 0)
], LanguagesController.prototype, "create", null);
__decorate([
    (0, common_1.Patch)(':code'),
    (0, common_1.UseGuards)(admin_role_guard_1.AdminRoleGuard),
    (0, swagger_1.ApiOperation)({ summary: 'Renommer une langue ou changer son code (les groupes suivent)' }),
    openapi.ApiResponse({ status: 200 }),
    __param(0, (0, common_1.Param)('code')),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, current_user_1.ActingUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, UpdateLanguageDto, Object]),
    __metadata("design:returntype", void 0)
], LanguagesController.prototype, "update", null);
__decorate([
    openapi.ApiQuery({ name: "detach", required: false }),
    (0, common_1.Delete)(':code'),
    (0, common_1.UseGuards)(admin_role_guard_1.AdminRoleGuard),
    (0, swagger_1.ApiOperation)({ summary: 'Supprimer une langue (refusé si utilisée, sauf ?detach=true)' }),
    openapi.ApiResponse({ status: 200 }),
    __param(0, (0, common_1.Param)('code')),
    __param(1, (0, common_1.Query)('detach')),
    __param(2, (0, current_user_1.ActingUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", void 0)
], LanguagesController.prototype, "remove", null);
exports.LanguagesController = LanguagesController = __decorate([
    (0, swagger_1.ApiTags)('languages'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.UseGuards)(admin_auth_guard_1.AdminAuthGuard),
    (0, common_1.Controller)('languages'),
    __metadata("design:paramtypes", [languages_service_1.LanguagesService])
], LanguagesController);
//# sourceMappingURL=languages.controller.js.map