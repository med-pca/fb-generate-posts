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
exports.PostsService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
const scope_1 = require("../auth/scope");
const post_groups_1 = require("./post-groups");
const paginated_1 = require("../common/paginated");
let PostsService = class PostsService {
    prisma;
    constructor(prisma) {
        this.prisma = prisma;
    }
    async create(dto, acting = null) {
        const { groupIds, ...postData } = dto;
        const uniqueGroupIds = await (0, post_groups_1.postGroupIds)(this.prisma, groupIds, acting);
        return this.prisma.post.create({
            data: {
                ...postData,
                ownerId: acting?.id ?? null,
                targets: {
                    create: uniqueGroupIds.map((groupId) => ({ groupId })),
                },
            },
            include: { targets: true },
        });
    }
    async findAll({ page, limit, ...filters }, acting) {
        const where = this.buildWhere(filters, acting);
        const [data, total] = await this.prisma.$transaction([
            this.prisma.post.findMany({
                where,
                include: { targets: { include: { group: true } } },
                orderBy: { createdAt: 'desc' },
                skip: (page - 1) * limit,
                take: limit,
            }),
            this.prisma.post.count({ where }),
        ]);
        return (0, paginated_1.paginated)(data, total, page, limit);
    }
    async findOne(id, acting) {
        const post = await this.prisma.post.findFirst({
            where: { id, ...(0, scope_1.postWhere)((0, scope_1.scopeOf)(acting)) },
            include: { profile: true, targets: { include: { group: true } } },
        });
        if (!post)
            throw new common_1.NotFoundException('Post introuvable');
        return post;
    }
    async update(id, dto, acting) {
        await this.reachable(id, acting);
        return this.prisma.post.update({ where: { id }, data: dto });
    }
    async reachable(id, acting) {
        const post = await this.prisma.post.findFirst({
            where: { id, ...(0, scope_1.postWhere)((0, scope_1.scopeOf)(acting)) },
            select: { id: true },
        });
        if (!post)
            throw new common_1.NotFoundException('Post introuvable');
        return post;
    }
    async remove(id, force = false, acting = null) {
        await this.reachable(id, acting);
        const post = await this.prisma.post.findUniqueOrThrow({
            where: { id },
            select: { id: true, targets: this.activeClaimSelect() },
        });
        if (post.targets.length && !force) {
            throw new common_1.ConflictException('Ce post est réservé par un automate en cours. Attendez la fin du ' +
                'job ou utilisez force=true pour le supprimer malgré tout.');
        }
        return this.prisma.post.delete({ where: { id } });
    }
    async bulkRemove(dto, acting = null) {
        const { dryRun, force, ...filters } = dto;
        if (!this.hasCriteria(filters)) {
            throw new common_1.BadRequestException('Précisez au moins ids, profileId, groupId, articleId, status ou sourceType');
        }
        const where = this.buildWhere(filters, acting);
        return this.prisma.$transaction(async (tx) => {
            const matched = await tx.post.count({ where });
            const claimed = await tx.post.findMany({
                where: {
                    AND: [where, { targets: { some: this.activeClaimWhere() } }],
                },
                select: { id: true, title: true },
            });
            const blocked = force ? [] : claimed;
            if (dryRun || matched - blocked.length === 0) {
                return this.report(matched, 0, blocked, dryRun);
            }
            const { count } = await tx.post.deleteMany({
                where: blocked.length
                    ? { AND: [where, { id: { notIn: blocked.map(({ id }) => id) } }] }
                    : where,
            });
            return this.report(matched, count, blocked, dryRun);
        });
    }
    report(matched, deleted, blocked, dryRun) {
        return {
            dryRun,
            matched,
            deleted,
            blocked: blocked.length,
            blockedPosts: blocked,
        };
    }
    hasCriteria(filters) {
        return Boolean(filters.ids?.length ||
            filters.profileId ||
            filters.groupId ||
            filters.articleId ||
            filters.status ||
            filters.sourceType);
    }
    buildWhere(filters, acting) {
        const scope = (0, scope_1.postWhere)((0, scope_1.scopeOf)(acting));
        const and = Object.keys(scope).length
            ? [scope]
            : [];
        const where = {};
        if (filters.ids?.length)
            where.id = { in: [...new Set(filters.ids)] };
        if (filters.profileId)
            where.profileId = filters.profileId;
        if (filters.articleId)
            where.articleId = filters.articleId;
        if (filters.status)
            where.status = filters.status;
        if (filters.sourceType)
            where.sourceType = filters.sourceType;
        if (filters.groupId)
            where.targets = { some: { groupId: filters.groupId } };
        if (filters.search?.trim()) {
            const contains = filters.search.trim();
            and.push({
                OR: [
                    { title: { contains, mode: 'insensitive' } },
                    { description: { contains, mode: 'insensitive' } },
                ],
            });
        }
        if (and.length)
            where.AND = and;
        return where;
    }
    activeClaimWhere() {
        return { status: 'CLAIMED', claimExpiresAt: { gt: new Date() } };
    }
    activeClaimSelect() {
        return { where: this.activeClaimWhere(), select: { id: true } };
    }
};
exports.PostsService = PostsService;
exports.PostsService = PostsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], PostsService);
//# sourceMappingURL=posts.service.js.map