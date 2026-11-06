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
exports.QueryGroupsDto = void 0;
const openapi = require("@nestjs/swagger");
const swagger_1 = require("@nestjs/swagger");
const class_validator_1 = require("class-validator");
const pagination_dto_1 = require("../../common/dto/pagination.dto");
class QueryGroupsDto extends pagination_dto_1.PaginationDto {
    search;
    categoryId;
    status;
    language;
    profileId;
    join;
    stock;
    sort;
    static _OPENAPI_METADATA_FACTORY() {
        return { search: { required: false, type: () => String, maxLength: 200 }, categoryId: { required: false, type: () => String }, status: { required: false, enum: ["ACTIVE", "INACTIVE"], enum: ['ACTIVE', 'INACTIVE'] }, language: { required: false, type: () => String, maxLength: 12 }, profileId: { required: false, type: () => String }, join: { required: false, enum: ["none", "joined", "pending"], enum: ['joined', 'none', 'pending'] }, stock: { required: false, enum: ["with", "none"], enum: ['with', 'none'] }, sort: { required: false, enum: ["name", "recent", "priority"], enum: ['recent', 'name', 'priority'] } };
    }
}
exports.QueryGroupsDto = QueryGroupsDto;
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(200),
    __metadata("design:type", String)
], QueryGroupsDto.prototype, "search", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], QueryGroupsDto.prototype, "categoryId", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ enum: ['ACTIVE', 'INACTIVE'] }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsIn)(['ACTIVE', 'INACTIVE']),
    __metadata("design:type", String)
], QueryGroupsDto.prototype, "status", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(12),
    __metadata("design:type", String)
], QueryGroupsDto.prototype, "language", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], QueryGroupsDto.prototype, "profileId", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ enum: ['joined', 'none', 'pending'] }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsIn)(['joined', 'none', 'pending']),
    __metadata("design:type", String)
], QueryGroupsDto.prototype, "join", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ enum: ['with', 'none'] }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsIn)(['with', 'none']),
    __metadata("design:type", String)
], QueryGroupsDto.prototype, "stock", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ enum: ['recent', 'name', 'priority'] }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsIn)(['recent', 'name', 'priority']),
    __metadata("design:type", String)
], QueryGroupsDto.prototype, "sort", void 0);
//# sourceMappingURL=query-groups.dto.js.map