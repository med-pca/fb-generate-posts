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
exports.RunnersController = void 0;
const openapi = require("@nestjs/swagger");
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const admin_auth_guard_1 = require("../auth/admin-auth.guard");
const current_user_1 = require("../auth/current-user");
const update_runner_dto_1 = require("./dto/update-runner.dto");
const runners_service_1 = require("./runners.service");
let RunnersController = class RunnersController {
    runners;
    constructor(runners) {
        this.runners = runners;
    }
    list(acting) {
        return this.runners.list(acting);
    }
    checkPairings(acting) {
        return this.runners.checkPairings(acting);
    }
    updateAll(dto, acting) {
        return this.runners.updateAll(dto, acting);
    }
    pairCode(profileId, acting) {
        return this.runners.createPairCode(profileId, acting);
    }
    update(profileId, dto, acting) {
        return this.runners.update(profileId, dto, acting);
    }
};
exports.RunnersController = RunnersController;
__decorate([
    (0, common_1.Get)(),
    (0, swagger_1.ApiOperation)({
        summary: 'Pilotage de tous les profils, avec leur état en direct',
        description: 'Un profil jamais piloté apparaît à l’arrêt : la ligne de pilotage naît ' +
            'au premier réglage ou au premier battement de son navigateur.',
    }),
    openapi.ApiResponse({ status: 200 }),
    __param(0, (0, current_user_1.ActingUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], RunnersController.prototype, "list", null);
__decorate([
    (0, common_1.Post)('pairing-check'),
    (0, swagger_1.ApiOperation)({
        summary: 'Vérifier l’état réel de tous les appairages',
        description: 'Compare la clé que chaque navigateur détient à la clé actuelle de son ' +
            'compte, l’identifiant NSTBrowser, les battements refusés et les ' +
            'battements réussis. Rend le compte par état et ce qui est à refaire.',
    }),
    openapi.ApiResponse({ status: 201 }),
    __param(0, (0, current_user_1.ActingUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], RunnersController.prototype, "checkPairings", null);
__decorate([
    (0, common_1.Patch)('all'),
    (0, swagger_1.ApiOperation)({
        summary: 'Régler tous les profils d’un coup',
        description: 'Ce qu’on cherche quand quelque chose va mal : tout arrêter sans ouvrir ' +
            'vingt interrupteurs. Pour couper aussi les profils inactifs, utiliser ' +
            'le coupe-circuit global des Paramètres.',
    }),
    openapi.ApiResponse({ status: 200 }),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, current_user_1.ActingUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [update_runner_dto_1.UpdateRunnerDto, Object]),
    __metadata("design:returntype", void 0)
], RunnersController.prototype, "updateAll", null);
__decorate([
    (0, common_1.Post)(':profileId/pair-code'),
    (0, swagger_1.ApiOperation)({
        summary: 'Émettre un code d’appairage pour ce profil',
        description: 'Le code se colle dans l’extension du navigateur qui doit tenir ce ' +
            'profil : il lui apprend l’adresse de l’API, sa clé et lequel des ' +
            'profils il est. Valable 15 minutes, à usage unique.',
    }),
    openapi.ApiResponse({ status: 201 }),
    __param(0, (0, common_1.Param)('profileId')),
    __param(1, (0, current_user_1.ActingUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], RunnersController.prototype, "pairCode", null);
__decorate([
    (0, common_1.Patch)(':profileId'),
    (0, swagger_1.ApiOperation)({ summary: 'Régler le pilotage d’un profil' }),
    openapi.ApiResponse({ status: 200 }),
    __param(0, (0, common_1.Param)('profileId')),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, current_user_1.ActingUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, update_runner_dto_1.UpdateRunnerDto, Object]),
    __metadata("design:returntype", void 0)
], RunnersController.prototype, "update", null);
exports.RunnersController = RunnersController = __decorate([
    (0, swagger_1.ApiTags)('runners'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.UseGuards)(admin_auth_guard_1.AdminAuthGuard),
    (0, common_1.Controller)('runners'),
    __metadata("design:paramtypes", [runners_service_1.RunnersService])
], RunnersController);
//# sourceMappingURL=runners.controller.js.map