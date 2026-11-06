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
Object.defineProperty(exports, "__esModule", { value: true });
exports.CreateIngestDto = void 0;
const openapi = require("@nestjs/swagger");
const swagger_1 = require("@nestjs/swagger");
const class_validator_1 = require("class-validator");
const languages_registry_1 = require("../../languages/languages.registry");
const FACEBOOK_HOST = /^https:\/\/([a-z0-9-]+\.)*(facebook\.com|fb\.com|fb\.watch)\//i;
class CreateIngestDto {
    facebookUrl;
    mode;
    targetLanguage;
    translateImage;
    targetCategoryId;
    sourceUrl;
    siteUrl;
    language = 'auto';
    profileIds;
    groupIds;
    static _OPENAPI_METADATA_FACTORY() {
        return { facebookUrl: { required: true, type: () => String, maxLength: 2000, format: "uri" }, mode: { required: false, enum: ["news", "rewrite", "engagement"], enum: ['rewrite', 'news', 'engagement'] }, targetLanguage: { required: false, type: () => String }, translateImage: { required: false, type: () => Boolean }, targetCategoryId: { required: false, type: () => String, maxLength: 60 }, sourceUrl: { required: false, type: () => String, maxLength: 2000, format: "uri" }, siteUrl: { required: false, type: () => String, maxLength: 2000, format: "uri" }, language: { required: true, type: () => Object, default: "auto", minLength: 2, maxLength: 10 }, profileIds: { required: false, type: () => [String] }, groupIds: { required: false, type: () => [String] } };
    }
}
exports.CreateIngestDto = CreateIngestDto;
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'https://www.facebook.com/exemple/posts/123' }),
    (0, class_validator_1.IsUrl)({ protocols: ['https'], require_protocol: true }),
    (0, class_validator_1.MaxLength)(2000),
    (0, class_validator_1.Matches)(FACEBOOK_HOST, {
        message: 'facebookUrl doit pointer vers une publication Facebook',
    }),
    __metadata("design:type", String)
], CreateIngestDto.prototype, "facebookUrl", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ enum: ['rewrite', 'news', 'engagement'], default: 'rewrite' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsIn)(['rewrite', 'news', 'engagement']),
    __metadata("design:type", String)
], CreateIngestDto.prototype, "mode", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: 'fr' }),
    (0, class_validator_1.ValidateIf)((dto) => dto.mode === 'engagement'),
    (0, languages_registry_1.IsKnownLanguage)(),
    __metadata("design:type", String)
], CreateIngestDto.prototype, "targetLanguage", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ default: true }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsBoolean)(),
    __metadata("design:type", Boolean)
], CreateIngestDto.prototype, "translateImage", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: 'all' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(60),
    __metadata("design:type", String)
], CreateIngestDto.prototype, "targetCategoryId", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: 'https://exemple.com/article', description: 'Obligatoire, sauf en mode « news »' }),
    (0, class_validator_1.ValidateIf)((dto) => (dto.mode !== 'news' && dto.mode !== 'engagement') || Boolean(dto.sourceUrl)),
    (0, class_validator_1.IsUrl)({ protocols: ['https'], require_protocol: true }),
    (0, class_validator_1.MaxLength)(2000),
    __metadata("design:type", String)
], CreateIngestDto.prototype, "sourceUrl", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: 'Site WordPress de destination. Défaut : WORDPRESS_SITE_URL.',
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsUrl)({ protocols: ['https'], require_protocol: true }),
    (0, class_validator_1.MaxLength)(2000),
    __metadata("design:type", String)
], CreateIngestDto.prototype, "siteUrl", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        default: 'auto',
        description: '« auto » garde la langue de la page source. Une langue imposée fait ' +
            'traduire l’article au passage.',
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.Length)(2, 10),
    __metadata("design:type", Object)
], CreateIngestDto.prototype, "language", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        type: [String],
        description: 'Vide : tous les profils actifs.',
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsArray)(),
    (0, class_validator_1.IsString)({ each: true }),
    __metadata("design:type", Array)
], CreateIngestDto.prototype, "profileIds", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        type: [String],
        description: 'Vide : tous les groupes actifs des profils retenus.',
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsArray)(),
    (0, class_validator_1.IsString)({ each: true }),
    __metadata("design:type", Array)
], CreateIngestDto.prototype, "groupIds", void 0);
//# sourceMappingURL=create-ingest.dto.js.map