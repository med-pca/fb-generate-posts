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
exports.SyncProfilesDto = exports.NstProfileDto = void 0;
const openapi = require("@nestjs/swagger");
const swagger_1 = require("@nestjs/swagger");
const class_transformer_1 = require("class-transformer");
const class_validator_1 = require("class-validator");
class NstProfileDto {
    externalId;
    name;
    static _OPENAPI_METADATA_FACTORY() {
        return { externalId: { required: true, type: () => String, minLength: 1, maxLength: 200 }, name: { required: true, type: () => String, maxLength: 200 } };
    }
}
exports.NstProfileDto = NstProfileDto;
__decorate([
    (0, swagger_1.ApiProperty)({ example: '5727a89e-20d1-4438-a424-9ea5c2e10ca0' }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MinLength)(1),
    (0, class_validator_1.MaxLength)(200),
    __metadata("design:type", String)
], NstProfileDto.prototype, "externalId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'Salim' }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(200),
    __metadata("design:type", String)
], NstProfileDto.prototype, "name", void 0);
class SyncProfilesDto {
    profiles;
    static _OPENAPI_METADATA_FACTORY() {
        return { profiles: { required: true, type: () => [require("./sync-profiles.dto").NstProfileDto], maxItems: 5000 } };
    }
}
exports.SyncProfilesDto = SyncProfilesDto;
__decorate([
    (0, swagger_1.ApiProperty)({ type: [NstProfileDto] }),
    (0, class_validator_1.IsArray)(),
    (0, class_validator_1.ArrayMaxSize)(5000),
    (0, class_validator_1.ValidateNested)({ each: true }),
    (0, class_transformer_1.Type)(() => NstProfileDto),
    __metadata("design:type", Array)
], SyncProfilesDto.prototype, "profiles", void 0);
//# sourceMappingURL=sync-profiles.dto.js.map