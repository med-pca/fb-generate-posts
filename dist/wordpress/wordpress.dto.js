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
exports.WordpressArticleDto = void 0;
const openapi = require("@nestjs/swagger");
const class_validator_1 = require("class-validator");
class WordpressArticleDto {
    siteUrl;
    siteName;
    postId;
    title;
    content;
    excerpt;
    articleUrl;
    imageUrl;
    publishedAt;
    static _OPENAPI_METADATA_FACTORY() {
        return { siteUrl: { required: true, type: () => String, maxLength: 2000, format: "uri" }, siteName: { required: true, type: () => String, maxLength: 200 }, postId: { required: true, type: () => String, pattern: "^[1-9]\\d{0,19}$" }, title: { required: true, type: () => String, maxLength: 1000 }, content: { required: true, type: () => String, maxLength: 100000 }, excerpt: { required: false, type: () => String, maxLength: 5000 }, articleUrl: { required: true, type: () => String, maxLength: 2000, format: "uri" }, imageUrl: { required: false, type: () => String, maxLength: 2000, format: "uri" }, publishedAt: { required: true, type: () => String } };
    }
}
exports.WordpressArticleDto = WordpressArticleDto;
__decorate([
    (0, class_validator_1.IsUrl)({ protocols: ['https'], require_protocol: true }),
    (0, class_validator_1.MaxLength)(2000),
    __metadata("design:type", String)
], WordpressArticleDto.prototype, "siteUrl", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(200),
    (0, class_validator_1.IsNotEmpty)(),
    __metadata("design:type", String)
], WordpressArticleDto.prototype, "siteName", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.Matches)(/^[1-9]\d{0,19}$/),
    __metadata("design:type", String)
], WordpressArticleDto.prototype, "postId", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsNotEmpty)(),
    (0, class_validator_1.MaxLength)(1000),
    __metadata("design:type", String)
], WordpressArticleDto.prototype, "title", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(100000),
    __metadata("design:type", String)
], WordpressArticleDto.prototype, "content", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(5000),
    __metadata("design:type", String)
], WordpressArticleDto.prototype, "excerpt", void 0);
__decorate([
    (0, class_validator_1.IsUrl)({ protocols: ['https'], require_protocol: true }),
    (0, class_validator_1.MaxLength)(2000),
    __metadata("design:type", String)
], WordpressArticleDto.prototype, "articleUrl", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsUrl)({ protocols: ['https'], require_protocol: true }),
    (0, class_validator_1.MaxLength)(2000),
    __metadata("design:type", String)
], WordpressArticleDto.prototype, "imageUrl", void 0);
__decorate([
    (0, class_validator_1.IsDateString)(),
    __metadata("design:type", String)
], WordpressArticleDto.prototype, "publishedAt", void 0);
//# sourceMappingURL=wordpress.dto.js.map