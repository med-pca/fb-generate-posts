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
exports.HeartbeatDto = void 0;
const openapi = require("@nestjs/swagger");
const swagger_1 = require("@nestjs/swagger");
const class_validator_1 = require("class-validator");
class HeartbeatDto {
    running;
    phase;
    message;
    published;
    failed;
    links;
    agent;
    facebookUserId;
    facebookName;
    static _OPENAPI_METADATA_FACTORY() {
        return { running: { required: false, type: () => Boolean }, phase: { required: false, type: () => String, maxLength: 40 }, message: { required: false, type: () => String, maxLength: 1000 }, published: { required: false, type: () => Number, minimum: 0 }, failed: { required: false, type: () => Number, minimum: 0 }, links: { required: false, type: () => Number, minimum: 0 }, agent: { required: false, type: () => String, maxLength: 200 }, facebookUserId: { required: false, type: () => String, pattern: "^\\d{5,20}$" }, facebookName: { required: false, type: () => String, maxLength: 200 } };
    }
}
exports.HeartbeatDto = HeartbeatDto;
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsBoolean)(),
    __metadata("design:type", Boolean)
], HeartbeatDto.prototype, "running", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: 'publication' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(40),
    __metadata("design:type", String)
], HeartbeatDto.prototype, "phase", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(1000),
    __metadata("design:type", String)
], HeartbeatDto.prototype, "message", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(0),
    __metadata("design:type", Number)
], HeartbeatDto.prototype, "published", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(0),
    __metadata("design:type", Number)
], HeartbeatDto.prototype, "failed", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(0),
    __metadata("design:type", Number)
], HeartbeatDto.prototype, "links", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: 'extension 1.0.0' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(200),
    __metadata("design:type", String)
], HeartbeatDto.prototype, "agent", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: '100089123456789' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.Matches)(/^\d{5,20}$/),
    __metadata("design:type", String)
], HeartbeatDto.prototype, "facebookUserId", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: 'Rihab Nakous' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(200),
    __metadata("design:type", String)
], HeartbeatDto.prototype, "facebookName", void 0);
//# sourceMappingURL=heartbeat.dto.js.map