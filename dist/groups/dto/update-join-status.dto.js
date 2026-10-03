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
exports.SetJoinStatusDto = exports.UpdateJoinStatusDto = void 0;
const openapi = require("@nestjs/swagger");
const client_1 = require("@prisma/client");
const class_validator_1 = require("class-validator");
class UpdateJoinStatusDto {
    joinStatus;
    error;
    static _OPENAPI_METADATA_FACTORY() {
        return { joinStatus: { required: true, enum: ["FAILED", "NOT_JOINED", "REQUESTED", "JOINED", "QUESTIONS"] }, error: { required: false, type: () => String } };
    }
}
exports.UpdateJoinStatusDto = UpdateJoinStatusDto;
__decorate([
    (0, class_validator_1.IsEnum)(client_1.JoinStatus),
    __metadata("design:type", String)
], UpdateJoinStatusDto.prototype, "joinStatus", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], UpdateJoinStatusDto.prototype, "error", void 0);
class SetJoinStatusDto {
    joinStatus;
    static _OPENAPI_METADATA_FACTORY() {
        return { joinStatus: { required: true, enum: ["FAILED", "NOT_JOINED", "REQUESTED", "JOINED", "QUESTIONS"] } };
    }
}
exports.SetJoinStatusDto = SetJoinStatusDto;
__decorate([
    (0, class_validator_1.IsEnum)(client_1.JoinStatus),
    __metadata("design:type", String)
], SetJoinStatusDto.prototype, "joinStatus", void 0);
//# sourceMappingURL=update-join-status.dto.js.map