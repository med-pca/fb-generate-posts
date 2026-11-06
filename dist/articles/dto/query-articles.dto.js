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
Object.defineProperty(exports, "__esModule", { value: true });
exports.QueryArticlesDto = void 0;
const openapi = require("@nestjs/swagger");
const swagger_1 = require("@nestjs/swagger");
const class_validator_1 = require("class-validator");
const pagination_dto_1 = require("../../common/dto/pagination.dto");
class QueryArticlesDto extends pagination_dto_1.PaginationDto {
    search;
    siteId;
    categoryId;
    status;
    archived;
    diffusion;
    from;
    to;
    sort;
    static _OPENAPI_METADATA_FACTORY() {
        return { search: { required: false, type: () => String, maxLength: 200 }, siteId: { required: false, type: () => String }, categoryId: { required: false, type: () => String }, status: { required: false, enum: ["ACTIVE", "INACTIVE"], enum: ['ACTIVE', 'INACTIVE'] }, archived: { required: false, enum: ["yes", "no"], enum: ['yes', 'no'] }, diffusion: { required: false, enum: ["queued", "published", "idle", "failed", "never"], enum: ['queued', 'published', 'idle', 'failed', 'never'] }, from: { required: false, type: () => String }, to: { required: false, type: () => String }, sort: { required: false, enum: ["title", "published", "recent", "oldest", "priority"], enum: ['recent', 'oldest', 'title', 'priority', 'published'] } };
    }
}
exports.QueryArticlesDto = QueryArticlesDto;
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(200),
    __metadata("design:type", String)
], QueryArticlesDto.prototype, "search", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], QueryArticlesDto.prototype, "siteId", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], QueryArticlesDto.prototype, "categoryId", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ enum: ['ACTIVE', 'INACTIVE'] }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsIn)(['ACTIVE', 'INACTIVE']),
    __metadata("design:type", String)
], QueryArticlesDto.prototype, "status", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ enum: ['yes', 'no'] }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsIn)(['yes', 'no']),
    __metadata("design:type", String)
], QueryArticlesDto.prototype, "archived", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ enum: ['queued', 'published', 'idle', 'failed', 'never'] }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsIn)(['queued', 'published', 'idle', 'failed', 'never']),
    __metadata("design:type", String)
], QueryArticlesDto.prototype, "diffusion", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsDateString)(),
    __metadata("design:type", String)
], QueryArticlesDto.prototype, "from", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsDateString)(),
    __metadata("design:type", String)
], QueryArticlesDto.prototype, "to", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ enum: ['recent', 'oldest', 'title', 'priority', 'published'] }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsIn)(['recent', 'oldest', 'title', 'priority', 'published']),
    __metadata("design:type", String)
], QueryArticlesDto.prototype, "sort", void 0);
//# sourceMappingURL=query-articles.dto.js.map