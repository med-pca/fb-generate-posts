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
exports.BulkMembershipDto = exports.OptionsQueryDto = exports.BulkShareDto = exports.BulkLinkDto = void 0;
const openapi = require("@nestjs/swagger");
const swagger_1 = require("@nestjs/swagger");
const class_validator_1 = require("class-validator");
class BulkLinkDto {
    profileIds;
    groupIds;
    action;
    static _OPENAPI_METADATA_FACTORY() {
        return { profileIds: { required: true, type: () => [String], minItems: 1, maxItems: 500 }, groupIds: { required: true, type: () => [String], minItems: 1, maxItems: 3000 }, action: { required: true, enum: ["link", "unlink"], enum: ['link', 'unlink'] } };
    }
}
exports.BulkLinkDto = BulkLinkDto;
__decorate([
    (0, swagger_1.ApiProperty)({ type: [String] }),
    (0, class_validator_1.IsArray)(),
    (0, class_validator_1.ArrayMinSize)(1),
    (0, class_validator_1.ArrayMaxSize)(500),
    (0, class_validator_1.IsString)({ each: true }),
    __metadata("design:type", Array)
], BulkLinkDto.prototype, "profileIds", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ type: [String] }),
    (0, class_validator_1.IsArray)(),
    (0, class_validator_1.ArrayMinSize)(1),
    (0, class_validator_1.ArrayMaxSize)(3000),
    (0, class_validator_1.IsString)({ each: true }),
    __metadata("design:type", Array)
], BulkLinkDto.prototype, "groupIds", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ enum: ['link', 'unlink'] }),
    (0, class_validator_1.IsIn)(['link', 'unlink']),
    __metadata("design:type", String)
], BulkLinkDto.prototype, "action", void 0);
class BulkShareDto {
    kind;
    ids;
    userIds;
    action;
    static _OPENAPI_METADATA_FACTORY() {
        return { kind: { required: true, enum: ["groups", "sites"], enum: ['groups', 'sites'] }, ids: { required: true, type: () => [String], minItems: 1, maxItems: 3000 }, userIds: { required: true, type: () => [String], minItems: 1, maxItems: 100 }, action: { required: true, enum: ["grant", "revoke"], enum: ['grant', 'revoke'] } };
    }
}
exports.BulkShareDto = BulkShareDto;
__decorate([
    (0, swagger_1.ApiProperty)({ enum: ['groups', 'sites'] }),
    (0, class_validator_1.IsIn)(['groups', 'sites']),
    __metadata("design:type", String)
], BulkShareDto.prototype, "kind", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ type: [String] }),
    (0, class_validator_1.IsArray)(),
    (0, class_validator_1.ArrayMinSize)(1),
    (0, class_validator_1.ArrayMaxSize)(3000),
    (0, class_validator_1.IsString)({ each: true }),
    __metadata("design:type", Array)
], BulkShareDto.prototype, "ids", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ type: [String] }),
    (0, class_validator_1.IsArray)(),
    (0, class_validator_1.ArrayMinSize)(1),
    (0, class_validator_1.ArrayMaxSize)(100),
    (0, class_validator_1.IsString)({ each: true }),
    __metadata("design:type", Array)
], BulkShareDto.prototype, "userIds", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ enum: ['grant', 'revoke'] }),
    (0, class_validator_1.IsIn)(['grant', 'revoke']),
    __metadata("design:type", String)
], BulkShareDto.prototype, "action", void 0);
class OptionsQueryDto {
    search;
    categoryId;
    static _OPENAPI_METADATA_FACTORY() {
        return { search: { required: false, type: () => String, maxLength: 200 }, categoryId: { required: false, type: () => String } };
    }
}
exports.OptionsQueryDto = OptionsQueryDto;
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(200),
    __metadata("design:type", String)
], OptionsQueryDto.prototype, "search", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], OptionsQueryDto.prototype, "categoryId", void 0);
class BulkMembershipDto {
    profileIds;
    groupIds;
    joinStatus;
    preApproved;
    linkMissing;
    static _OPENAPI_METADATA_FACTORY() {
        return { profileIds: { required: true, type: () => [String], minItems: 1, maxItems: 500 }, groupIds: { required: true, type: () => [String], minItems: 1, maxItems: 2000 }, joinStatus: { required: false, enum: ["NOT_JOINED", "REQUESTED", "JOINED", "QUESTIONS"], enum: ['JOINED', 'REQUESTED', 'QUESTIONS', 'NOT_JOINED'] }, preApproved: { required: false, type: () => Boolean }, linkMissing: { required: false, type: () => Boolean } };
    }
}
exports.BulkMembershipDto = BulkMembershipDto;
__decorate([
    (0, class_validator_1.IsArray)(),
    (0, class_validator_1.ArrayMinSize)(1),
    (0, class_validator_1.ArrayMaxSize)(500),
    (0, class_validator_1.IsString)({ each: true }),
    __metadata("design:type", Array)
], BulkMembershipDto.prototype, "profileIds", void 0);
__decorate([
    (0, class_validator_1.IsArray)(),
    (0, class_validator_1.ArrayMinSize)(1),
    (0, class_validator_1.ArrayMaxSize)(2000),
    (0, class_validator_1.IsString)({ each: true }),
    __metadata("design:type", Array)
], BulkMembershipDto.prototype, "groupIds", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsIn)(['JOINED', 'REQUESTED', 'QUESTIONS', 'NOT_JOINED']),
    __metadata("design:type", String)
], BulkMembershipDto.prototype, "joinStatus", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsBoolean)(),
    __metadata("design:type", Boolean)
], BulkMembershipDto.prototype, "preApproved", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsBoolean)(),
    __metadata("design:type", Boolean)
], BulkMembershipDto.prototype, "linkMissing", void 0);
//# sourceMappingURL=bulk.dto.js.map