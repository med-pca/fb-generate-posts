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
exports.GroupLimitsDto = exports.PublishedQueryDto = exports.PUBLISHED_LINK = exports.PUBLISHED_VERIFY = exports.OptionalFacebookUrlDto = exports.AttachFacebookUrlDto = exports.FacebookUrlDto = exports.ForceTargetDto = exports.PriorityDto = exports.PRIORITY_MOVES = exports.QueueQueryDto = void 0;
const openapi = require("@nestjs/swagger");
const swagger_1 = require("@nestjs/swagger");
const class_transformer_1 = require("class-transformer");
const class_validator_1 = require("class-validator");
const link_why_1 = require("../link-why");
class QueueQueryDto {
    categoryId;
    siteId;
    groupId;
    limit = 10;
    publishedLimit = 20;
    static _OPENAPI_METADATA_FACTORY() {
        return { categoryId: { required: false, type: () => String }, siteId: { required: false, type: () => String }, groupId: { required: false, type: () => String }, limit: { required: true, type: () => Object, default: 10, minimum: 1, maximum: 100 }, publishedLimit: { required: true, type: () => Object, default: 20, minimum: 1, maximum: 200 } };
    }
}
exports.QueueQueryDto = QueueQueryDto;
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], QueueQueryDto.prototype, "categoryId", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], QueueQueryDto.prototype, "siteId", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], QueueQueryDto.prototype, "groupId", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ default: 10, minimum: 1, maximum: 100 }),
    (0, class_validator_1.IsOptional)(),
    (0, class_transformer_1.Type)(() => Number),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(1),
    (0, class_validator_1.Max)(100),
    __metadata("design:type", Object)
], QueueQueryDto.prototype, "limit", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ default: 20, minimum: 1, maximum: 200 }),
    (0, class_validator_1.IsOptional)(),
    (0, class_transformer_1.Type)(() => Number),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(1),
    (0, class_validator_1.Max)(200),
    __metadata("design:type", Object)
], QueueQueryDto.prototype, "publishedLimit", void 0);
exports.PRIORITY_MOVES = ['top', 'up', 'down', 'reset'];
class PriorityDto {
    move;
    priority;
    static _OPENAPI_METADATA_FACTORY() {
        return { move: { required: false, enum: ["top", "up", "down", "reset"], enum: exports.PRIORITY_MOVES }, priority: { required: false, type: () => Number, minimum: -1000, maximum: 1000 } };
    }
}
exports.PriorityDto = PriorityDto;
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ enum: exports.PRIORITY_MOVES }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsIn)(exports.PRIORITY_MOVES),
    __metadata("design:type", String)
], PriorityDto.prototype, "move", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ minimum: -1000, maximum: 1000 }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(-1000),
    (0, class_validator_1.Max)(1000),
    __metadata("design:type", Number)
], PriorityDto.prototype, "priority", void 0);
class ForceTargetDto {
    profileId;
    static _OPENAPI_METADATA_FACTORY() {
        return { profileId: { required: true, type: () => String, nullable: true } };
    }
}
exports.ForceTargetDto = ForceTargetDto;
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ nullable: true }),
    (0, class_validator_1.ValidateIf)((dto) => dto.profileId !== null),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", Object)
], ForceTargetDto.prototype, "profileId", void 0);
class FacebookUrlDto {
    facebookUrl;
    static _OPENAPI_METADATA_FACTORY() {
        return { facebookUrl: { required: true, type: () => String, maxLength: 2000 } };
    }
}
exports.FacebookUrlDto = FacebookUrlDto;
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'https://www.facebook.com/groups/123/posts/456' }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(2000),
    __metadata("design:type", String)
], FacebookUrlDto.prototype, "facebookUrl", void 0);
class AttachFacebookUrlDto extends FacebookUrlDto {
    targetId;
    static _OPENAPI_METADATA_FACTORY() {
        return { targetId: { required: false, type: () => String, maxLength: 64 } };
    }
}
exports.AttachFacebookUrlDto = AttachFacebookUrlDto;
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(64),
    __metadata("design:type", String)
], AttachFacebookUrlDto.prototype, "targetId", void 0);
class OptionalFacebookUrlDto {
    facebookUrl;
    static _OPENAPI_METADATA_FACTORY() {
        return { facebookUrl: { required: false, type: () => String, maxLength: 2000 } };
    }
}
exports.OptionalFacebookUrlDto = OptionalFacebookUrlDto;
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: 'https://www.facebook.com/groups/123/posts/456' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(2000),
    __metadata("design:type", String)
], OptionalFacebookUrlDto.prototype, "facebookUrl", void 0);
exports.PUBLISHED_VERIFY = ['ok', 'republished', 'needs_action', 'unverified'];
exports.PUBLISHED_LINK = ['placed', 'waiting', 'missing', 'none'];
class PublishedQueryDto {
    from;
    to;
    profileId;
    groupId;
    categoryId;
    siteId;
    verify;
    link;
    why;
    kind;
    url;
    search;
    page = 1;
    limit = 50;
    static _OPENAPI_METADATA_FACTORY() {
        return { from: { required: false, type: () => String }, to: { required: false, type: () => String }, profileId: { required: false, type: () => String }, groupId: { required: false, type: () => String }, categoryId: { required: false, type: () => String }, siteId: { required: false, type: () => String }, verify: { required: false, enum: ["ok", "republished", "needs_action", "unverified"], enum: exports.PUBLISHED_VERIFY }, link: { required: false, enum: ["none", "missing", "placed", "waiting"], enum: exports.PUBLISHED_LINK }, why: { required: false, enum: ["unknown", "approval", "removed", "rescue", "rescue_failed", "no_url", "comment_error"], enum: link_why_1.MISSING_WHY }, kind: { required: false, enum: ["article", "visual", "manual"], enum: ['article', 'visual', 'manual'] }, url: { required: false, enum: ["with", "without"], enum: ['with', 'without'] }, search: { required: false, type: () => String, maxLength: 200 }, page: { required: true, type: () => Object, default: 1, minimum: 1 }, limit: { required: true, type: () => Object, default: 50, minimum: 1, maximum: 500 } };
    }
}
exports.PublishedQueryDto = PublishedQueryDto;
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: '2026-10-05T08:00:00.000Z' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsISO8601)(),
    __metadata("design:type", String)
], PublishedQueryDto.prototype, "from", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: '2026-10-05T20:00:00.000Z' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsISO8601)(),
    __metadata("design:type", String)
], PublishedQueryDto.prototype, "to", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], PublishedQueryDto.prototype, "profileId", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], PublishedQueryDto.prototype, "groupId", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], PublishedQueryDto.prototype, "categoryId", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], PublishedQueryDto.prototype, "siteId", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ enum: exports.PUBLISHED_VERIFY }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsIn)(exports.PUBLISHED_VERIFY),
    __metadata("design:type", Object)
], PublishedQueryDto.prototype, "verify", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ enum: exports.PUBLISHED_LINK }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsIn)(exports.PUBLISHED_LINK),
    __metadata("design:type", Object)
], PublishedQueryDto.prototype, "link", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ enum: link_why_1.MISSING_WHY }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsIn)(link_why_1.MISSING_WHY),
    __metadata("design:type", Object)
], PublishedQueryDto.prototype, "why", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ enum: ['article', 'visual', 'manual'] }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsIn)(['article', 'visual', 'manual']),
    __metadata("design:type", String)
], PublishedQueryDto.prototype, "kind", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ enum: ['with', 'without'] }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsIn)(['with', 'without']),
    __metadata("design:type", String)
], PublishedQueryDto.prototype, "url", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(200),
    __metadata("design:type", String)
], PublishedQueryDto.prototype, "search", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ default: 1 }),
    (0, class_validator_1.IsOptional)(),
    (0, class_transformer_1.Type)(() => Number),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(1),
    __metadata("design:type", Object)
], PublishedQueryDto.prototype, "page", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ default: 50 }),
    (0, class_validator_1.IsOptional)(),
    (0, class_transformer_1.Type)(() => Number),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(1),
    (0, class_validator_1.Max)(500),
    __metadata("design:type", Object)
], PublishedQueryDto.prototype, "limit", void 0);
class GroupLimitsDto {
    dailyCap;
    hoursStart;
    hoursEnd;
    static _OPENAPI_METADATA_FACTORY() {
        return { dailyCap: { required: false, type: () => Number, nullable: true, minimum: 0, maximum: 1000 }, hoursStart: { required: false, type: () => Number, nullable: true, minimum: 0, maximum: 1439 }, hoursEnd: { required: false, type: () => Number, nullable: true, minimum: 0, maximum: 1439 } };
    }
}
exports.GroupLimitsDto = GroupLimitsDto;
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ minimum: 0, maximum: 1000, nullable: true }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(0),
    (0, class_validator_1.Max)(1000),
    __metadata("design:type", Object)
], GroupLimitsDto.prototype, "dailyCap", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ minimum: 0, maximum: 1439, nullable: true }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(0),
    (0, class_validator_1.Max)(1439),
    __metadata("design:type", Object)
], GroupLimitsDto.prototype, "hoursStart", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ minimum: 0, maximum: 1439, nullable: true }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(0),
    (0, class_validator_1.Max)(1439),
    __metadata("design:type", Object)
], GroupLimitsDto.prototype, "hoursEnd", void 0);
//# sourceMappingURL=queue.dto.js.map