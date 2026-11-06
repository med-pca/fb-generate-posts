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
exports.BulkRepeatDto = exports.RepeatRuleDto = void 0;
const openapi = require("@nestjs/swagger");
const swagger_1 = require("@nestjs/swagger");
const class_validator_1 = require("class-validator");
const repeat_service_1 = require("../repeat.service");
class RepeatRuleDto {
    repeatTimes;
    repeatEveryHours;
    static _OPENAPI_METADATA_FACTORY() {
        return { repeatTimes: { required: false, type: () => Number, nullable: true, minimum: 1, maximum: repeat_service_1.REPEAT_LIMITS.maxTimes }, repeatEveryHours: { required: false, type: () => Number, nullable: true, minimum: repeat_service_1.REPEAT_LIMITS.minHours, maximum: repeat_service_1.REPEAT_LIMITS.maxHours } };
    }
}
exports.RepeatRuleDto = RepeatRuleDto;
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ minimum: 1, maximum: repeat_service_1.REPEAT_LIMITS.maxTimes, nullable: true }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(1),
    (0, class_validator_1.Max)(repeat_service_1.REPEAT_LIMITS.maxTimes),
    __metadata("design:type", Object)
], RepeatRuleDto.prototype, "repeatTimes", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ minimum: repeat_service_1.REPEAT_LIMITS.minHours, maximum: repeat_service_1.REPEAT_LIMITS.maxHours, nullable: true }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(repeat_service_1.REPEAT_LIMITS.minHours),
    (0, class_validator_1.Max)(repeat_service_1.REPEAT_LIMITS.maxHours),
    __metadata("design:type", Object)
], RepeatRuleDto.prototype, "repeatEveryHours", void 0);
class BulkRepeatDto extends RepeatRuleDto {
    ids;
    static _OPENAPI_METADATA_FACTORY() {
        return { ids: { required: true, type: () => [String], minItems: 1, maxItems: 500 } };
    }
}
exports.BulkRepeatDto = BulkRepeatDto;
__decorate([
    (0, class_validator_1.IsArray)(),
    (0, class_validator_1.ArrayMinSize)(1),
    (0, class_validator_1.ArrayMaxSize)(500),
    (0, class_validator_1.IsString)({ each: true }),
    __metadata("design:type", Array)
], BulkRepeatDto.prototype, "ids", void 0);
//# sourceMappingURL=repeat.dto.js.map