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
exports.PostsController = void 0;
const openapi = require("@nestjs/swagger");
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const admin_auth_guard_1 = require("../auth/admin-auth.guard");
const current_user_1 = require("../auth/current-user");
const create_post_dto_1 = require("./dto/create-post.dto");
const posts_service_1 = require("./posts.service");
const update_post_dto_1 = require("./dto/update-post.dto");
const query_posts_dto_1 = require("./dto/query-posts.dto");
const bulk_delete_posts_dto_1 = require("./dto/bulk-delete-posts.dto");
const repeat_dto_1 = require("./dto/repeat.dto");
const queue_dto_1 = require("./dto/queue.dto");
const short_cache_service_1 = require("../perf/short-cache.service");
const queue_service_1 = require("./queue.service");
const published_service_1 = require("./published.service");
const priorities_service_1 = require("./priorities.service");
const queue_dto_2 = require("./dto/queue.dto");
let PostsController = class PostsController {
    posts;
    queueService;
    publishedService;
    priorities;
    cache;
    constructor(posts, queueService, publishedService, priorities, cache) {
        this.posts = posts;
        this.queueService = queueService;
        this.publishedService = publishedService;
        this.priorities = priorities;
        this.cache = cache;
    }
    prioritiesOverview(acting) {
        return this.priorities.overview(acting);
    }
    groupPriority(id, dto, acting) {
        return this.priorities.setGroup(id, dto, acting);
    }
    groupLimits(id, dto, acting) {
        return this.priorities.setGroupLimits(id, dto, acting);
    }
    articlePriority(id, dto, acting) {
        return this.priorities.setArticle(id, dto, acting);
    }
    published(query, acting) {
        return this.cache.get(acting, `posts/published?${JSON.stringify(query)}`, 10_000, () => this.publishedService.audit(query, acting));
    }
    async publishedCsv(query, acting, reply) {
        const body = await this.publishedService.csv(query, acting);
        return reply
            .header('content-type', 'text/csv; charset=utf-8')
            .header('content-disposition', `attachment; filename="publications-${new Date().toISOString().slice(0, 10)}.csv"`)
            .send(body);
    }
    queue(query, acting) {
        return this.cache.get(acting, `posts/queue?${JSON.stringify(query)}`, 10_000, () => this.queueService.queue(query, acting));
    }
    retry(targetId, acting) {
        return this.queueService.retry(targetId, acting);
    }
    markPublished(targetId, dto, acting) {
        return this.queueService.markPublished(targetId, acting, dto?.facebookUrl);
    }
    setFacebookUrl(targetId, dto, acting) {
        return this.queueService.setFacebookUrl(targetId, dto.facebookUrl, acting);
    }
    history(targetId, acting) {
        return this.queueService.history(targetId, acting);
    }
    attachUrl(dto, acting) {
        return this.queueService.attachUrl(dto.facebookUrl, dto.targetId, acting);
    }
    findByUrl(url, acting) {
        return this.queueService.findByUrl(url ?? '', acting);
    }
    removeTarget(targetId, acting) {
        return this.queueService.removeTarget(targetId, acting);
    }
    force(targetId, dto, acting) {
        return this.queueService.force(targetId, dto.profileId ?? null, acting);
    }
    setPriority(id, dto, acting) {
        return this.queueService.setPriority(id, dto, acting);
    }
    create(dto, acting) {
        return this.posts.create(dto, acting);
    }
    findAll(query, acting) {
        return this.posts.findAll(query, acting);
    }
    bulkRemove(dto, acting) {
        return this.posts.bulkRemove(dto, acting);
    }
    bulkRepeat(dto, acting) {
        return this.posts.bulkRepeat(dto, acting);
    }
    findOne(id, acting) {
        return this.posts.findOne(id, acting);
    }
    update(id, dto, acting) {
        return this.posts.update(id, dto, acting);
    }
    remove(id, acting, force) {
        return this.posts.remove(id, force === 'true', acting);
    }
};
exports.PostsController = PostsController;
__decorate([
    (0, common_1.Get)('priorities'),
    (0, swagger_1.ApiOperation)({ summary: 'Règles & priorités du pilotage : groupes et articles, avec ce qui attend dans la file' }),
    openapi.ApiResponse({ status: 200 }),
    __param(0, (0, current_user_1.ActingUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], PostsController.prototype, "prioritiesOverview", null);
__decorate([
    (0, common_1.Patch)('priorities/groups/:id'),
    (0, swagger_1.ApiOperation)({ summary: 'Priorité d’un groupe (en tête, monter, descendre, remettre à zéro, ou une valeur)' }),
    openapi.ApiResponse({ status: 200 }),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, current_user_1.ActingUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, queue_dto_1.PriorityDto, Object]),
    __metadata("design:returntype", void 0)
], PostsController.prototype, "groupPriority", null);
__decorate([
    (0, common_1.Patch)('priorities/groups/:id/limits'),
    (0, swagger_1.ApiOperation)({ summary: 'Plafond de posts par jour et heures de publication d’un groupe (null = aucun)' }),
    openapi.ApiResponse({ status: 200, type: Object }),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, current_user_1.ActingUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, queue_dto_2.GroupLimitsDto, Object]),
    __metadata("design:returntype", void 0)
], PostsController.prototype, "groupLimits", null);
__decorate([
    (0, common_1.Patch)('priorities/articles/:id'),
    (0, swagger_1.ApiOperation)({ summary: 'Priorité d’un article : appliquée à tous ses posts encore à publier' }),
    openapi.ApiResponse({ status: 200 }),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, current_user_1.ActingUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, queue_dto_1.PriorityDto, Object]),
    __metadata("design:returntype", void 0)
], PostsController.prototype, "articlePriority", null);
__decorate([
    (0, common_1.Get)('published'),
    (0, swagger_1.ApiOperation)({ summary: 'Audit des publications faites : période (date-heure), profil, groupe, vérification, lien… avec les totaux' }),
    openapi.ApiResponse({ status: 200 }),
    __param(0, (0, common_1.Query)()),
    __param(1, (0, current_user_1.ActingUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [queue_dto_2.PublishedQueryDto, Object]),
    __metadata("design:returntype", void 0)
], PostsController.prototype, "published", null);
__decorate([
    (0, common_1.Get)('published.csv'),
    (0, swagger_1.ApiOperation)({ summary: 'Le même audit en CSV' }),
    openapi.ApiResponse({ status: 200 }),
    __param(0, (0, common_1.Query)()),
    __param(1, (0, current_user_1.ActingUser)()),
    __param(2, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [queue_dto_2.PublishedQueryDto, Object, Object]),
    __metadata("design:returntype", Promise)
], PostsController.prototype, "publishedCsv", null);
__decorate([
    (0, common_1.Get)('queue'),
    (0, swagger_1.ApiOperation)({
        summary: 'La file de publication',
        description: 'En cours (réservées par un automate), à venir (dans l’ordre exact de ' +
            'réservation : priorité puis ancienneté) et publiées (quand, dans quel ' +
            'groupe, par quel profil). Filtrable par catégorie ou groupe.',
    }),
    openapi.ApiResponse({ status: 200 }),
    __param(0, (0, common_1.Query)()),
    __param(1, (0, current_user_1.ActingUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [queue_dto_1.QueueQueryDto, Object]),
    __metadata("design:returntype", void 0)
], PostsController.prototype, "queue", null);
__decorate([
    (0, common_1.Post)('targets/:targetId/retry'),
    (0, common_1.HttpCode)(200),
    (0, swagger_1.ApiOperation)({
        summary: 'Relancer une publication en échec dans son groupe',
    }),
    openapi.ApiResponse({ status: 200 }),
    __param(0, (0, common_1.Param)('targetId')),
    __param(1, (0, current_user_1.ActingUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], PostsController.prototype, "retry", null);
__decorate([
    (0, common_1.Post)('targets/:targetId/published'),
    (0, common_1.HttpCode)(200),
    (0, swagger_1.ApiOperation)({
        summary: 'Marquer « déjà en ligne » une publication en échec',
        description: 'Quand le post est bien sur Facebook mais que l’extension ne l’a pas ' +
            'retrouvé : l’enregistre comme publié, sans le republier.',
    }),
    openapi.ApiResponse({ status: 200 }),
    __param(0, (0, common_1.Param)('targetId')),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, current_user_1.ActingUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, queue_dto_1.OptionalFacebookUrlDto, Object]),
    __metadata("design:returntype", void 0)
], PostsController.prototype, "markPublished", null);
__decorate([
    (0, common_1.Put)('targets/:targetId/facebook-url'),
    (0, swagger_1.ApiOperation)({
        summary: 'Enregistrer l’adresse Facebook d’une publication',
        description: 'Celle que l’extension n’a pas retrouvée, ou une correction. L’ancienne reste dans l’historique.',
    }),
    openapi.ApiResponse({ status: 200 }),
    __param(0, (0, common_1.Param)('targetId')),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, current_user_1.ActingUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, queue_dto_1.FacebookUrlDto, Object]),
    __metadata("design:returntype", void 0)
], PostsController.prototype, "setFacebookUrl", null);
__decorate([
    (0, common_1.Get)('targets/:targetId/history'),
    (0, swagger_1.ApiOperation)({ summary: 'Historique d’une publication : tentatives, adresses, vérifications' }),
    openapi.ApiResponse({ status: 200 }),
    __param(0, (0, common_1.Param)('targetId')),
    __param(1, (0, current_user_1.ActingUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], PostsController.prototype, "history", null);
__decorate([
    (0, common_1.Post)('attach-url'),
    (0, common_1.HttpCode)(200),
    (0, swagger_1.ApiOperation)({
        summary: 'Coller le lien d’un post publié à la main',
        description: 'Le groupe se lit dans le lien ; la publication de ce groupe à qui il manque ' +
            'son lien est complétée, puis le travail reprend (lien en commentaire, ' +
            'vérification). Plusieurs possibles : renvoie la liste, à rappeler avec `targetId`.',
    }),
    openapi.ApiResponse({ status: 200, type: Object }),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, current_user_1.ActingUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [queue_dto_1.AttachFacebookUrlDto, Object]),
    __metadata("design:returntype", void 0)
], PostsController.prototype, "attachUrl", null);
__decorate([
    (0, common_1.Get)('targets-by-url'),
    (0, swagger_1.ApiOperation)({ summary: 'Retrouver une publication à partir de son adresse Facebook' }),
    openapi.ApiResponse({ status: 200 }),
    __param(0, (0, common_1.Query)('url')),
    __param(1, (0, current_user_1.ActingUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], PostsController.prototype, "findByUrl", null);
__decorate([
    (0, common_1.Delete)('targets/:targetId'),
    (0, swagger_1.ApiOperation)({
        summary: 'Retirer un post d’un seul groupe',
        description: 'Le post reste dans ses autres groupes ; s’il ne visait que celui-ci, il ' +
            'est supprimé. Une publication faite ou en cours ne se retire pas.',
    }),
    openapi.ApiResponse({ status: 200 }),
    __param(0, (0, common_1.Param)('targetId')),
    __param(1, (0, current_user_1.ActingUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], PostsController.prototype, "removeTarget", null);
__decorate([
    (0, common_1.Put)('targets/:targetId/force'),
    (0, swagger_1.ApiOperation)({
        summary: 'Faire publier par un profil précis, au plus tôt',
        description: 'Le profil la prend en premier à son prochain passage ; aucun autre ne ' +
            'la prend entre-temps. `profileId: null` la rend à la file.',
    }),
    openapi.ApiResponse({ status: 200, type: Object }),
    __param(0, (0, common_1.Param)('targetId')),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, current_user_1.ActingUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, queue_dto_1.ForceTargetDto, Object]),
    __metadata("design:returntype", void 0)
], PostsController.prototype, "force", null);
__decorate([
    (0, common_1.Patch)(':id/priority'),
    (0, swagger_1.ApiOperation)({
        summary: 'Prioriser un post',
        description: '`move`: top (en tête de file), up, down, reset — ou `priority` exacte. ' +
            'Le post passe en tête dans tous ses groupes.',
    }),
    openapi.ApiResponse({ status: 200 }),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, current_user_1.ActingUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, queue_dto_1.PriorityDto, Object]),
    __metadata("design:returntype", void 0)
], PostsController.prototype, "setPriority", null);
__decorate([
    (0, common_1.Post)(),
    openapi.ApiResponse({ status: 201, type: Object }),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, current_user_1.ActingUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [create_post_dto_1.CreatePostDto, Object]),
    __metadata("design:returntype", void 0)
], PostsController.prototype, "create", null);
__decorate([
    (0, common_1.Get)(),
    openapi.ApiResponse({ status: 200 }),
    __param(0, (0, common_1.Query)()),
    __param(1, (0, current_user_1.ActingUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [query_posts_dto_1.QueryPostsDto, Object]),
    __metadata("design:returntype", void 0)
], PostsController.prototype, "findAll", null);
__decorate([
    (0, common_1.Post)('bulk-delete'),
    (0, common_1.HttpCode)(200),
    (0, swagger_1.ApiOperation)({
        summary: 'Supprimer plusieurs posts par sélection ou par filtre (dryRun pour compter d’abord)',
    }),
    openapi.ApiResponse({ status: 200 }),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, current_user_1.ActingUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [bulk_delete_posts_dto_1.BulkDeletePostsDto, Object]),
    __metadata("design:returntype", void 0)
], PostsController.prototype, "bulkRemove", null);
__decorate([
    (0, common_1.Post)('bulk-repeat'),
    (0, common_1.HttpCode)(200),
    (0, swagger_1.ApiOperation)({ summary: 'Règle de duplication pour plusieurs posts (null = réglage global)' }),
    openapi.ApiResponse({ status: 200 }),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, current_user_1.ActingUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [repeat_dto_1.BulkRepeatDto, Object]),
    __metadata("design:returntype", void 0)
], PostsController.prototype, "bulkRepeat", null);
__decorate([
    (0, common_1.Get)(':id'),
    openapi.ApiResponse({ status: 200, type: Object }),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, current_user_1.ActingUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], PostsController.prototype, "findOne", null);
__decorate([
    (0, common_1.Patch)(':id'),
    openapi.ApiResponse({ status: 200 }),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, current_user_1.ActingUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, update_post_dto_1.UpdatePostDto, Object]),
    __metadata("design:returntype", void 0)
], PostsController.prototype, "update", null);
__decorate([
    (0, common_1.Delete)(':id'),
    (0, swagger_1.ApiQuery)({ name: 'force', required: false, type: Boolean }),
    openapi.ApiResponse({ status: 200 }),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, current_user_1.ActingUser)()),
    __param(2, (0, common_1.Query)('force')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, String]),
    __metadata("design:returntype", void 0)
], PostsController.prototype, "remove", null);
exports.PostsController = PostsController = __decorate([
    (0, swagger_1.ApiTags)('posts'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.UseGuards)(admin_auth_guard_1.AdminAuthGuard),
    (0, common_1.Controller)('posts'),
    __metadata("design:paramtypes", [posts_service_1.PostsService,
        queue_service_1.QueueService,
        published_service_1.PublishedService,
        priorities_service_1.PrioritiesService,
        short_cache_service_1.ShortCacheService])
], PostsController);
//# sourceMappingURL=posts.controller.js.map