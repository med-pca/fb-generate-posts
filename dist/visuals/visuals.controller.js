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
exports.VisualsController = exports.VisualQueryDto = exports.UpdateVisualDto = exports.VisualPostsDto = exports.UploadVisualDto = void 0;
const openapi = require("@nestjs/swagger");
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const class_transformer_1 = require("class-transformer");
const class_validator_1 = require("class-validator");
const admin_auth_guard_1 = require("../auth/admin-auth.guard");
const current_user_1 = require("../auth/current-user");
const languages_registry_1 = require("../languages/languages.registry");
const visuals_service_1 = require("./visuals.service");
class UploadVisualDto {
    imageData;
    mimeType;
    title;
    caption;
    language;
    categoryId;
    groupIds;
    translate;
    createPosts;
}
exports.UploadVisualDto = UploadVisualDto;
__decorate([
    (0, swagger_1.ApiProperty)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsNotEmpty)(),
    (0, class_validator_1.MaxLength)(14_000_000),
    __metadata("design:type", String)
], UploadVisualDto.prototype, "imageData", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'image/jpeg' }),
    (0, class_validator_1.IsIn)(['image/jpeg', 'image/png', 'image/webp', 'image/gif']),
    __metadata("design:type", String)
], UploadVisualDto.prototype, "mimeType", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(200),
    __metadata("design:type", String)
], UploadVisualDto.prototype, "title", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(3000),
    __metadata("design:type", String)
], UploadVisualDto.prototype, "caption", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: 'fr' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.ValidateIf)((_d, v) => v !== null),
    (0, languages_registry_1.IsKnownLanguage)(),
    __metadata("design:type", Object)
], UploadVisualDto.prototype, "language", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], UploadVisualDto.prototype, "categoryId", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ type: [String] }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsArray)(),
    (0, class_validator_1.ArrayMaxSize)(500),
    (0, class_validator_1.IsString)({ each: true }),
    __metadata("design:type", Array)
], UploadVisualDto.prototype, "groupIds", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ default: false }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsBoolean)(),
    __metadata("design:type", Boolean)
], UploadVisualDto.prototype, "translate", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ default: true }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsBoolean)(),
    __metadata("design:type", Boolean)
], UploadVisualDto.prototype, "createPosts", void 0);
class VisualPostsDto {
    groupIds;
}
exports.VisualPostsDto = VisualPostsDto;
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ type: [String] }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsArray)(),
    (0, class_validator_1.ArrayMaxSize)(500),
    (0, class_validator_1.IsString)({ each: true }),
    __metadata("design:type", Array)
], VisualPostsDto.prototype, "groupIds", void 0);
class UpdateVisualDto {
    title;
    caption;
    status;
    language;
}
exports.UpdateVisualDto = UpdateVisualDto;
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(200),
    __metadata("design:type", String)
], UpdateVisualDto.prototype, "title", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(3000),
    __metadata("design:type", String)
], UpdateVisualDto.prototype, "caption", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ enum: ['ACTIVE', 'INACTIVE'] }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsIn)(['ACTIVE', 'INACTIVE']),
    __metadata("design:type", String)
], UpdateVisualDto.prototype, "status", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.ValidateIf)((_d, v) => v !== null),
    (0, languages_registry_1.IsKnownLanguage)(),
    __metadata("design:type", Object)
], UpdateVisualDto.prototype, "language", void 0);
class VisualQueryDto {
    page;
    limit;
    language;
    search;
    review;
}
exports.VisualQueryDto = VisualQueryDto;
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_transformer_1.Type)(() => Number),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(1),
    __metadata("design:type", Number)
], VisualQueryDto.prototype, "page", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_transformer_1.Type)(() => Number),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(1),
    __metadata("design:type", Number)
], VisualQueryDto.prototype, "limit", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.Matches)(/^[a-z]{2}$/),
    __metadata("design:type", String)
], VisualQueryDto.prototype, "language", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(200),
    __metadata("design:type", String)
], VisualQueryDto.prototype, "search", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ enum: ['pending', 'approved'] }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsIn)(['pending', 'approved']),
    __metadata("design:type", String)
], VisualQueryDto.prototype, "review", void 0);
let VisualsController = class VisualsController {
    visuals;
    constructor(visuals) {
        this.visuals = visuals;
    }
    list(q, acting) {
        return this.visuals.list(q, acting);
    }
    upload(dto, acting) {
        return this.visuals.create({
            image: { data: dto.imageData.replace(/^data:[^;]+;base64,/, ''), mimeType: dto.mimeType },
            language: dto.language ?? null,
            translate: Boolean(dto.translate),
            caption: dto.caption,
            title: dto.title,
            categoryId: dto.categoryId ?? null,
            groupIds: dto.groupIds,
            createPosts: dto.createPosts !== false,
            origin: 'upload',
        }, acting);
    }
    posts(id, dto, acting) {
        return this.visuals.createPosts(id, dto, acting);
    }
    approve(id, acting) {
        return this.visuals.approve(id, acting);
    }
    update(id, dto, acting) {
        return this.visuals.update(id, dto, acting);
    }
    remove(id, acting) {
        return this.visuals.remove(id, acting);
    }
};
exports.VisualsController = VisualsController;
__decorate([
    (0, common_1.Get)(),
    openapi.ApiResponse({ status: 200 }),
    __param(0, (0, common_1.Query)()),
    __param(1, (0, current_user_1.ActingUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [VisualQueryDto, Object]),
    __metadata("design:returntype", void 0)
], VisualsController.prototype, "list", null);
__decorate([
    (0, common_1.Post)(),
    (0, swagger_1.ApiOperation)({ summary: 'Importer notre propre image : traduction de son texte et description par l’IA au choix, post vers les groupes' }),
    openapi.ApiResponse({ status: 201 }),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, current_user_1.ActingUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [UploadVisualDto, Object]),
    __metadata("design:returntype", void 0)
], VisualsController.prototype, "upload", null);
__decorate([
    (0, common_1.Post)(':id/posts'),
    (0, swagger_1.ApiOperation)({ summary: 'Créer les posts d’un visuel vers les groupes (choisis, ou de sa langue et sa catégorie)' }),
    openapi.ApiResponse({ status: 201 }),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, current_user_1.ActingUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, VisualPostsDto, Object]),
    __metadata("design:returntype", void 0)
], VisualsController.prototype, "posts", null);
__decorate([
    (0, common_1.Post)(':id/approve'),
    (0, swagger_1.ApiOperation)({ summary: 'Valider une capture en attente : ses posts partent vers les groupes' }),
    openapi.ApiResponse({ status: 201 }),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, current_user_1.ActingUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], VisualsController.prototype, "approve", null);
__decorate([
    (0, common_1.Patch)(':id'),
    openapi.ApiResponse({ status: 200 }),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, current_user_1.ActingUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, UpdateVisualDto, Object]),
    __metadata("design:returntype", void 0)
], VisualsController.prototype, "update", null);
__decorate([
    (0, common_1.Delete)(':id'),
    openapi.ApiResponse({ status: 200 }),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, current_user_1.ActingUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], VisualsController.prototype, "remove", null);
exports.VisualsController = VisualsController = __decorate([
    (0, swagger_1.ApiTags)('visuals'),
    (0, common_1.UseGuards)(admin_auth_guard_1.AdminAuthGuard),
    (0, common_1.Controller)('visuals'),
    __metadata("design:paramtypes", [visuals_service_1.VisualsService])
], VisualsController);
//# sourceMappingURL=visuals.controller.js.map