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
exports.GenerateArticlePostsDto = void 0;
const openapi = require("@nestjs/swagger");
const swagger_1 = require("@nestjs/swagger");
const class_validator_1 = require("class-validator");
class GenerateArticlePostsDto {
    profileId;
    groupIds;
    delayMin = 10;
    delayMax = 60;
    static _OPENAPI_METADATA_FACTORY() {
        return { profileId: { required: true, type: () => String }, groupIds: { required: true, type: () => [String], minItems: 1 }, delayMin: { required: true, type: () => Object, default: 10, minimum: 0, maximum: 1440 }, delayMax: { required: true, type: () => Object, default: 60, minimum: 0, maximum: 1440 } };
    }
}
exports.GenerateArticlePostsDto = GenerateArticlePostsDto;
__decorate([
    (0, swagger_1.ApiProperty)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], GenerateArticlePostsDto.prototype, "profileId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ type: [String] }),
    (0, class_validator_1.IsArray)(),
    (0, class_validator_1.ArrayNotEmpty)(),
    (0, class_validator_1.IsString)({ each: true }),
    __metadata("design:type", Array)
], GenerateArticlePostsDto.prototype, "groupIds", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ default: 10 }),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(0),
    (0, class_validator_1.Max)(1440),
    __metadata("design:type", Object)
], GenerateArticlePostsDto.prototype, "delayMin", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ default: 60 }),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(0),
    (0, class_validator_1.Max)(1440),
    __metadata("design:type", Object)
], GenerateArticlePostsDto.prototype, "delayMax", void 0);
//# sourceMappingURL=generate-article-posts.dto.js.map