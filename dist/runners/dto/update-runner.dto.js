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
exports.UpdateRunnerDto = void 0;
const openapi = require("@nestjs/swagger");
const swagger_1 = require("@nestjs/swagger");
const client_1 = require("@prisma/client");
const class_validator_1 = require("class-validator");
class UpdateRunnerDto {
    mode;
    windowStart;
    windowEnd;
    days;
    timezone;
    settings;
    static _OPENAPI_METADATA_FACTORY() {
        return { mode: { required: false, enum: ["OFF", "ON", "AUTO"] }, windowStart: { required: false, type: () => Number, nullable: true, minimum: 0, maximum: 1439 }, windowEnd: { required: false, type: () => Number, nullable: true, minimum: 0, maximum: 1439 }, days: { required: false, type: () => String, pattern: "^$|^[1-7](,[1-7])*$" }, timezone: { required: false, type: () => String, maxLength: 64 }, settings: { required: false, type: "object", additionalProperties: true, nullable: true } };
    }
}
exports.UpdateRunnerDto = UpdateRunnerDto;
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ enum: client_1.RunnerMode }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsEnum)(client_1.RunnerMode),
    __metadata("design:type", String)
], UpdateRunnerDto.prototype, "mode", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ minimum: 0, maximum: 1439, nullable: true }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(0),
    (0, class_validator_1.Max)(1439),
    __metadata("design:type", Object)
], UpdateRunnerDto.prototype, "windowStart", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ minimum: 0, maximum: 1439, nullable: true }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(0),
    (0, class_validator_1.Max)(1439),
    __metadata("design:type", Object)
], UpdateRunnerDto.prototype, "windowEnd", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: '1,2,3,4,5' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.Matches)(/^$|^[1-7](,[1-7])*$/, {
        message: 'days doit être des jours ISO séparés par des virgules, ex. 1,2,3,4,5',
    }),
    __metadata("design:type", String)
], UpdateRunnerDto.prototype, "days", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: 'Europe/Paris' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(64),
    __metadata("design:type", String)
], UpdateRunnerDto.prototype, "timezone", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ type: 'object', additionalProperties: true }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsObject)(),
    __metadata("design:type", Object)
], UpdateRunnerDto.prototype, "settings", void 0);
//# sourceMappingURL=update-runner.dto.js.map