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
exports.UpdateCampaignDto = exports.CreateCampaignDto = void 0;
const openapi = require("@nestjs/swagger");
const swagger_1 = require("@nestjs/swagger");
const class_validator_1 = require("class-validator");
class CreateCampaignDto {
    name;
    siteId;
    categoryId;
    period;
    target;
    startsAt;
    endsAt;
    timezone;
    windowStart;
    windowEnd;
    priority;
    groupIds;
    profileIds;
    articleIds;
    notes;
    maxPerProfilePerDay;
    activeProfiles;
    spread;
    rotationTeams;
    static _OPENAPI_METADATA_FACTORY() {
        return { name: { required: true, type: () => String, minLength: 1, maxLength: 120 }, siteId: { required: true, type: () => String }, categoryId: { required: false, type: () => String, nullable: true }, period: { required: true, enum: ["day", "month", "week"], enum: ['day', 'week', 'month'] }, target: { required: true, type: () => Number, minimum: 1, maximum: 1000000 }, startsAt: { required: false, type: () => String }, endsAt: { required: false, type: () => String, nullable: true }, timezone: { required: false, type: () => String, maxLength: 60 }, windowStart: { required: false, type: () => Number, minimum: 0, maximum: 1439 }, windowEnd: { required: false, type: () => Number, minimum: 0, maximum: 1439 }, priority: { required: false, type: () => Number, minimum: -100, maximum: 100 }, groupIds: { required: false, type: () => [String], maxItems: 2000 }, profileIds: { required: false, type: () => [String], maxItems: 1000 }, articleIds: { required: false, type: () => [String], maxItems: 2000 }, notes: { required: false, type: () => String, maxLength: 2000 }, maxPerProfilePerDay: { required: false, type: () => Number, nullable: true, minimum: 1, maximum: 1000 }, activeProfiles: { required: false, type: () => Number, nullable: true, minimum: 1, maximum: 1000 }, spread: { required: false, type: () => Boolean }, rotationTeams: { required: false, type: () => [String], maxLength: 200, maxItems: 60 } };
    }
}
exports.CreateCampaignDto = CreateCampaignDto;
__decorate([
    (0, swagger_1.ApiProperty)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MinLength)(1),
    (0, class_validator_1.MaxLength)(120),
    __metadata("design:type", String)
], CreateCampaignDto.prototype, "name", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], CreateCampaignDto.prototype, "siteId", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.ValidateIf)((_d, v) => v !== null),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", Object)
], CreateCampaignDto.prototype, "categoryId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ enum: ['day', 'week', 'month'] }),
    (0, class_validator_1.IsIn)(['day', 'week', 'month']),
    __metadata("design:type", String)
], CreateCampaignDto.prototype, "period", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(1),
    (0, class_validator_1.Max)(1_000_000),
    __metadata("design:type", Number)
], CreateCampaignDto.prototype, "target", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsDateString)(),
    __metadata("design:type", String)
], CreateCampaignDto.prototype, "startsAt", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.ValidateIf)((_d, v) => v !== null),
    (0, class_validator_1.IsDateString)(),
    __metadata("design:type", Object)
], CreateCampaignDto.prototype, "endsAt", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(60),
    __metadata("design:type", String)
], CreateCampaignDto.prototype, "timezone", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(0),
    (0, class_validator_1.Max)(1439),
    __metadata("design:type", Number)
], CreateCampaignDto.prototype, "windowStart", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(0),
    (0, class_validator_1.Max)(1439),
    __metadata("design:type", Number)
], CreateCampaignDto.prototype, "windowEnd", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(-100),
    (0, class_validator_1.Max)(100),
    __metadata("design:type", Number)
], CreateCampaignDto.prototype, "priority", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsArray)(),
    (0, class_validator_1.ArrayMaxSize)(2000),
    (0, class_validator_1.IsString)({ each: true }),
    __metadata("design:type", Array)
], CreateCampaignDto.prototype, "groupIds", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsArray)(),
    (0, class_validator_1.ArrayMaxSize)(1000),
    (0, class_validator_1.IsString)({ each: true }),
    __metadata("design:type", Array)
], CreateCampaignDto.prototype, "profileIds", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsArray)(),
    (0, class_validator_1.ArrayMaxSize)(2000),
    (0, class_validator_1.IsString)({ each: true }),
    __metadata("design:type", Array)
], CreateCampaignDto.prototype, "articleIds", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(2000),
    __metadata("design:type", String)
], CreateCampaignDto.prototype, "notes", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.ValidateIf)((_d, v) => v !== null),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(1),
    (0, class_validator_1.Max)(1000),
    __metadata("design:type", Object)
], CreateCampaignDto.prototype, "maxPerProfilePerDay", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.ValidateIf)((_d, v) => v !== null),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(1),
    (0, class_validator_1.Max)(1000),
    __metadata("design:type", Object)
], CreateCampaignDto.prototype, "activeProfiles", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsBoolean)(),
    __metadata("design:type", Boolean)
], CreateCampaignDto.prototype, "spread", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsArray)(),
    (0, class_validator_1.ArrayMaxSize)(60),
    (0, class_validator_1.IsString)({ each: true }),
    (0, class_validator_1.MaxLength)(200, { each: true }),
    __metadata("design:type", Array)
], CreateCampaignDto.prototype, "rotationTeams", void 0);
class UpdateCampaignDto {
    name;
    siteId;
    categoryId;
    status;
    period;
    target;
    startsAt;
    endsAt;
    timezone;
    windowStart;
    windowEnd;
    priority;
    groupIds;
    profileIds;
    articleIds;
    notes;
    maxPerProfilePerDay;
    activeProfiles;
    spread;
    rotationTeams;
    static _OPENAPI_METADATA_FACTORY() {
        return { name: { required: false, type: () => String, minLength: 1, maxLength: 120 }, siteId: { required: false, type: () => String }, categoryId: { required: false, type: () => String, nullable: true }, status: { required: false, enum: ["ACTIVE", "PAUSED", "ENDED"], enum: ['ACTIVE', 'PAUSED', 'ENDED'] }, period: { required: false, enum: ["day", "month", "week"], enum: ['day', 'week', 'month'] }, target: { required: false, type: () => Number, minimum: 1, maximum: 1000000 }, startsAt: { required: false, type: () => String }, endsAt: { required: false, type: () => String, nullable: true }, timezone: { required: false, type: () => String, maxLength: 60 }, windowStart: { required: false, type: () => Number, minimum: 0, maximum: 1439 }, windowEnd: { required: false, type: () => Number, minimum: 0, maximum: 1439 }, priority: { required: false, type: () => Number, minimum: -100, maximum: 100 }, groupIds: { required: false, type: () => [String], maxItems: 2000 }, profileIds: { required: false, type: () => [String], maxItems: 1000 }, articleIds: { required: false, type: () => [String], maxItems: 2000 }, notes: { required: false, type: () => String, maxLength: 2000 }, maxPerProfilePerDay: { required: false, type: () => Number, nullable: true, minimum: 1, maximum: 1000 }, activeProfiles: { required: false, type: () => Number, nullable: true, minimum: 1, maximum: 1000 }, spread: { required: false, type: () => Boolean }, rotationTeams: { required: false, type: () => [String], maxLength: 200, maxItems: 60 } };
    }
}
exports.UpdateCampaignDto = UpdateCampaignDto;
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MinLength)(1),
    (0, class_validator_1.MaxLength)(120),
    __metadata("design:type", String)
], UpdateCampaignDto.prototype, "name", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], UpdateCampaignDto.prototype, "siteId", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.ValidateIf)((_d, v) => v !== null),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", Object)
], UpdateCampaignDto.prototype, "categoryId", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ enum: ['ACTIVE', 'PAUSED', 'ENDED'] }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsIn)(['ACTIVE', 'PAUSED', 'ENDED']),
    __metadata("design:type", String)
], UpdateCampaignDto.prototype, "status", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ enum: ['day', 'week', 'month'] }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsIn)(['day', 'week', 'month']),
    __metadata("design:type", String)
], UpdateCampaignDto.prototype, "period", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(1),
    (0, class_validator_1.Max)(1_000_000),
    __metadata("design:type", Number)
], UpdateCampaignDto.prototype, "target", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsDateString)(),
    __metadata("design:type", String)
], UpdateCampaignDto.prototype, "startsAt", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.ValidateIf)((_d, v) => v !== null),
    (0, class_validator_1.IsDateString)(),
    __metadata("design:type", Object)
], UpdateCampaignDto.prototype, "endsAt", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(60),
    __metadata("design:type", String)
], UpdateCampaignDto.prototype, "timezone", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(0),
    (0, class_validator_1.Max)(1439),
    __metadata("design:type", Number)
], UpdateCampaignDto.prototype, "windowStart", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(0),
    (0, class_validator_1.Max)(1439),
    __metadata("design:type", Number)
], UpdateCampaignDto.prototype, "windowEnd", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(-100),
    (0, class_validator_1.Max)(100),
    __metadata("design:type", Number)
], UpdateCampaignDto.prototype, "priority", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsArray)(),
    (0, class_validator_1.ArrayMaxSize)(2000),
    (0, class_validator_1.IsString)({ each: true }),
    __metadata("design:type", Array)
], UpdateCampaignDto.prototype, "groupIds", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsArray)(),
    (0, class_validator_1.ArrayMaxSize)(1000),
    (0, class_validator_1.IsString)({ each: true }),
    __metadata("design:type", Array)
], UpdateCampaignDto.prototype, "profileIds", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsArray)(),
    (0, class_validator_1.ArrayMaxSize)(2000),
    (0, class_validator_1.IsString)({ each: true }),
    __metadata("design:type", Array)
], UpdateCampaignDto.prototype, "articleIds", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(2000),
    __metadata("design:type", String)
], UpdateCampaignDto.prototype, "notes", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.ValidateIf)((_d, v) => v !== null),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(1),
    (0, class_validator_1.Max)(1000),
    __metadata("design:type", Object)
], UpdateCampaignDto.prototype, "maxPerProfilePerDay", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.ValidateIf)((_d, v) => v !== null),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(1),
    (0, class_validator_1.Max)(1000),
    __metadata("design:type", Object)
], UpdateCampaignDto.prototype, "activeProfiles", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsBoolean)(),
    __metadata("design:type", Boolean)
], UpdateCampaignDto.prototype, "spread", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsArray)(),
    (0, class_validator_1.ArrayMaxSize)(60),
    (0, class_validator_1.IsString)({ each: true }),
    (0, class_validator_1.MaxLength)(200, { each: true }),
    __metadata("design:type", Array)
], UpdateCampaignDto.prototype, "rotationTeams", void 0);
//# sourceMappingURL=campaign.dto.js.map