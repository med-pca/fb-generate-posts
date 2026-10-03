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
exports.AutoPairDto = void 0;
const openapi = require("@nestjs/swagger");
const swagger_1 = require("@nestjs/swagger");
const class_validator_1 = require("class-validator");
class AutoPairDto {
    profileExternalId;
    name;
    static _OPENAPI_METADATA_FACTORY() {
        return { profileExternalId: { required: true, type: () => String, minLength: 1, maxLength: 200 }, name: { required: false, type: () => String, maxLength: 200 } };
    }
}
exports.AutoPairDto = AutoPairDto;
__decorate([
    (0, swagger_1.ApiProperty)({ example: '5727a89e-20d1-4438-a424-9ea5c2e10ca0' }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MinLength)(1),
    (0, class_validator_1.MaxLength)(200),
    __metadata("design:type", String)
], AutoPairDto.prototype, "profileExternalId", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: 'Salim' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(200),
    __metadata("design:type", String)
], AutoPairDto.prototype, "name", void 0);
//# sourceMappingURL=auto-pair.dto.js.map