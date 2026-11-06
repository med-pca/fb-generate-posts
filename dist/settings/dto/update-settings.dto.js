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
exports.UpdateSettingsDto = void 0;
const openapi = require("@nestjs/swagger");
const swagger_1 = require("@nestjs/swagger");
const class_validator_1 = require("class-validator");
const repeat_service_1 = require("../../posts/repeat.service");
class UpdateSettingsDto {
    publishingEnabled;
    dailyTarget;
    objectiveStart;
    objectiveEnd;
    objectiveTimezone;
    repeatTimes;
    repeatEveryHours;
    rateLimitPauseDays;
    pilotMode;
    rewriteStyle;
    nstGroupLimited;
    nstGroupCheckpoint;
    nstGroupDisabled;
    nstGroupLoggedOut;
    cycleMaxPosts;
    cyclePauseHours;
    engagementReview;
    adaptivePacing;
    minPostGapMinutes;
    articleParagraphsPerPage;
    articleMaxPages;
    articleMinWordsPerPage;
    imageProvider;
    static _OPENAPI_METADATA_FACTORY() {
        return { publishingEnabled: { required: false, type: () => Boolean }, dailyTarget: { required: false, type: () => Number, minimum: 0, maximum: 100000 }, objectiveStart: { required: false, type: () => Number, minimum: 0, maximum: 1439 }, objectiveEnd: { required: false, type: () => Number, minimum: 0, maximum: 1439 }, objectiveTimezone: { required: false, type: () => String, maxLength: 60 }, repeatTimes: { required: false, type: () => Number, minimum: 1, maximum: repeat_service_1.REPEAT_LIMITS.maxTimes }, repeatEveryHours: { required: false, type: () => Number, minimum: repeat_service_1.REPEAT_LIMITS.minHours, maximum: repeat_service_1.REPEAT_LIMITS.maxHours }, rateLimitPauseDays: { required: false, type: () => Number, minimum: 1, maximum: 60 }, pilotMode: { required: false, enum: ["group", "article"], enum: ['article', 'group'] }, rewriteStyle: { required: false, enum: ["seo", "faithful"], enum: ['seo', 'faithful'] }, nstGroupLimited: { required: false, type: () => String, maxLength: 100 }, nstGroupCheckpoint: { required: false, type: () => String, maxLength: 100 }, nstGroupDisabled: { required: false, type: () => String, maxLength: 100 }, nstGroupLoggedOut: { required: false, type: () => String, maxLength: 100 }, cycleMaxPosts: { required: false, type: () => Number, nullable: true, minimum: 1, maximum: 1000 }, cyclePauseHours: { required: false, type: () => Number, minimum: 1, maximum: 168 }, engagementReview: { required: false, type: () => Boolean }, adaptivePacing: { required: false, type: () => Boolean }, minPostGapMinutes: { required: false, type: () => Number, minimum: 2, maximum: 120 }, articleParagraphsPerPage: { required: false, type: () => Number, minimum: 0, maximum: 30 }, articleMaxPages: { required: false, type: () => Number, minimum: 1, maximum: 100 }, articleMinWordsPerPage: { required: false, type: () => Number, minimum: 0, maximum: 1000 }, imageProvider: { required: false, type: () => String, enum: ['auto', 'openai', 'qwen', 'seedream'] } };
    }
}
exports.UpdateSettingsDto = UpdateSettingsDto;
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsBoolean)(),
    __metadata("design:type", Boolean)
], UpdateSettingsDto.prototype, "publishingEnabled", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ minimum: 0, maximum: 100000 }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(0),
    (0, class_validator_1.Max)(100000),
    __metadata("design:type", Number)
], UpdateSettingsDto.prototype, "dailyTarget", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ minimum: 0, maximum: 1439 }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(0),
    (0, class_validator_1.Max)(1439),
    __metadata("design:type", Number)
], UpdateSettingsDto.prototype, "objectiveStart", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ minimum: 0, maximum: 1439 }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(0),
    (0, class_validator_1.Max)(1439),
    __metadata("design:type", Number)
], UpdateSettingsDto.prototype, "objectiveEnd", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: 'Europe/Paris' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(60),
    __metadata("design:type", String)
], UpdateSettingsDto.prototype, "objectiveTimezone", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ minimum: 1, maximum: repeat_service_1.REPEAT_LIMITS.maxTimes }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(1),
    (0, class_validator_1.Max)(repeat_service_1.REPEAT_LIMITS.maxTimes),
    __metadata("design:type", Number)
], UpdateSettingsDto.prototype, "repeatTimes", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ minimum: repeat_service_1.REPEAT_LIMITS.minHours, maximum: repeat_service_1.REPEAT_LIMITS.maxHours }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(repeat_service_1.REPEAT_LIMITS.minHours),
    (0, class_validator_1.Max)(repeat_service_1.REPEAT_LIMITS.maxHours),
    __metadata("design:type", Number)
], UpdateSettingsDto.prototype, "repeatEveryHours", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ minimum: 1, maximum: 60 }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(1),
    (0, class_validator_1.Max)(60),
    __metadata("design:type", Number)
], UpdateSettingsDto.prototype, "rateLimitPauseDays", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ enum: ['article', 'group'] }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsIn)(['article', 'group']),
    __metadata("design:type", String)
], UpdateSettingsDto.prototype, "pilotMode", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ enum: ['seo', 'faithful'] }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsIn)(['seo', 'faithful']),
    __metadata("design:type", String)
], UpdateSettingsDto.prototype, "rewriteStyle", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(100),
    __metadata("design:type", String)
], UpdateSettingsDto.prototype, "nstGroupLimited", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(100),
    __metadata("design:type", String)
], UpdateSettingsDto.prototype, "nstGroupCheckpoint", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(100),
    __metadata("design:type", String)
], UpdateSettingsDto.prototype, "nstGroupDisabled", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(100),
    __metadata("design:type", String)
], UpdateSettingsDto.prototype, "nstGroupLoggedOut", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ nullable: true }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.ValidateIf)((_d, v) => v !== null),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(1),
    (0, class_validator_1.Max)(1000),
    __metadata("design:type", Object)
], UpdateSettingsDto.prototype, "cycleMaxPosts", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(1),
    (0, class_validator_1.Max)(168),
    __metadata("design:type", Number)
], UpdateSettingsDto.prototype, "cyclePauseHours", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsBoolean)(),
    __metadata("design:type", Boolean)
], UpdateSettingsDto.prototype, "engagementReview", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsBoolean)(),
    __metadata("design:type", Boolean)
], UpdateSettingsDto.prototype, "adaptivePacing", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ minimum: 2, maximum: 120 }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(2),
    (0, class_validator_1.Max)(120),
    __metadata("design:type", Number)
], UpdateSettingsDto.prototype, "minPostGapMinutes", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ minimum: 0, maximum: 30 }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(0),
    (0, class_validator_1.Max)(30),
    __metadata("design:type", Number)
], UpdateSettingsDto.prototype, "articleParagraphsPerPage", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ minimum: 1, maximum: 100 }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(1),
    (0, class_validator_1.Max)(100),
    __metadata("design:type", Number)
], UpdateSettingsDto.prototype, "articleMaxPages", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ minimum: 0, maximum: 1000 }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(0),
    (0, class_validator_1.Max)(1000),
    __metadata("design:type", Number)
], UpdateSettingsDto.prototype, "articleMinWordsPerPage", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ enum: ['auto', 'openai', 'qwen', 'seedream'] }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsIn)(['auto', 'openai', 'qwen', 'seedream']),
    __metadata("design:type", String)
], UpdateSettingsDto.prototype, "imageProvider", void 0);
//# sourceMappingURL=update-settings.dto.js.map