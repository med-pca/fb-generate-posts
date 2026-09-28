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
exports.PairDto = void 0;
const openapi = require("@nestjs/swagger");
const swagger_1 = require("@nestjs/swagger");
const class_validator_1 = require("class-validator");
class PairDto {
    code;
    static _OPENAPI_METADATA_FACTORY() {
        return { code: { required: true, type: () => String, minLength: 6, maxLength: 16, pattern: "^[A-Za-z0-9]+$" } };
    }
}
exports.PairDto = PairDto;
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'K7F2QMJH' }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.Length)(6, 16),
    (0, class_validator_1.Matches)(/^[A-Za-z0-9]+$/, {
        message: 'Le code ne contient que des lettres et des chiffres',
    }),
    __metadata("design:type", String)
], PairDto.prototype, "code", void 0);
//# sourceMappingURL=pair.dto.js.map