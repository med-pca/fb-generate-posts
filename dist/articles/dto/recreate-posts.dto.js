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
exports.RecreateManyDto = exports.RecreatePostsDto = void 0;
const openapi = require("@nestjs/swagger");
const class_validator_1 = require("class-validator");
class RecreatePostsDto {
    groupIds;
    static _OPENAPI_METADATA_FACTORY() {
        return { groupIds: { required: false, type: () => [String] } };
    }
}
exports.RecreatePostsDto = RecreatePostsDto;
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsArray)(),
    (0, class_validator_1.IsString)({ each: true }),
    __metadata("design:type", Array)
], RecreatePostsDto.prototype, "groupIds", void 0);
class RecreateManyDto {
    articleIds;
    static _OPENAPI_METADATA_FACTORY() {
        return { articleIds: { required: true, type: () => [String], minItems: 1, maxItems: 200 } };
    }
}
exports.RecreateManyDto = RecreateManyDto;
__decorate([
    (0, class_validator_1.IsArray)(),
    (0, class_validator_1.ArrayMinSize)(1),
    (0, class_validator_1.ArrayMaxSize)(200),
    (0, class_validator_1.IsString)({ each: true }),
    __metadata("design:type", Array)
], RecreateManyDto.prototype, "articleIds", void 0);
//# sourceMappingURL=recreate-posts.dto.js.map