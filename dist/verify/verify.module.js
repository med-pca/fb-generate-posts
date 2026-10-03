"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.VerifyModule = void 0;
const common_1 = require("@nestjs/common");
const verify_controller_1 = require("./verify.controller");
const verify_service_1 = require("./verify.service");
const members_service_1 = require("./members.service");
let VerifyModule = class VerifyModule {
};
exports.VerifyModule = VerifyModule;
exports.VerifyModule = VerifyModule = __decorate([
    (0, common_1.Module)({
        controllers: [verify_controller_1.VerifyController, verify_controller_1.AdminVerifyController],
        providers: [verify_service_1.VerifyService, members_service_1.MembersService],
    })
], VerifyModule);
//# sourceMappingURL=verify.module.js.map