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
exports.ResetController = exports.InsightsController = void 0;
const openapi = require("@nestjs/swagger");
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const class_validator_1 = require("class-validator");
const admin_auth_guard_1 = require("../auth/admin-auth.guard");
const admin_role_guard_1 = require("../auth/admin-role.guard");
const current_user_1 = require("../auth/current-user");
const insights_service_1 = require("./insights.service");
const reset_service_1 = require("./reset.service");
class ResetDto {
    posts;
    articles;
    articlePosts;
    unarchive;
    confirm;
    dryRun;
    force;
}
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsBoolean)(),
    __metadata("design:type", Boolean)
], ResetDto.prototype, "posts", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsBoolean)(),
    __metadata("design:type", Boolean)
], ResetDto.prototype, "articles", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsIn)(['delete', 'keep']),
    __metadata("design:type", String)
], ResetDto.prototype, "articlePosts", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsBoolean)(),
    __metadata("design:type", Boolean)
], ResetDto.prototype, "unarchive", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], ResetDto.prototype, "confirm", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsBoolean)(),
    __metadata("design:type", Boolean)
], ResetDto.prototype, "dryRun", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsBoolean)(),
    __metadata("design:type", Boolean)
], ResetDto.prototype, "force", void 0);
let InsightsController = class InsightsController {
    insights;
    constructor(insights) {
        this.insights = insights;
    }
    counters(acting) {
        return this.insights.counters(acting);
    }
    profiles(acting) {
        return this.insights.profileStats(acting);
    }
    objective(acting) {
        return this.insights.objective(acting);
    }
};
exports.InsightsController = InsightsController;
__decorate([
    (0, common_1.Get)('counters'),
    (0, swagger_1.ApiOperation)({ summary: 'Les compteurs du menu' }),
    openapi.ApiResponse({ status: 200 }),
    __param(0, (0, current_user_1.ActingUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], InsightsController.prototype, "counters", null);
__decorate([
    (0, common_1.Get)('profiles'),
    (0, swagger_1.ApiOperation)({
        summary: 'Statistiques de chaque profil',
        description: 'Publications du jour, de la semaine, au total ; échecs ; groupes ' +
            'rejoints ou en attente ; stock qui l’attend.',
    }),
    openapi.ApiResponse({ status: 200, type: Object }),
    __param(0, (0, current_user_1.ActingUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], InsightsController.prototype, "profiles", null);
__decorate([
    (0, common_1.Get)('objective'),
    (0, swagger_1.ApiOperation)({
        summary: 'L’objectif du jour, en temps réel',
        description: 'Où l’on en est par rapport à l’objectif et à l’heure, le stock prêt, ' +
            'les articles à importer, la répartition par catégorie, groupe et profil.',
    }),
    openapi.ApiResponse({ status: 200 }),
    __param(0, (0, current_user_1.ActingUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], InsightsController.prototype, "objective", null);
exports.InsightsController = InsightsController = __decorate([
    (0, swagger_1.ApiTags)('insights'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.UseGuards)(admin_auth_guard_1.AdminAuthGuard),
    (0, common_1.Controller)('insights'),
    __metadata("design:paramtypes", [insights_service_1.InsightsService])
], InsightsController);
let ResetController = class ResetController {
    resets;
    constructor(resets) {
        this.resets = resets;
    }
    reset(dto, acting) {
        return this.resets.reset(dto, acting);
    }
};
exports.ResetController = ResetController;
__decorate([
    (0, common_1.Post)(),
    (0, common_1.HttpCode)(200),
    (0, swagger_1.ApiOperation)({
        summary: 'Effacer les posts, les articles, ou les deux (ADMIN)',
        description: '`posts` et/ou `articles` disent quoi effacer. Articles seuls : ' +
            '`articlePosts: "delete"` supprime aussi leurs posts, `"keep"` les garde ' +
            'détachés (obligatoire s’il y en a). Posts seuls : `unarchive: true` rend ' +
            `les articles réutilisables. \`dryRun: true\` compte et dit le plan ; sinon ` +
            `\`confirm: "${reset_service_1.RESET_CONFIRMATION}"\` est exigé. Refusé pendant qu’un lot ` +
            'se publie si des posts sont supprimés, sauf `force: true`.',
    }),
    openapi.ApiResponse({ status: 200, type: Object }),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, current_user_1.ActingUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [ResetDto, Object]),
    __metadata("design:returntype", void 0)
], ResetController.prototype, "reset", null);
exports.ResetController = ResetController = __decorate([
    (0, swagger_1.ApiTags)('admin'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.UseGuards)(admin_auth_guard_1.AdminAuthGuard, admin_role_guard_1.AdminRoleGuard),
    (0, common_1.Controller)('admin/reset'),
    __metadata("design:paramtypes", [reset_service_1.ResetService])
], ResetController);
//# sourceMappingURL=insights.controller.js.map