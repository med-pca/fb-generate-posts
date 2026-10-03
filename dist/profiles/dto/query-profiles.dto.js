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
exports.DeactivateProfileDto = exports.QueryProfilesDto = void 0;
const openapi = require("@nestjs/swagger");
const swagger_1 = require("@nestjs/swagger");
const class_validator_1 = require("class-validator");
const pagination_dto_1 = require("../../common/dto/pagination.dto");
class QueryProfilesDto extends pagination_dto_1.PaginationDto {
    search;
    status;
    health;
    activity;
    categoryId;
    sort;
    static _OPENAPI_METADATA_FACTORY() {
        return { search: { required: false, type: () => String, maxLength: 200 }, status: { required: false, enum: ["ACTIVE", "INACTIVE"], enum: ['ACTIVE', 'INACTIVE'] }, health: { required: false, enum: ["good", "watch", "bad", "new", "deactivate"], enum: ['good', 'watch', 'bad', 'new', 'deactivate'] }, activity: { required: false, enum: ["running", "off"], enum: ['running', 'off'] }, categoryId: { required: false, type: () => String }, sort: { required: false, enum: ["name", "published", "recent", "score", "failures"], enum: ['recent', 'name', 'score', 'failures', 'published'] } };
    }
}
exports.QueryProfilesDto = QueryProfilesDto;
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(200),
    __metadata("design:type", String)
], QueryProfilesDto.prototype, "search", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ enum: ['ACTIVE', 'INACTIVE'] }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsIn)(['ACTIVE', 'INACTIVE']),
    __metadata("design:type", String)
], QueryProfilesDto.prototype, "status", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ enum: ['good', 'watch', 'bad', 'new', 'deactivate'] }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsIn)(['good', 'watch', 'bad', 'new', 'deactivate']),
    __metadata("design:type", String)
], QueryProfilesDto.prototype, "health", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ enum: ['running', 'off'] }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsIn)(['running', 'off']),
    __metadata("design:type", String)
], QueryProfilesDto.prototype, "activity", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], QueryProfilesDto.prototype, "categoryId", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ enum: ['recent', 'name', 'score', 'failures', 'published'] }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsIn)(['recent', 'name', 'score', 'failures', 'published']),
    __metadata("design:type", String)
], QueryProfilesDto.prototype, "sort", void 0);
class DeactivateProfileDto {
    transferTo;
    static _OPENAPI_METADATA_FACTORY() {
        return { transferTo: { required: false, type: () => String, nullable: true } };
    }
}
exports.DeactivateProfileDto = DeactivateProfileDto;
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", Object)
], DeactivateProfileDto.prototype, "transferTo", void 0);
//# sourceMappingURL=query-profiles.dto.js.map