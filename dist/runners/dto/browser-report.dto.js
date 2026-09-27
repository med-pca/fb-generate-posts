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
exports.BrowserReportDto = void 0;
const openapi = require("@nestjs/swagger");
const swagger_1 = require("@nestjs/swagger");
const client_1 = require("@prisma/client");
const class_validator_1 = require("class-validator");
class BrowserReportDto {
    state;
    message;
    static _OPENAPI_METADATA_FACTORY() {
        return { state: { required: true, enum: ["ERROR", "STOPPED", "STARTING", "RUNNING"] }, message: { required: false, type: () => String, maxLength: 1000 } };
    }
}
exports.BrowserReportDto = BrowserReportDto;
__decorate([
    (0, swagger_1.ApiProperty)({ enum: client_1.BrowserState }),
    (0, class_validator_1.IsEnum)(client_1.BrowserState),
    __metadata("design:type", String)
], BrowserReportDto.prototype, "state", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: 'NSTBrowser: profil introuvable' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(1000),
    __metadata("design:type", String)
], BrowserReportDto.prototype, "message", void 0);
//# sourceMappingURL=browser-report.dto.js.map