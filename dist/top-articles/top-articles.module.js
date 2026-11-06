"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TopArticlesModule = void 0;
const common_1 = require("@nestjs/common");
const top_articles_controller_1 = require("./top-articles.controller");
const top_articles_service_1 = require("./top-articles.service");
let TopArticlesModule = class TopArticlesModule {
};
exports.TopArticlesModule = TopArticlesModule;
exports.TopArticlesModule = TopArticlesModule = __decorate([
    (0, common_1.Module)({ controllers: [top_articles_controller_1.TopArticlesController], providers: [top_articles_service_1.TopArticlesService] })
], TopArticlesModule);
//# sourceMappingURL=top-articles.module.js.map