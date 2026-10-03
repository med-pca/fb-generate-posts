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
exports.UpdateSiteDto = exports.CreateSiteDto = void 0;
const openapi = require("@nestjs/swagger");
const swagger_1 = require("@nestjs/swagger");
const client_1 = require("@prisma/client");
const class_validator_1 = require("class-validator");
class CreateSiteDto {
    name;
    originUrl;
    depositKey;
    status;
    categoryId;
    static _OPENAPI_METADATA_FACTORY() {
        return { name: { required: true, type: () => String, maxLength: 200 }, originUrl: { required: true, type: () => String, maxLength: 2000, format: "uri" }, depositKey: { required: false, type: () => String, maxLength: 500 }, status: { required: false, enum: ["ACTIVE", "INACTIVE"] }, categoryId: { required: false, type: () => String, maxLength: 40 } };
    }
}
exports.CreateSiteDto = CreateSiteDto;
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'Tera Nordiskmat' }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsNotEmpty)(),
    (0, class_validator_1.MaxLength)(200),
    __metadata("design:type", String)
], CreateSiteDto.prototype, "name", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'https://tera.nordiskmat.com' }),
    (0, class_validator_1.IsUrl)({ protocols: ['https'], require_protocol: true }),
    (0, class_validator_1.MaxLength)(2000),
    __metadata("design:type", String)
], CreateSiteDto.prototype, "originUrl", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: 'Clé du plugin de ce site. Laissée vide, la clé globale ' +
            'WORDPRESS_API_KEY sert. Vide à la modification : la clé en place est ' +
            'conservée.',
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(500),
    __metadata("design:type", String)
], CreateSiteDto.prototype, "depositKey", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ enum: client_1.RecordStatus }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsEnum)(client_1.RecordStatus),
    __metadata("design:type", String)
], CreateSiteDto.prototype, "status", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: 'Ses articles partent vers les groupes de cette catégorie. Chaîne vide = aucune.',
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(40),
    __metadata("design:type", String)
], CreateSiteDto.prototype, "categoryId", void 0);
class UpdateSiteDto extends (0, swagger_1.PartialType)(CreateSiteDto) {
    ownerId;
    static _OPENAPI_METADATA_FACTORY() {
        return { ownerId: { required: false, type: () => String, maxLength: 40 } };
    }
}
exports.UpdateSiteDto = UpdateSiteDto;
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: 'Réattribuer le site à un autre compte. Chaîne vide : plus de ' +
            'propriétaire, donc réservé aux administrateurs.',
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(40),
    __metadata("design:type", String)
], UpdateSiteDto.prototype, "ownerId", void 0);
//# sourceMappingURL=site.dto.js.map