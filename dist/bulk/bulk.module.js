"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.BulkModule = void 0;
const common_1 = require("@nestjs/common");
const access_module_1 = require("../access/access.module");
const bulk_controller_1 = require("./bulk.controller");
const bulk_service_1 = require("./bulk.service");
let BulkModule = class BulkModule {
};
exports.BulkModule = BulkModule;
exports.BulkModule = BulkModule = __decorate([
    (0, common_1.Module)({
        imports: [access_module_1.AccessModule],
        controllers: [bulk_controller_1.BulkController],
        providers: [bulk_service_1.BulkService],
    })
], BulkModule);
//# sourceMappingURL=bulk.module.js.map