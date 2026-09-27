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
exports.ControlController = void 0;
const openapi = require("@nestjs/swagger");
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const automation_auth_guard_1 = require("../auth/automation-auth.guard");
const current_user_1 = require("../auth/current-user");
const browser_report_dto_1 = require("./dto/browser-report.dto");
const heartbeat_dto_1 = require("./dto/heartbeat.dto");
const runners_service_1 = require("./runners.service");
let ControlController = class ControlController {
    runners;
    constructor(runners) {
        this.runners = runners;
    }
    control(profileExternalId, acting) {
        return this.runners.control(profileExternalId, acting);
    }
    heartbeat(profileExternalId, dto, acting) {
        return this.runners.heartbeat(profileExternalId, dto, acting);
    }
    launcher(acting) {
        return this.runners.launcherPlan(acting);
    }
    reportBrowser(profileExternalId, dto, acting) {
        return this.runners.reportBrowser(profileExternalId, dto, acting);
    }
};
exports.ControlController = ControlController;
__decorate([
    (0, common_1.Get)('profile/:profileExternalId'),
    (0, swagger_1.ApiOperation)({
        summary: 'Ce profil doit-il publier maintenant ?',
        description: 'Rend l’ordre, sa raison, le délai avant de redemander, et les réglages ' +
            'poussés depuis l’admin. Ne modifie rien.',
    }),
    openapi.ApiResponse({ status: 200, type: Object }),
    __param(0, (0, common_1.Param)('profileExternalId')),
    __param(1, (0, current_user_1.ActingUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], ControlController.prototype, "control", null);
__decorate([
    (0, common_1.Post)('profile/:profileExternalId/heartbeat'),
    (0, swagger_1.ApiOperation)({
        summary: 'Battement de l’extension : elle rapporte, et reçoit l’ordre',
        description: 'Un seul aller-retour par minute : un état sans ordre obligerait à un ' +
            'second appel, un ordre sans état laisserait l’admin aveugle.',
    }),
    openapi.ApiResponse({ status: 201, type: Object }),
    __param(0, (0, common_1.Param)('profileExternalId')),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, current_user_1.ActingUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, heartbeat_dto_1.HeartbeatDto, Object]),
    __metadata("design:returntype", void 0)
], ControlController.prototype, "heartbeat", null);
__decorate([
    (0, common_1.Get)('launcher'),
    (0, swagger_1.ApiOperation)({
        summary: 'Quels navigateurs ouvrir, lesquels refermer',
        description: 'Pour l’agent local. `mayClose` est distinct de `shouldRun` : une ' +
            'extension en train de publier ne doit pas voir son navigateur se ' +
            'fermer sous elle, même quand l’ordre vient de passer à l’arrêt.',
    }),
    openapi.ApiResponse({ status: 200 }),
    __param(0, (0, current_user_1.ActingUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], ControlController.prototype, "launcher", null);
__decorate([
    (0, common_1.Post)('launcher/:profileExternalId'),
    (0, swagger_1.ApiOperation)({ summary: 'L’agent local dit ce qu’il a fait du navigateur' }),
    openapi.ApiResponse({ status: 201, type: Object }),
    __param(0, (0, common_1.Param)('profileExternalId')),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, current_user_1.ActingUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, browser_report_dto_1.BrowserReportDto, Object]),
    __metadata("design:returntype", void 0)
], ControlController.prototype, "reportBrowser", null);
exports.ControlController = ControlController = __decorate([
    (0, swagger_1.ApiTags)('control'),
    (0, swagger_1.ApiHeader)({ name: 'X-API-Key', required: true }),
    (0, common_1.UseGuards)(automation_auth_guard_1.AutomationAuthGuard),
    (0, common_1.Controller)('control'),
    __metadata("design:paramtypes", [runners_service_1.RunnersService])
], ControlController);
//# sourceMappingURL=control.controller.js.map