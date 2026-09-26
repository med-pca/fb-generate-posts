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
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.WordpressModule = exports.WordpressController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const articles_module_1 = require("../articles/articles.module");
const wordpress_dto_1 = require("./wordpress.dto");
const wordpress_guard_1 = require("./wordpress.guard");
const wordpress_service_1 = require("./wordpress.service");
let WordpressController = class WordpressController {
    wordpress;
    constructor(wordpress) {
        this.wordpress = wordpress;
    }
    publish(dto) {
        return this.wordpress.publish(dto);
    }
};
exports.WordpressController = WordpressController;
__decorate([
    (0, common_1.Post)('articles'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [wordpress_dto_1.WordpressArticleDto]),
    __metadata("design:returntype", void 0)
], WordpressController.prototype, "publish", null);
exports.WordpressController = WordpressController = __decorate([
    (0, swagger_1.ApiTags)('wordpress'),
    (0, swagger_1.ApiHeader)({ name: 'x-api-key', required: true }),
    (0, common_1.Controller)('wordpress'),
    (0, common_1.UseGuards)(wordpress_guard_1.WordpressGuard),
    __metadata("design:paramtypes", [wordpress_service_1.WordpressService])
], WordpressController);
let WordpressModule = class WordpressModule {
};
exports.WordpressModule = WordpressModule;
exports.WordpressModule = WordpressModule = __decorate([
    (0, common_1.Module)({
        imports: [articles_module_1.ArticlesModule],
        controllers: [WordpressController],
        providers: [wordpress_service_1.WordpressService, wordpress_guard_1.WordpressGuard],
    })
], WordpressModule);
//# sourceMappingURL=wordpress.module.js.map