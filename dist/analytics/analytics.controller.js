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
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AnalyticsController = exports.AnalyticsQueryDto = void 0;
const openapi = require("@nestjs/swagger");
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const class_validator_1 = require("class-validator");
const admin_auth_guard_1 = require("../auth/admin-auth.guard");
const current_user_1 = require("../auth/current-user");
const analytics_service_1 = require("./analytics.service");
class AnalyticsQueryDto {
    from;
    to;
    siteId;
    campaignId;
    categoryId;
    groupId;
    profileId;
    articleId;
    tz;
}
exports.AnalyticsQueryDto = AnalyticsQueryDto;
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Date (AAAA-MM-JJ) ou date-heure ISO' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(40),
    __metadata("design:type", String)
], AnalyticsQueryDto.prototype, "from", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(40),
    __metadata("design:type", String)
], AnalyticsQueryDto.prototype, "to", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], AnalyticsQueryDto.prototype, "siteId", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], AnalyticsQueryDto.prototype, "campaignId", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], AnalyticsQueryDto.prototype, "categoryId", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], AnalyticsQueryDto.prototype, "groupId", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], AnalyticsQueryDto.prototype, "profileId", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], AnalyticsQueryDto.prototype, "articleId", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(60),
    __metadata("design:type", String)
], AnalyticsQueryDto.prototype, "tz", void 0);
let AnalyticsController = class AnalyticsController {
    analytics;
    constructor(analytics) {
        this.analytics = analytics;
    }
    report(q, acting) {
        return this.analytics.report(q, acting);
    }
    async csv(q, acting, reply) {
        const body = await this.analytics.csv(q, acting);
        return reply
            .header('content-type', 'text/csv; charset=utf-8')
            .header('content-disposition', `attachment; filename="analyse-${new Date().toISOString().slice(0, 10)}.csv"`)
            .send(body);
    }
};
exports.AnalyticsController = AnalyticsController;
__decorate([
    (0, common_1.Get)(),
    (0, swagger_1.ApiOperation)({ summary: 'Chiffres clés, courbe, classements, heures et échecs, selon les filtres' }),
    openapi.ApiResponse({ status: 200 }),
    __param(0, (0, common_1.Query)()),
    __param(1, (0, current_user_1.ActingUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [AnalyticsQueryDto, Object]),
    __metadata("design:returntype", void 0)
], AnalyticsController.prototype, "report", null);
__decorate([
    (0, common_1.Get)('export.csv'),
    (0, swagger_1.ApiOperation)({ summary: 'Les publications de la période, en CSV (Excel)' }),
    openapi.ApiResponse({ status: 200 }),
    __param(0, (0, common_1.Query)()),
    __param(1, (0, current_user_1.ActingUser)()),
    __param(2, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [AnalyticsQueryDto, Object, Object]),
    __metadata("design:returntype", Promise)
], AnalyticsController.prototype, "csv", null);
exports.AnalyticsController = AnalyticsController = __decorate([
    (0, swagger_1.ApiTags)('analytics'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.UseGuards)(admin_auth_guard_1.AdminAuthGuard),
    (0, common_1.Controller)('analytics'),
    __metadata("design:paramtypes", [analytics_service_1.AnalyticsService])
], AnalyticsController);
//# sourceMappingURL=analytics.controller.js.map