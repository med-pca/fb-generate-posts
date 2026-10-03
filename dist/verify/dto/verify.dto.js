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
exports.ResolveDto = exports.MemberResultDto = exports.ModeratorDto = exports.VerifyResultDto = exports.VerifyClaimDto = void 0;
const openapi = require("@nestjs/swagger");
const swagger_1 = require("@nestjs/swagger");
const class_validator_1 = require("class-validator");
const verify_service_1 = require("../verify.service");
const members_service_1 = require("../members.service");
class VerifyClaimDto {
    profileExternalId;
    limit;
    static _OPENAPI_METADATA_FACTORY() {
        return { profileExternalId: { required: true, type: () => String, minLength: 1, maxLength: 200 }, limit: { required: false, type: () => Number, minimum: 1, maximum: 20 } };
    }
}
exports.VerifyClaimDto = VerifyClaimDto;
__decorate([
    (0, swagger_1.ApiProperty)({ example: '5727a89e-20d1-4438-a424-9ea5c2e10ca0' }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MinLength)(1),
    (0, class_validator_1.MaxLength)(200),
    __metadata("design:type", String)
], VerifyClaimDto.prototype, "profileExternalId", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: 5, minimum: 1, maximum: 20 }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(1),
    (0, class_validator_1.Max)(20),
    __metadata("design:type", Number)
], VerifyClaimDto.prototype, "limit", void 0);
class VerifyResultDto {
    profileExternalId;
    outcome;
    detail;
    postUrl;
    deleted;
    static _OPENAPI_METADATA_FACTORY() {
        return { profileExternalId: { required: true, type: () => String, minLength: 1, maxLength: 200 }, outcome: { required: true, enum: ["ok", "missing_post", "missing_link", "pending", "unreachable"], enum: verify_service_1.VERIFY_OUTCOMES }, detail: { required: false, type: () => String, maxLength: 1000 }, postUrl: { required: false, type: () => String, maxLength: 2000 }, deleted: { required: false, type: () => Boolean } };
    }
}
exports.VerifyResultDto = VerifyResultDto;
__decorate([
    (0, swagger_1.ApiProperty)({ example: '5727a89e-20d1-4438-a424-9ea5c2e10ca0' }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MinLength)(1),
    (0, class_validator_1.MaxLength)(200),
    __metadata("design:type", String)
], VerifyResultDto.prototype, "profileExternalId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ enum: verify_service_1.VERIFY_OUTCOMES }),
    (0, class_validator_1.IsIn)(verify_service_1.VERIFY_OUTCOMES),
    __metadata("design:type", String)
], VerifyResultDto.prototype, "outcome", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: 'commentaire « . » sans URL' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(1000),
    __metadata("design:type", String)
], VerifyResultDto.prototype, "detail", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: 'https://www.facebook.com/groups/123/posts/456' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(2000),
    __metadata("design:type", String)
], VerifyResultDto.prototype, "postUrl", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsBoolean)(),
    __metadata("design:type", Boolean)
], VerifyResultDto.prototype, "deleted", void 0);
class ModeratorDto {
    isModerator;
    facebookUserId;
    static _OPENAPI_METADATA_FACTORY() {
        return { isModerator: { required: false, type: () => Boolean }, facebookUserId: { required: false, type: () => String, pattern: "^(\\d{5,20})?$" } };
    }
}
exports.ModeratorDto = ModeratorDto;
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsBoolean)(),
    __metadata("design:type", Boolean)
], ModeratorDto.prototype, "isModerator", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: '100089123456789' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.Matches)(/^(\d{5,20})?$/),
    __metadata("design:type", String)
], ModeratorDto.prototype, "facebookUserId", void 0);
class MemberResultDto {
    profileExternalId;
    kind;
    outcome;
    facebookUserId;
    detail;
    static _OPENAPI_METADATA_FACTORY() {
        return { profileExternalId: { required: true, type: () => String, minLength: 1, maxLength: 200 }, kind: { required: true, enum: ["approve", "preapprove"], enum: members_service_1.MEMBER_KINDS }, outcome: { required: true, enum: ["done", "unreachable", "already", "not_found", "no_permission"], enum: members_service_1.MEMBER_OUTCOMES }, facebookUserId: { required: true, type: () => String, pattern: "^\\d{5,20}$" }, detail: { required: false, type: () => String, maxLength: 1000 } };
    }
}
exports.MemberResultDto = MemberResultDto;
__decorate([
    (0, swagger_1.ApiProperty)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MinLength)(1),
    (0, class_validator_1.MaxLength)(200),
    __metadata("design:type", String)
], MemberResultDto.prototype, "profileExternalId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ enum: members_service_1.MEMBER_KINDS }),
    (0, class_validator_1.IsIn)(members_service_1.MEMBER_KINDS),
    __metadata("design:type", String)
], MemberResultDto.prototype, "kind", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ enum: members_service_1.MEMBER_OUTCOMES }),
    (0, class_validator_1.IsIn)(members_service_1.MEMBER_OUTCOMES),
    __metadata("design:type", String)
], MemberResultDto.prototype, "outcome", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: '100089123456789' }),
    (0, class_validator_1.Matches)(/^\d{5,20}$/),
    __metadata("design:type", String)
], MemberResultDto.prototype, "facebookUserId", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(1000),
    __metadata("design:type", String)
], MemberResultDto.prototype, "detail", void 0);
class ResolveDto {
    action;
    static _OPENAPI_METADATA_FACTORY() {
        return { action: { required: true, enum: ["ok", "republish"], enum: ['ok', 'republish'] } };
    }
}
exports.ResolveDto = ResolveDto;
__decorate([
    (0, swagger_1.ApiProperty)({ enum: ['ok', 'republish'] }),
    (0, class_validator_1.IsIn)(['ok', 'republish']),
    __metadata("design:type", String)
], ResolveDto.prototype, "action", void 0);
//# sourceMappingURL=verify.dto.js.map