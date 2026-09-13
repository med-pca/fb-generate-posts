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
exports.GeneratePostsDto = void 0;
const openapi = require("@nestjs/swagger");
const class_validator_1 = require("class-validator");
class GeneratePostsDto {
    profileId;
    groupIds;
    topic;
    language = 'fr';
    count;
    url;
    imageUrl;
    delayMin;
    delayMax;
    static _OPENAPI_METADATA_FACTORY() {
        return { profileId: { required: true, type: () => String }, groupIds: { required: true, type: () => [String], minItems: 1 }, topic: { required: true, type: () => String }, language: { required: true, type: () => Object, default: "fr" }, count: { required: true, type: () => Number, minimum: 1, maximum: 50 }, url: { required: false, type: () => String, format: "uri" }, imageUrl: { required: false, type: () => String, format: "uri" }, delayMin: { required: true, type: () => Number, minimum: 0, maximum: 1440 }, delayMax: { required: true, type: () => Number, minimum: 0, maximum: 1440 } };
    }
}
exports.GeneratePostsDto = GeneratePostsDto;
__decorate([
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], GeneratePostsDto.prototype, "profileId", void 0);
__decorate([
    (0, class_validator_1.IsArray)(),
    (0, class_validator_1.ArrayMinSize)(1),
    (0, class_validator_1.IsString)({ each: true }),
    __metadata("design:type", Array)
], GeneratePostsDto.prototype, "groupIds", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], GeneratePostsDto.prototype, "topic", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", Object)
], GeneratePostsDto.prototype, "language", void 0);
__decorate([
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(1),
    (0, class_validator_1.Max)(50),
    __metadata("design:type", Number)
], GeneratePostsDto.prototype, "count", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsUrl)({ require_tld: false }),
    __metadata("design:type", String)
], GeneratePostsDto.prototype, "url", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsUrl)({ require_tld: false }),
    __metadata("design:type", String)
], GeneratePostsDto.prototype, "imageUrl", void 0);
__decorate([
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(0),
    (0, class_validator_1.Max)(1440),
    __metadata("design:type", Number)
], GeneratePostsDto.prototype, "delayMin", void 0);
__decorate([
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(0),
    (0, class_validator_1.Max)(1440),
    __metadata("design:type", Number)
], GeneratePostsDto.prototype, "delayMax", void 0);
//# sourceMappingURL=generate-posts.dto.js.map