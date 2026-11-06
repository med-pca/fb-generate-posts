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
exports.SuspensionReportDto = void 0;
const openapi = require("@nestjs/swagger");
const class_validator_1 = require("class-validator");
class SuspensionReportDto {
    kind;
    detail;
    url;
    static _OPENAPI_METADATA_FACTORY() {
        return { kind: { required: true, enum: ["disabled", "checkpoint", "logged_out"], enum: ['disabled', 'checkpoint', 'logged_out'] }, detail: { required: false, type: () => String, maxLength: 500 }, url: { required: false, type: () => String, maxLength: 500 } };
    }
}
exports.SuspensionReportDto = SuspensionReportDto;
__decorate([
    (0, class_validator_1.IsIn)(['disabled', 'checkpoint', 'logged_out']),
    __metadata("design:type", String)
], SuspensionReportDto.prototype, "kind", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(500),
    __metadata("design:type", String)
], SuspensionReportDto.prototype, "detail", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(500),
    __metadata("design:type", String)
], SuspensionReportDto.prototype, "url", void 0);
//# sourceMappingURL=suspension.dto.js.map