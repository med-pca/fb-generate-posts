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
exports.ImportJsonDto = void 0;
const openapi = require("@nestjs/swagger");
const class_validator_1 = require("class-validator");
const class_transformer_1 = require("class-transformer");
class JsonPostDto {
    externalId;
    title;
    description;
    url;
    imageUrl;
    delay;
    static _OPENAPI_METADATA_FACTORY() {
        return { externalId: { required: false, type: () => String }, title: { required: true, type: () => String }, description: { required: true, type: () => String }, url: { required: false, type: () => String, format: "uri" }, imageUrl: { required: false, type: () => String, format: "uri" }, delay: { required: true, type: () => Number, minimum: 0, maximum: 1440 } };
    }
}
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], JsonPostDto.prototype, "externalId", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], JsonPostDto.prototype, "title", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], JsonPostDto.prototype, "description", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsUrl)({ require_tld: false }),
    __metadata("design:type", String)
], JsonPostDto.prototype, "url", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsUrl)({ require_tld: false }),
    __metadata("design:type", String)
], JsonPostDto.prototype, "imageUrl", void 0);
__decorate([
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(0),
    (0, class_validator_1.Max)(1440),
    __metadata("design:type", Number)
], JsonPostDto.prototype, "delay", void 0);
class ImportJsonDto {
    profileId;
    groupIds;
    posts;
    static _OPENAPI_METADATA_FACTORY() {
        return { profileId: { required: true, type: () => String }, groupIds: { required: true, type: () => [String], minItems: 1 }, posts: { required: true, type: () => [JsonPostDto], minItems: 1 } };
    }
}
exports.ImportJsonDto = ImportJsonDto;
__decorate([
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], ImportJsonDto.prototype, "profileId", void 0);
__decorate([
    (0, class_validator_1.IsArray)(),
    (0, class_validator_1.ArrayMinSize)(1),
    (0, class_validator_1.IsString)({ each: true }),
    __metadata("design:type", Array)
], ImportJsonDto.prototype, "groupIds", void 0);
__decorate([
    (0, class_validator_1.IsArray)(),
    (0, class_validator_1.ArrayMinSize)(1),
    (0, class_validator_1.ValidateNested)({ each: true }),
    (0, class_transformer_1.Type)(() => JsonPostDto),
    __metadata("design:type", Array)
], ImportJsonDto.prototype, "posts", void 0);
//# sourceMappingURL=import-json.dto.js.map