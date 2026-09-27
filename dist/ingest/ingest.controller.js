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
exports.IngestController = void 0;
const openapi = require("@nestjs/swagger");
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const admin_auth_guard_1 = require("../auth/admin-auth.guard");
const current_user_1 = require("../auth/current-user");
const pagination_dto_1 = require("../common/dto/pagination.dto");
const create_ingest_dto_1 = require("./dto/create-ingest.dto");
const scrape_result_dto_1 = require("./dto/scrape-result.dto");
const ingest_service_1 = require("./ingest.service");
let IngestController = class IngestController {
    ingest;
    constructor(ingest) {
        this.ingest = ingest;
    }
    create(dto, acting) {
        return this.ingest.create(dto, acting);
    }
    findAll(pagination, acting) {
        return this.ingest.findAll(pagination, acting);
    }
    findOne(id, acting) {
        return this.ingest.findOne(id, acting);
    }
    async scrapeResult(id, dto, acting) {
        await this.ingest.submitScrape(id, dto, acting);
        return this.ingest.advance(id);
    }
    retry(id, acting) {
        return this.ingest.retry(id, acting);
    }
    remove(id, acting) {
        return this.ingest.remove(id, acting);
    }
};
exports.IngestController = IngestController;
__decorate([
    (0, common_1.Post)(),
    (0, swagger_1.ApiOperation)({
        summary: 'Enregistrer une reprise à partir d’un post Facebook et de sa source',
        description: 'La reprise attend ensuite la collecte du post d’origine, déposée par ' +
            'l’extension ou, à la main, par `scrape-result`.',
    }),
    openapi.ApiResponse({ status: 201 }),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, current_user_1.ActingUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [create_ingest_dto_1.CreateIngestDto, Object]),
    __metadata("design:returntype", void 0)
], IngestController.prototype, "create", null);
__decorate([
    (0, common_1.Get)(),
    openapi.ApiResponse({ status: 200 }),
    __param(0, (0, common_1.Query)()),
    __param(1, (0, current_user_1.ActingUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [pagination_dto_1.PaginationDto, Object]),
    __metadata("design:returntype", void 0)
], IngestController.prototype, "findAll", null);
__decorate([
    (0, common_1.Get)(':id'),
    openapi.ApiResponse({ status: 200, type: Object }),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, current_user_1.ActingUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], IngestController.prototype, "findOne", null);
__decorate([
    (0, common_1.Post)(':id/scrape-result'),
    (0, swagger_1.ApiOperation)({
        summary: 'Déposer à la main le texte et l’image du post d’origine',
        description: 'Tient lieu d’extension. La réponse attend que la lecture de la page ' +
            'source et la réécriture soient passées : compter une minute.',
    }),
    openapi.ApiResponse({ status: 201 }),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, current_user_1.ActingUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, scrape_result_dto_1.ScrapeResultDto, Object]),
    __metadata("design:returntype", Promise)
], IngestController.prototype, "scrapeResult", null);
__decorate([
    (0, common_1.Post)(':id/retry'),
    (0, swagger_1.ApiOperation)({
        summary: 'Reprendre une reprise en échec là où elle s’est arrêtée',
    }),
    openapi.ApiResponse({ status: 201 }),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, current_user_1.ActingUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], IngestController.prototype, "retry", null);
__decorate([
    (0, common_1.Delete)(':id'),
    openapi.ApiResponse({ status: 200 }),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, current_user_1.ActingUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], IngestController.prototype, "remove", null);
exports.IngestController = IngestController = __decorate([
    (0, swagger_1.ApiTags)('ingest'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.UseGuards)(admin_auth_guard_1.AdminAuthGuard),
    (0, common_1.Controller)('admin/ingest'),
    __metadata("design:paramtypes", [ingest_service_1.IngestService])
], IngestController);
//# sourceMappingURL=ingest.controller.js.map