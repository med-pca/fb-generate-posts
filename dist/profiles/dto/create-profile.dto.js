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
exports.CreateProfileDto = void 0;
const openapi = require("@nestjs/swagger");
const swagger_1 = require("@nestjs/swagger");
const client_1 = require("@prisma/client");
const class_validator_1 = require("class-validator");
class CreateProfileDto {
    status;
    name;
    externalId;
    defaultImageUrl;
    minPostsPerJob = 2;
    maxPostsPerJob = 6;
    minimumAvailable;
    minimumAvailablePerGroup;
    static _OPENAPI_METADATA_FACTORY() {
        return { status: { required: false, enum: ["ACTIVE", "INACTIVE"] }, name: { required: true, type: () => String }, externalId: { required: false, type: () => String }, defaultImageUrl: { required: false, type: () => String, format: "uri" }, minPostsPerJob: { required: true, type: () => Object, default: 2, minimum: 1, maximum: 100 }, maxPostsPerJob: { required: true, type: () => Object, default: 6, minimum: 1, maximum: 100 }, minimumAvailable: { required: false, type: () => Number, nullable: true, minimum: 1, maximum: 1000 }, minimumAvailablePerGroup: { required: false, type: () => Number, nullable: true, minimum: 1, maximum: 1000 } };
    }
}
exports.CreateProfileDto = CreateProfileDto;
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsEnum)(client_1.RecordStatus),
    __metadata("design:type", String)
], CreateProfileDto.prototype, "status", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], CreateProfileDto.prototype, "name", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], CreateProfileDto.prototype, "externalId", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsUrl)({ require_tld: false }),
    __metadata("design:type", String)
], CreateProfileDto.prototype, "defaultImageUrl", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(1),
    (0, class_validator_1.Max)(100),
    __metadata("design:type", Object)
], CreateProfileDto.prototype, "minPostsPerJob", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(1),
    (0, class_validator_1.Max)(100),
    __metadata("design:type", Object)
], CreateProfileDto.prototype, "maxPostsPerJob", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ minimum: 1, maximum: 1000, nullable: true }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(1),
    (0, class_validator_1.Max)(1000),
    __metadata("design:type", Object)
], CreateProfileDto.prototype, "minimumAvailable", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ minimum: 1, maximum: 1000, nullable: true }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(1),
    (0, class_validator_1.Max)(1000),
    __metadata("design:type", Object)
], CreateProfileDto.prototype, "minimumAvailablePerGroup", void 0);
//# sourceMappingURL=create-profile.dto.js.map