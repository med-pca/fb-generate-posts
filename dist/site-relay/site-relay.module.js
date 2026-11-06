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
exports.SiteRelayModule = exports.SiteRelayController = exports.ArticleCopiesController = exports.CopyArticlesDto = exports.PauseSiteDto = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const class_validator_1 = require("class-validator");
const admin_auth_guard_1 = require("../auth/admin-auth.guard");
const current_user_1 = require("../auth/current-user");
const ingest_module_1 = require("../ingest/ingest.module");
const wordpress_module_1 = require("../wordpress/wordpress.module");
const site_relay_service_1 = require("./site-relay.service");
class PauseSiteDto {
    reason;
    relaySiteId;
}
exports.PauseSiteDto = PauseSiteDto;
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: 'limite' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(200),
    __metadata("design:type", String)
], PauseSiteDto.prototype, "reason", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(64),
    __metadata("design:type", String)
], PauseSiteDto.prototype, "relaySiteId", void 0);
class CopyArticlesDto {
    articleIds;
    targetSiteId;
    posts;
}
exports.CopyArticlesDto = CopyArticlesDto;
__decorate([
    (0, swagger_1.ApiProperty)({ type: [String] }),
    (0, class_validator_1.IsArray)(),
    (0, class_validator_1.ArrayMinSize)(1),
    (0, class_validator_1.ArrayMaxSize)(500),
    (0, class_validator_1.IsString)({ each: true }),
    __metadata("design:type", Array)
], CopyArticlesDto.prototype, "articleIds", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(64),
    __metadata("design:type", String)
], CopyArticlesDto.prototype, "targetSiteId", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ enum: ['new', 'move'] }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsIn)(['new', 'move']),
    __metadata("design:type", String)
], CopyArticlesDto.prototype, "posts", void 0);
let ArticleCopiesController = class ArticleCopiesController {
    relay;
    constructor(relay) {
        this.relay = relay;
    }
    copy(dto, acting) {
        return this.relay.copyArticles(dto, acting);
    }
    status(ids, acting) {
        return this.relay.copies(String(ids ?? '').split(',').map((x) => x.trim()).filter(Boolean), acting);
    }
};
exports.ArticleCopiesController = ArticleCopiesController;
__decorate([
    (0, common_1.Post)(),
    (0, common_1.HttpCode)(200),
    (0, swagger_1.ApiOperation)({
        summary: '📋 Copier des articles vers un autre site (même slug), avec de nouveaux posts ou en y déplaçant les posts en attente',
    }),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, current_user_1.ActingUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [CopyArticlesDto, Object]),
    __metadata("design:returntype", void 0)
], ArticleCopiesController.prototype, "copy", null);
__decorate([
    (0, common_1.Get)(),
    (0, swagger_1.ApiOperation)({ summary: 'Où en sont des copies : ?ids=a,b,c' }),
    __param(0, (0, common_1.Query)('ids')),
    __param(1, (0, current_user_1.ActingUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], ArticleCopiesController.prototype, "status", null);
exports.ArticleCopiesController = ArticleCopiesController = __decorate([
    (0, swagger_1.ApiTags)('articles'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.UseGuards)(admin_auth_guard_1.AdminAuthGuard),
    (0, common_1.Controller)('article-copies'),
    __metadata("design:paramtypes", [site_relay_service_1.SiteRelayService])
], ArticleCopiesController);
let SiteRelayController = class SiteRelayController {
    relay;
    constructor(relay) {
        this.relay = relay;
    }
    detail(id, acting) {
        return this.relay.detail(id, acting);
    }
    pause(id, dto, acting) {
        return this.relay.pause(id, dto, acting);
    }
    resume(id, acting) {
        return this.relay.resume(id, acting);
    }
    retry(id, acting) {
        return this.relay.retry(id, acting);
    }
    redirect(id, acting) {
        return this.relay.redirectNow(id, acting);
    }
};
exports.SiteRelayController = SiteRelayController;
__decorate([
    (0, common_1.Get)(),
    (0, swagger_1.ApiOperation)({ summary: 'Pause et relais d’un site : copies, redirection' }),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, current_user_1.ActingUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], SiteRelayController.prototype, "detail", null);
__decorate([
    (0, common_1.Post)('pause'),
    (0, common_1.HttpCode)(200),
    (0, swagger_1.ApiOperation)({
        summary: '⏸ Mettre un site en pause (limite), avec ou sans relais',
        description: 'Ses posts ne partent plus. Avec `relaySiteId`, ses articles sont copiés sur ce site (même slug), ' +
            'leurs posts en attente y sont déplacés, puis le site en pause redirige ses visiteurs vers lui (302).',
    }),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, current_user_1.ActingUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, PauseSiteDto, Object]),
    __metadata("design:returntype", void 0)
], SiteRelayController.prototype, "pause", null);
__decorate([
    (0, common_1.Post)('resume'),
    (0, common_1.HttpCode)(200),
    (0, swagger_1.ApiOperation)({ summary: '▶ Réactiver un site en pause : la redirection est retirée' }),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, current_user_1.ActingUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], SiteRelayController.prototype, "resume", null);
__decorate([
    (0, common_1.Post)('retry'),
    (0, common_1.HttpCode)(200),
    (0, swagger_1.ApiOperation)({ summary: 'Relancer les copies en erreur vers le relais' }),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, current_user_1.ActingUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], SiteRelayController.prototype, "retry", null);
__decorate([
    (0, common_1.Post)('redirect'),
    (0, common_1.HttpCode)(200),
    (0, swagger_1.ApiOperation)({ summary: 'Poser la redirection vers le relais sans attendre la fin des copies' }),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, current_user_1.ActingUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], SiteRelayController.prototype, "redirect", null);
exports.SiteRelayController = SiteRelayController = __decorate([
    (0, swagger_1.ApiTags)('sites'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.UseGuards)(admin_auth_guard_1.AdminAuthGuard),
    (0, common_1.Controller)('sites/:id/relay'),
    __metadata("design:paramtypes", [site_relay_service_1.SiteRelayService])
], SiteRelayController);
let SiteRelayModule = class SiteRelayModule {
};
exports.SiteRelayModule = SiteRelayModule;
exports.SiteRelayModule = SiteRelayModule = __decorate([
    (0, common_1.Module)({
        imports: [wordpress_module_1.WordpressModule, ingest_module_1.IngestModule],
        controllers: [SiteRelayController, ArticleCopiesController],
        providers: [site_relay_service_1.SiteRelayService],
    })
], SiteRelayModule);
//# sourceMappingURL=site-relay.module.js.map