"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ModeratorsModule = void 0;
const common_1 = require("@nestjs/common");
const verify_module_1 = require("../verify/verify.module");
const moderators_controller_1 = require("./moderators.controller");
const moderators_service_1 = require("./moderators.service");
let ModeratorsModule = class ModeratorsModule {
};
exports.ModeratorsModule = ModeratorsModule;
exports.ModeratorsModule = ModeratorsModule = __decorate([
    (0, common_1.Module)({
        imports: [verify_module_1.VerifyModule],
        controllers: [moderators_controller_1.ModeratorsController, moderators_controller_1.ModeratorControlController],
        providers: [moderators_service_1.ModeratorsService],
    })
], ModeratorsModule);
//# sourceMappingURL=moderators.module.js.map