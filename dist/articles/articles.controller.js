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
exports.ArticlesController = void 0;
const openapi = require("@nestjs/swagger");
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const admin_auth_guard_1 = require("../auth/admin-auth.guard");
const current_user_1 = require("../auth/current-user");
const recreate_posts_dto_1 = require("./dto/recreate-posts.dto");
const query_articles_dto_1 = require("./dto/query-articles.dto");
const articles_service_1 = require("./articles.service");
const generate_article_posts_dto_1 = require("./dto/generate-article-posts.dto");
const import_article_dto_1 = require("./dto/import-article.dto");
const update_article_dto_1 = require("./dto/update-article.dto");
let ArticlesController = class ArticlesController {
    articles;
    constructor(articles) {
        this.articles = articles;
    }
    findAll(query, acting) {
        return this.articles.findAll(query, acting);
    }
    findOne(id, acting) {
        return this.articles.findOne(id, acting);
    }
    import(dto, acting) {
        return this.articles.import(dto, acting);
    }
    recreateMany(dto, acting) {
        return this.articles.recreateMany(dto.articleIds, acting);
    }
    recreatePreview(id, acting) {
        return this.articles.recreatePreview(id, acting);
    }
    recreatePosts(id, dto, acting) {
        return this.articles.recreatePosts(id, dto, acting);
    }
    generatePosts(id, dto, acting) {
        return this.articles.generatePosts(id, dto, acting);
    }
    update(id, dto, acting) {
        return this.articles.update(id, dto, acting);
    }
    remove(id, acting) {
        return this.articles.remove(id, acting);
    }
};
exports.ArticlesController = ArticlesController;
__decorate([
    (0, common_1.Get)(),
    openapi.ApiResponse({ status: 200 }),
    __param(0, (0, common_1.Query)()),
    __param(1, (0, current_user_1.ActingUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [query_articles_dto_1.QueryArticlesDto, Object]),
    __metadata("design:returntype", void 0)
], ArticlesController.prototype, "findAll", null);
__decorate([
    (0, common_1.Get)(':id'),
    openapi.ApiResponse({ status: 200, type: Object }),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, current_user_1.ActingUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], ArticlesController.prototype, "findOne", null);
__decorate([
    (0, common_1.Post)('import'),
    (0, swagger_1.ApiOperation)({
        summary: 'Importer ou actualiser un article depuis son API JSON',
    }),
    openapi.ApiResponse({ status: 201, type: Object }),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, current_user_1.ActingUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [import_article_dto_1.ImportArticleDto, Object]),
    __metadata("design:returntype", void 0)
], ArticlesController.prototype, "import", null);
__decorate([
    (0, common_1.Post)('recreate-posts'),
    (0, swagger_1.ApiOperation)({ summary: '🔁 Recréer les posts de plusieurs articles : chacun repart dans tous les groupes actifs de sa catégorie' }),
    openapi.ApiResponse({ status: 201 }),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, current_user_1.ActingUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [recreate_posts_dto_1.RecreateManyDto, Object]),
    __metadata("design:returntype", void 0)
], ArticlesController.prototype, "recreateMany", null);
__decorate([
    (0, common_1.Get)(':id/recreate'),
    (0, swagger_1.ApiOperation)({ summary: 'Où en est l’article dans chaque groupe de sa catégorie (avant de recréer)' }),
    openapi.ApiResponse({ status: 200 }),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, current_user_1.ActingUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], ArticlesController.prototype, "recreatePreview", null);
__decorate([
    (0, common_1.Post)(':id/recreate-posts'),
    (0, swagger_1.ApiOperation)({ summary: 'Recréer les posts d’un article (même archivé) : il repart dans les groupes choisis' }),
    openapi.ApiResponse({ status: 201 }),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, current_user_1.ActingUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, recreate_posts_dto_1.RecreatePostsDto, Object]),
    __metadata("design:returntype", void 0)
], ArticlesController.prototype, "recreatePosts", null);
__decorate([
    (0, common_1.Post)(':id/generate-posts'),
    (0, swagger_1.ApiOperation)({ summary: 'Créer un post par légende sociale de l’article' }),
    openapi.ApiResponse({ status: 201, type: [Object] }),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, current_user_1.ActingUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, generate_article_posts_dto_1.GenerateArticlePostsDto, Object]),
    __metadata("design:returntype", void 0)
], ArticlesController.prototype, "generatePosts", null);
__decorate([
    (0, common_1.Patch)(':id'),
    openapi.ApiResponse({ status: 200 }),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, current_user_1.ActingUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, update_article_dto_1.UpdateArticleDto, Object]),
    __metadata("design:returntype", void 0)
], ArticlesController.prototype, "update", null);
__decorate([
    (0, common_1.Delete)(':id'),
    openapi.ApiResponse({ status: 200 }),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, current_user_1.ActingUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], ArticlesController.prototype, "remove", null);
exports.ArticlesController = ArticlesController = __decorate([
    (0, swagger_1.ApiTags)('articles'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.UseGuards)(admin_auth_guard_1.AdminAuthGuard),
    (0, common_1.Controller)('articles'),
    __metadata("design:paramtypes", [articles_service_1.ArticlesService])
], ArticlesController);
//# sourceMappingURL=articles.controller.js.map