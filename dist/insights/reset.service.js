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
exports.ResetService = exports.RESET_CONFIRMATION = void 0;
const common_1 = require("@nestjs/common");
const client_1 = require("@prisma/client");
const prisma_service_1 = require("../prisma/prisma.service");
exports.RESET_CONFIRMATION = 'EFFACER';
let ResetService = class ResetService {
    prisma;
    constructor(prisma) {
        this.prisma = prisma;
    }
    async counts(now = new Date()) {
        const [posts, published, postsFromArticles, articles, archivedArticles, jobs, activeJobs,] = await Promise.all([
            this.prisma.post.count(),
            this.prisma.postTarget.count({ where: { status: client_1.TargetStatus.PUBLISHED } }),
            this.prisma.post.count({ where: { articleId: { not: null } } }),
            this.prisma.article.count(),
            this.prisma.article.count({ where: { archivedAt: { not: null } } }),
            this.prisma.publicationJob.count(),
            this.prisma.publicationJob.count({
                where: { status: client_1.JobStatus.CLAIMED, claimExpiresAt: { gt: now } },
            }),
        ]);
        return {
            posts,
            published,
            postsFromArticles,
            standalonePosts: posts - postsFromArticles,
            articles,
            archivedArticles,
            jobs,
            activeJobs,
        };
    }
    plan(input, c) {
        const deletePosts = Boolean(input.posts);
        const deleteArticles = Boolean(input.articles);
        const linkedPosts = deleteArticles && !deletePosts && input.articlePosts === 'delete';
        return {
            posts: deletePosts ? c.posts : linkedPosts ? c.postsFromArticles : 0,
            articles: deleteArticles ? c.articles : 0,
            postsDetached: deleteArticles && !deletePosts && input.articlePosts === 'keep'
                ? c.postsFromArticles
                : 0,
            articlesUnarchived: deletePosts && !deleteArticles && input.unarchive ? c.archivedArticles : 0,
        };
    }
    async reset(input, acting, now = new Date()) {
        const c = await this.counts(now);
        if (input.dryRun) {
            return { dryRun: true, ...c, plan: this.plan(input, c) };
        }
        if (!input.posts && !input.articles) {
            throw new common_1.BadRequestException('Choisissez ce qu’il faut supprimer : posts, articles, ou les deux');
        }
        if (input.articles && !input.posts && c.postsFromArticles && !input.articlePosts) {
            throw new common_1.BadRequestException(`${c.postsFromArticles} post(s) viennent de ces articles : dites s’il faut les supprimer aussi ou les garder`);
        }
        if (input.confirm !== exports.RESET_CONFIRMATION) {
            throw new common_1.BadRequestException(`Tapez ${exports.RESET_CONFIRMATION} pour confirmer la suppression`);
        }
        const plan = this.plan(input, c);
        if (plan.posts && c.activeJobs && !input.force) {
            throw new common_1.ConflictException(`${c.activeJobs} lot(s) en cours de publication : coupez la publication ` +
                '(Pilotage) et attendez qu’ils finissent, ou forcez.');
        }
        const steps = [];
        if (input.posts) {
            steps.push(this.prisma.post.deleteMany());
        }
        else if (input.articles && input.articlePosts === 'delete') {
            steps.push(this.prisma.post.deleteMany({ where: { articleId: { not: null } } }));
        }
        if (plan.posts) {
            steps.push(this.prisma.publicationJob.deleteMany({ where: { items: { none: {} } } }));
        }
        if (input.articles) {
            steps.push(this.prisma.article.deleteMany());
        }
        else if (input.unarchive) {
            steps.push(this.prisma.article.updateMany({
                where: { archivedAt: { not: null } },
                data: { archivedAt: null },
            }));
        }
        const what = [
            plan.posts && `${plan.posts} post(s)`,
            plan.articles && `${plan.articles} article(s)`,
        ]
            .filter(Boolean)
            .join(' et ');
        steps.push(this.prisma.activityLog.create({
            data: {
                eventType: 'ADMIN_RESET',
                level: 'WARN',
                message: `Suppression : ${what || 'rien'}` +
                    (plan.postsDetached ? `, ${plan.postsDetached} post(s) gardés sans article` : '') +
                    (plan.articlesUnarchived ? `, ${plan.articlesUnarchived} article(s) désarchivés` : ''),
                metadata: {
                    choice: {
                        posts: Boolean(input.posts),
                        articles: Boolean(input.articles),
                        articlePosts: input.articlePosts ?? null,
                        unarchive: Boolean(input.unarchive),
                    },
                    before: c,
                    ...plan,
                    by: acting?.username ?? 'inconnu',
                    forced: Boolean(input.force),
                },
            },
        }));
        await this.prisma.$transaction(steps);
        return { dryRun: false, deleted: plan };
    }
};
exports.ResetService = ResetService;
exports.ResetService = ResetService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], ResetService);
//# sourceMappingURL=reset.service.js.map