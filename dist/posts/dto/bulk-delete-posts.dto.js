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
exports.BulkDeletePostsDto = void 0;
const openapi = require("@nestjs/swagger");
const class_transformer_1 = require("class-transformer");
const client_1 = require("@prisma/client");
const class_validator_1 = require("class-validator");
const toBoolean = ({ value }) => value === true || value === 'true' || value === 1 || value === '1';
class BulkDeletePostsDto {
    ids;
    profileId;
    groupId;
    articleId;
    status;
    sourceType;
    dryRun = false;
    force = false;
    static _OPENAPI_METADATA_FACTORY() {
        return { ids: { required: false, type: () => [String], minItems: 1, maxItems: 500 }, profileId: { required: false, type: () => String }, groupId: { required: false, type: () => String }, articleId: { required: false, type: () => String }, status: { required: false, enum: ["DRAFT", "AVAILABLE", "ARCHIVED"] }, sourceType: { required: false, enum: ["MANUAL", "OPENAI", "JSON"] }, dryRun: { required: true, type: () => Object, default: false }, force: { required: true, type: () => Object, default: false } };
    }
}
exports.BulkDeletePostsDto = BulkDeletePostsDto;
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsArray)(),
    (0, class_validator_1.ArrayMinSize)(1),
    (0, class_validator_1.ArrayMaxSize)(500),
    (0, class_validator_1.IsString)({ each: true }),
    __metadata("design:type", Array)
], BulkDeletePostsDto.prototype, "ids", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], BulkDeletePostsDto.prototype, "profileId", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], BulkDeletePostsDto.prototype, "groupId", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], BulkDeletePostsDto.prototype, "articleId", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsEnum)(client_1.PostStatus),
    __metadata("design:type", String)
], BulkDeletePostsDto.prototype, "status", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsEnum)(client_1.SourceType),
    __metadata("design:type", String)
], BulkDeletePostsDto.prototype, "sourceType", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_transformer_1.Transform)(toBoolean),
    (0, class_validator_1.IsBoolean)(),
    __metadata("design:type", Object)
], BulkDeletePostsDto.prototype, "dryRun", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_transformer_1.Transform)(toBoolean),
    (0, class_validator_1.IsBoolean)(),
    __metadata("design:type", Object)
], BulkDeletePostsDto.prototype, "force", void 0);
//# sourceMappingURL=bulk-delete-posts.dto.js.map