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
exports.PerfController = void 0;
const openapi = require("@nestjs/swagger");
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const class_validator_1 = require("class-validator");
const admin_auth_guard_1 = require("../auth/admin-auth.guard");
const admin_role_guard_1 = require("../auth/admin-role.guard");
const perf_service_1 = require("./perf.service");
class PerfSettingsDto {
    enabled;
}
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    (0, class_validator_1.IsBoolean)(),
    __metadata("design:type", Boolean)
], PerfSettingsDto.prototype, "enabled", void 0);
let PerfController = class PerfController {
    perf;
    constructor(perf) {
        this.perf = perf;
    }
    report(hours) {
        return this.perf.report(Number(hours) || 24);
    }
    settings(dto) {
        return this.perf.setEnabled(dto.enabled);
    }
};
exports.PerfController = PerfController;
__decorate([
    openapi.ApiQuery({ name: "hours", required: false }),
    (0, common_1.Get)(),
    (0, swagger_1.ApiOperation)({ summary: '📈 Performance de l’API sur les N dernières heures : routes lentes, coût, SQL, appelants, candidats au cache, appels lents (admin)' }),
    openapi.ApiResponse({ status: 200 }),
    __param(0, (0, common_1.Query)('hours')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], PerfController.prototype, "report", null);
__decorate([
    (0, common_1.Put)('settings'),
    (0, common_1.HttpCode)(200),
    (0, swagger_1.ApiOperation)({ summary: 'Couper ou reprendre la mesure (admin)' }),
    openapi.ApiResponse({ status: 200 }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [PerfSettingsDto]),
    __metadata("design:returntype", void 0)
], PerfController.prototype, "settings", null);
exports.PerfController = PerfController = __decorate([
    (0, swagger_1.ApiTags)('performance'),
    (0, common_1.UseGuards)(admin_auth_guard_1.AdminAuthGuard, admin_role_guard_1.AdminRoleGuard),
    (0, common_1.Controller)('admin/perf'),
    __metadata("design:paramtypes", [perf_service_1.PerfService])
], PerfController);
//# sourceMappingURL=perf.controller.js.map