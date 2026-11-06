"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PerfModule = void 0;
const common_1 = require("@nestjs/common");
const perf_controller_1 = require("./perf.controller");
const perf_service_1 = require("./perf.service");
const short_cache_service_1 = require("./short-cache.service");
let PerfModule = class PerfModule {
};
exports.PerfModule = PerfModule;
exports.PerfModule = PerfModule = __decorate([
    (0, common_1.Global)(),
    (0, common_1.Module)({ controllers: [perf_controller_1.PerfController], providers: [perf_service_1.PerfService, short_cache_service_1.ShortCacheService], exports: [perf_service_1.PerfService, short_cache_service_1.ShortCacheService] })
], PerfModule);
//# sourceMappingURL=perf.module.js.map