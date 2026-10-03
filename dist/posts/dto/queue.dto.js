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
exports.OptionalFacebookUrlDto = exports.FacebookUrlDto = exports.ForceTargetDto = exports.PriorityDto = exports.PRIORITY_MOVES = exports.QueueQueryDto = void 0;
const openapi = require("@nestjs/swagger");
const swagger_1 = require("@nestjs/swagger");
const class_transformer_1 = require("class-transformer");
const class_validator_1 = require("class-validator");
class QueueQueryDto {
    categoryId;
    groupId;
    limit = 10;
    publishedLimit = 20;
    static _OPENAPI_METADATA_FACTORY() {
        return { categoryId: { required: false, type: () => String }, groupId: { required: false, type: () => String }, limit: { required: true, type: () => Object, default: 10, minimum: 1, maximum: 100 }, publishedLimit: { required: true, type: () => Object, default: 20, minimum: 1, maximum: 200 } };
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
//# sourceMappingURL=queue.dto.js.map