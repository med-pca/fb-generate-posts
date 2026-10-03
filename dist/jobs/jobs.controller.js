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
exports.JobsController = void 0;
const openapi = require("@nestjs/swagger");
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const automation_auth_guard_1 = require("../auth/automation-auth.guard");
const current_user_1 = require("../auth/current-user");
const claim_job_dto_1 = require("./dto/claim-job.dto");
const claim_batch_dto_1 = require("./dto/claim-batch.dto");
const comment_job_item_dto_1 = require("./dto/comment-job-item.dto");
const fail_job_item_dto_1 = require("./dto/fail-job-item.dto");
const link_updated_job_item_dto_1 = require("./dto/link-updated-job-item.dto");
const publish_job_item_dto_1 = require("./dto/publish-job-item.dto");
const jobs_service_1 = require("./jobs.service");
let JobsController = class JobsController {
    jobs;
    constructor(jobs) {
        this.jobs = jobs;
    }
    listProfiles(acting) {
        return this.jobs.listAutomationProfiles(acting);
    }
    claim(dto, acting) {
        return this.jobs.claim(dto, acting);
    }
    claimBatch(dto, acting) {
        return this.jobs.claimBatch(dto, acting);
    }
    pendingLinkUpdates(acting, profileExternalId, limit) {
        const parsed = Number(limit);
        return this.jobs.pendingLinkUpdates(profileExternalId, Number.isInteger(parsed) && parsed > 0 ? Math.min(parsed, 200) : 50, acting);
    }
    claimByProfileExternalId(profileExternalId, acting, groupExternalId) {
        return this.jobs.claimByProfileExternalId(profileExternalId, groupExternalId, acting);
    }
    consumed(jobId, postId, acting) {
        return this.jobs.markConsumed(jobId, postId, acting);
    }
    published(jobId, postId, dto, acting) {
        return this.jobs.markPublished(jobId, postId, dto, acting);
    }
    failed(jobId, postId, dto, acting) {
        return this.jobs.markFailed(jobId, postId, dto.error, acting);
    }
    commented(jobId, postId, dto, acting) {
        return this.jobs.markCommented(jobId, postId, dto, acting);
    }
    release(jobId, acting) {
        return this.jobs.release(jobId, acting, 'repris par l’extension');
    }
    complete(jobId, acting) {
        return this.jobs.complete(jobId, acting);
    }
    linkUpdates(jobId, acting) {
        return this.jobs.linkUpdates(jobId, acting);
    }
    linkUpdated(jobId, postId, dto, acting) {
        return this.jobs.markLinkUpdated(jobId, postId, dto, acting);
    }
};
exports.JobsController = JobsController;
__decorate([
    (0, common_1.Get)('profiles'),
    (0, swagger_1.ApiOperation)({
        summary: 'Profils actifs que l’automatisation peut traiter',
        description: 'Permet à un worker de découvrir les profils sans avoir besoin des ' +
            'droits admin : seuls le nom et l’externalId sont exposés.',
    }),
    openapi.ApiResponse({ status: 200, type: Object }),
    __param(0, (0, current_user_1.ActingUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], JobsController.prototype, "listProfiles", null);
__decorate([
    (0, common_1.Post)('claim'),
    openapi.ApiResponse({ status: 201, type: Object }),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, current_user_1.ActingUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [claim_job_dto_1.ClaimJobDto, Object]),
    __metadata("design:returntype", void 0)
], JobsController.prototype, "claim", null);
__decorate([
    (0, common_1.Post)('claim/batch'),
    (0, swagger_1.ApiOperation)({
        summary: 'Réserver un job par profil, pour traiter plusieurs lots en parallèle',
        description: 'Rend au plus un job par profil actif (10 par défaut). Un profil qui ' +
            'tient déjà un job non expiré est écarté : deux threads ne doivent ' +
            'jamais piloter le même compte en même temps.',
    }),
    openapi.ApiResponse({ status: 201, type: Object }),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, current_user_1.ActingUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [claim_batch_dto_1.ClaimBatchDto, Object]),
    __metadata("design:returntype", void 0)
], JobsController.prototype, "claimBatch", null);
__decorate([
    (0, common_1.Get)('link-updates'),
    (0, swagger_1.ApiOperation)({
        summary: 'Commentaires en attente d’URL, tous jobs clôturés confondus',
    }),
    (0, swagger_1.ApiQuery)({ name: 'profileExternalId', required: false }),
    (0, swagger_1.ApiQuery)({ name: 'limit', required: false, example: 50 }),
    openapi.ApiResponse({ status: 200 }),
    __param(0, (0, current_user_1.ActingUser)()),
    __param(1, (0, common_1.Query)('profileExternalId')),
    __param(2, (0, common_1.Query)('limit')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String]),
    __metadata("design:returntype", void 0)
], JobsController.prototype, "pendingLinkUpdates", null);
__decorate([
    (0, common_1.Post)('claim/profile/:profileExternalId'),
    (0, swagger_1.ApiOperation)({
        summary: 'Réserver des posts avec l’identifiant externe du profil',
    }),
    (0, swagger_1.ApiParam)({ name: 'profileExternalId', example: 'demo-profile' }),
    (0, swagger_1.ApiQuery)({
        name: 'groupExternalId',
        required: false,
        description: 'Si absent, un groupe lié ayant des posts disponibles est choisi automatiquement',
    }),
    openapi.ApiResponse({ status: 201, type: Object }),
    __param(0, (0, common_1.Param)('profileExternalId')),
    __param(1, (0, current_user_1.ActingUser)()),
    __param(2, (0, common_1.Query)('groupExternalId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, String]),
    __metadata("design:returntype", void 0)
], JobsController.prototype, "claimByProfileExternalId", null);
__decorate([
    (0, common_1.Post)(':jobId/posts/:postId/consumed'),
    openapi.ApiResponse({ status: 201 }),
    __param(0, (0, common_1.Param)('jobId')),
    __param(1, (0, common_1.Param)('postId')),
    __param(2, (0, current_user_1.ActingUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, Object]),
    __metadata("design:returntype", void 0)
], JobsController.prototype, "consumed", null);
__decorate([
    (0, common_1.Post)(':jobId/posts/:postId/published'),
    openapi.ApiResponse({ status: 201 }),
    __param(0, (0, common_1.Param)('jobId')),
    __param(1, (0, common_1.Param)('postId')),
    __param(2, (0, common_1.Body)()),
    __param(3, (0, current_user_1.ActingUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, publish_job_item_dto_1.PublishJobItemDto, Object]),
    __metadata("design:returntype", void 0)
], JobsController.prototype, "published", null);
__decorate([
    (0, common_1.Post)(':jobId/posts/:postId/failed'),
    openapi.ApiResponse({ status: 201 }),
    __param(0, (0, common_1.Param)('jobId')),
    __param(1, (0, common_1.Param)('postId')),
    __param(2, (0, common_1.Body)()),
    __param(3, (0, current_user_1.ActingUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, fail_job_item_dto_1.FailJobItemDto, Object]),
    __metadata("design:returntype", void 0)
], JobsController.prototype, "failed", null);
__decorate([
    (0, common_1.Post)(':jobId/posts/:postId/commented'),
    (0, swagger_1.ApiOperation)({
        summary: 'Enregistrer le commentaire posé sous le post (description seule)',
        description: 'À appeler après `published`. L’identifiant du commentaire est ' +
            'obligatoire : c’est lui qui permettra d’y placer l’URL ensuite.',
    }),
    openapi.ApiResponse({ status: 201 }),
    __param(0, (0, common_1.Param)('jobId')),
    __param(1, (0, common_1.Param)('postId')),
    __param(2, (0, common_1.Body)()),
    __param(3, (0, current_user_1.ActingUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, comment_job_item_dto_1.CommentJobItemDto, Object]),
    __metadata("design:returntype", void 0)
], JobsController.prototype, "commented", null);
__decorate([
    (0, common_1.Post)(':jobId/release'),
    (0, common_1.HttpCode)(200),
    (0, swagger_1.ApiOperation)({
        summary: 'Libérer un lot que plus personne ne traite',
        description: 'Ses posts pas encore commencés retournent dans la file ; le profil ' +
            'peut réserver à nouveau. Utilisé par l’extension quand elle retrouve ' +
            'un lot qu’elle a oublié (réinstallée en plein lot).',
    }),
    openapi.ApiResponse({ status: 200 }),
    __param(0, (0, common_1.Param)('jobId')),
    __param(1, (0, current_user_1.ActingUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], JobsController.prototype, "release", null);
__decorate([
    (0, common_1.Post)(':jobId/complete'),
    (0, swagger_1.ApiOperation)({
        summary: 'Clôturer le lot et ouvrir la phase de bascule des commentaires',
    }),
    openapi.ApiResponse({ status: 201 }),
    __param(0, (0, common_1.Param)('jobId')),
    __param(1, (0, current_user_1.ActingUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], JobsController.prototype, "complete", null);
__decorate([
    (0, common_1.Get)(':jobId/link-updates'),
    (0, swagger_1.ApiOperation)({
        summary: 'URL à placer dans les commentaires de ce job, une fois clôturé',
    }),
    openapi.ApiResponse({ status: 200 }),
    __param(0, (0, common_1.Param)('jobId')),
    __param(1, (0, current_user_1.ActingUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], JobsController.prototype, "linkUpdates", null);
__decorate([
    (0, common_1.Post)(':jobId/posts/:postId/link-updated'),
    (0, swagger_1.ApiOperation)({
        summary: 'Confirmer que le commentaire porte désormais l’URL',
    }),
    openapi.ApiResponse({ status: 201 }),
    __param(0, (0, common_1.Param)('jobId')),
    __param(1, (0, common_1.Param)('postId')),
    __param(2, (0, common_1.Body)()),
    __param(3, (0, current_user_1.ActingUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, link_updated_job_item_dto_1.LinkUpdatedJobItemDto, Object]),
    __metadata("design:returntype", void 0)
], JobsController.prototype, "linkUpdated", null);
exports.JobsController = JobsController = __decorate([
    (0, swagger_1.ApiTags)('jobs'),
    (0, swagger_1.ApiHeader)({ name: 'X-API-Key', required: true }),
    (0, common_1.UseGuards)(automation_auth_guard_1.AutomationAuthGuard),
    (0, common_1.Controller)('jobs'),
    __metadata("design:paramtypes", [jobs_service_1.JobsService])
], JobsController);
//# sourceMappingURL=jobs.controller.js.map