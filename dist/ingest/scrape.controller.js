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
exports.ScrapeController = void 0;
const openapi = require("@nestjs/swagger");
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const automation_auth_guard_1 = require("../auth/automation-auth.guard");
const capture_ingest_dto_1 = require("./dto/capture-ingest.dto");
const fail_scrape_dto_1 = require("./dto/fail-scrape.dto");
const scrape_result_dto_1 = require("./dto/scrape-result.dto");
const ingest_service_1 = require("./ingest.service");
let ScrapeController = class ScrapeController {
    ingest;
    constructor(ingest) {
        this.ingest = ingest;
    }
    async capture(dto) {
        const ingest = await this.ingest.capture(dto);
        void this.ingest.advance(ingest.id).catch(() => undefined);
        return {
            accepted: true,
            ingestId: ingest.id,
            status: ingest.status,
            followUrl: `/admin/ingest/${ingest.id}`,
        };
    }
    claim(profileExternalId) {
        return this.ingest.claimScrape(profileExternalId);
    }
    async result(id, dto) {
        const ingest = await this.ingest.submitScrape(id, dto);
        void this.ingest.advance(id).catch(() => undefined);
        return { accepted: true, ingestId: ingest.id, status: ingest.status };
    }
    failed(id, dto) {
        return this.ingest.failScrape(id, dto.error);
    }
};
exports.ScrapeController = ScrapeController;
__decorate([
    (0, common_1.Post)('capture'),
    (0, swagger_1.ApiOperation)({
        summary: 'Reprendre une publication en un seul appel',
        description: 'Le chemin de l’extension : l’utilisateur est devant la publication ' +
            'et décide de la reprendre. Rend la main tout de suite ; la lecture ' +
            'de la source, la réécriture et le dépôt WordPress suivent côté ' +
            'serveur. Suivre l’avancement sur /admin/ingest/:id.',
    }),
    openapi.ApiResponse({ status: 201 }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [capture_ingest_dto_1.CaptureIngestDto]),
    __metadata("design:returntype", Promise)
], ScrapeController.prototype, "capture", null);
__decorate([
    (0, common_1.Post)('claim'),
    (0, swagger_1.ApiOperation)({
        summary: 'Réserver une publication à relever',
        description: 'Rend une reprise en attente, ou `scrape: null`. La réservation ' +
            'expire après CLAIM_TTL_MINUTES et la reprise revient d’elle-même ' +
            'dans la file.',
    }),
    (0, swagger_1.ApiQuery)({ name: 'profileExternalId', required: false }),
    openapi.ApiResponse({ status: 201, type: Object }),
    __param(0, (0, common_1.Query)('profileExternalId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], ScrapeController.prototype, "claim", null);
__decorate([
    (0, common_1.Post)(':id/result'),
    (0, swagger_1.ApiOperation)({
        summary: 'Rendre le texte et l’image de la publication',
        description: 'Rend la main tout de suite : la lecture de la page source, la ' +
            'réécriture et le dépôt WordPress prennent une minute, et l’extension ' +
            'a d’autres lots à traiter. Suivre l’avancement sur /admin/ingest/:id.',
    }),
    openapi.ApiResponse({ status: 201 }),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, scrape_result_dto_1.ScrapeResultDto]),
    __metadata("design:returntype", Promise)
], ScrapeController.prototype, "result", null);
__decorate([
    (0, common_1.Post)(':id/failed'),
    (0, swagger_1.ApiOperation)({ summary: 'Signaler une publication impossible à relever' }),
    openapi.ApiResponse({ status: 201 }),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, fail_scrape_dto_1.FailScrapeDto]),
    __metadata("design:returntype", void 0)
], ScrapeController.prototype, "failed", null);
exports.ScrapeController = ScrapeController = __decorate([
    (0, swagger_1.ApiTags)('jobs'),
    (0, swagger_1.ApiHeader)({ name: 'X-API-Key', required: true }),
    (0, common_1.UseGuards)(automation_auth_guard_1.AutomationAuthGuard),
    (0, common_1.Controller)('jobs/scrape'),
    __metadata("design:paramtypes", [ingest_service_1.IngestService])
], ScrapeController);
//# sourceMappingURL=scrape.controller.js.map