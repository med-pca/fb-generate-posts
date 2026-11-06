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
exports.RescueReportDto = void 0;
const openapi = require("@nestjs/swagger");
const class_validator_1 = require("class-validator");
class RescueReportDto {
    profileExternalId;
    outcome;
    detail;
    commentExternalId;
    static _OPENAPI_METADATA_FACTORY() {
        return { profileExternalId: { required: true, type: () => String, maxLength: 200 }, outcome: { required: true, enum: ["failed", "done", "already"], enum: ['done', 'already', 'failed'] }, detail: { required: false, type: () => String, maxLength: 500 }, commentExternalId: { required: false, type: () => String, maxLength: 200 } };
    }
}
exports.RescueReportDto = RescueReportDto;
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsNotEmpty)(),
    (0, class_validator_1.MaxLength)(200),
    __metadata("design:type", String)
], RescueReportDto.prototype, "profileExternalId", void 0);
__decorate([
    (0, class_validator_1.IsIn)(['done', 'already', 'failed']),
    __metadata("design:type", String)
], RescueReportDto.prototype, "outcome", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(500),
    __metadata("design:type", String)
], RescueReportDto.prototype, "detail", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(200),
    __metadata("design:type", String)
], RescueReportDto.prototype, "commentExternalId", void 0);
//# sourceMappingURL=rescue-report.dto.js.map