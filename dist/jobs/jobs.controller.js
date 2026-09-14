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
const claim_job_dto_1 = require("./dto/claim-job.dto");
const fail_job_item_dto_1 = require("./dto/fail-job-item.dto");
const publish_job_item_dto_1 = require("./dto/publish-job-item.dto");
const jobs_service_1 = require("./jobs.service");
let JobsController = class JobsController {
    jobs;
    constructor(jobs) {
        this.jobs = jobs;
    }
    listProfiles() {
        return this.jobs.listAutomationProfiles();
    }
    claim(dto) {
        return this.jobs.claim(dto);
    }
    claimByProfileExternalId(profileExternalId, groupExternalId) {
        return this.jobs.claimByProfileExternalId(profileExternalId, groupExternalId);
    }
    consumed(jobId, postId) {
        return this.jobs.markConsumed(jobId, postId);
    }
    published(jobId, postId, dto) {
        return this.jobs.markPublished(jobId, postId, dto);
    }
    failed(jobId, postId, dto) {
        return this.jobs.markFailed(jobId, postId, dto.error);
    }
    complete(jobId) {
        return this.jobs.complete(jobId);
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
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], JobsController.prototype, "listProfiles", null);
__decorate([
    (0, common_1.Post)('claim'),
    openapi.ApiResponse({ status: 201, type: Object }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [claim_job_dto_1.ClaimJobDto]),
    __metadata("design:returntype", void 0)
], JobsController.prototype, "claim", null);
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
    __param(1, (0, common_1.Query)('groupExternalId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", void 0)
], JobsController.prototype, "claimByProfileExternalId", null);
__decorate([
    (0, common_1.Post)(':jobId/posts/:postId/consumed'),
    openapi.ApiResponse({ status: 201 }),
    __param(0, (0, common_1.Param)('jobId')),
    __param(1, (0, common_1.Param)('postId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", void 0)
], JobsController.prototype, "consumed", null);
__decorate([
    (0, common_1.Post)(':jobId/posts/:postId/published'),
    openapi.ApiResponse({ status: 201 }),
    __param(0, (0, common_1.Param)('jobId')),
    __param(1, (0, common_1.Param)('postId')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, publish_job_item_dto_1.PublishJobItemDto]),
    __metadata("design:returntype", void 0)
], JobsController.prototype, "published", null);
__decorate([
    (0, common_1.Post)(':jobId/posts/:postId/failed'),
    openapi.ApiResponse({ status: 201 }),
    __param(0, (0, common_1.Param)('jobId')),
    __param(1, (0, common_1.Param)('postId')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, fail_job_item_dto_1.FailJobItemDto]),
    __metadata("design:returntype", void 0)
], JobsController.prototype, "failed", null);
__decorate([
    (0, common_1.Post)(':jobId/complete'),
    openapi.ApiResponse({ status: 201 }),
    __param(0, (0, common_1.Param)('jobId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], JobsController.prototype, "complete", null);
exports.JobsController = JobsController = __decorate([
    (0, swagger_1.ApiTags)('jobs'),
    (0, swagger_1.ApiHeader)({ name: 'X-API-Key', required: true }),
    (0, common_1.UseGuards)(automation_auth_guard_1.AutomationAuthGuard),
    (0, common_1.Controller)('jobs'),
    __metadata("design:paramtypes", [jobs_service_1.JobsService])
], JobsController);
//# sourceMappingURL=jobs.controller.js.map