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
exports.ScrapeResultDto = void 0;
const openapi = require("@nestjs/swagger");
const swagger_1 = require("@nestjs/swagger");
const class_validator_1 = require("class-validator");
class ScrapeResultDto {
    caption;
    imageUrl;
    static _OPENAPI_METADATA_FACTORY() {
        return { caption: { required: true, type: () => String, maxLength: 20000 }, imageUrl: { required: false, type: () => String, maxLength: 2000, format: "uri" } };
    }
}
exports.ScrapeResultDto = ScrapeResultDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Texte de la publication d’origine' }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsNotEmpty)(),
    (0, class_validator_1.MaxLength)(20000),
    __metadata("design:type", String)
], ScrapeResultDto.prototype, "caption", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: 'Image de la publication. Absente, le post reprendra l’image par défaut du profil.',
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsUrl)({ protocols: ['https'], require_protocol: true }),
    (0, class_validator_1.MaxLength)(2000),
    __metadata("design:type", String)
], ScrapeResultDto.prototype, "imageUrl", void 0);
//# sourceMappingURL=scrape-result.dto.js.map