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
const paginated_1 = require("../common/paginated");
let PostsService = class PostsService {
    prisma;
    constructor(prisma) {
        this.prisma = prisma;
    }
    async create(dto) {
        const { groupIds, ...postData } = dto;
        const uniqueGroupIds = [...new Set(groupIds)];
        const validGroups = await this.prisma.group.count({
            where: {
                id: { in: uniqueGroupIds },
                profiles: {
                    some: { profileId: dto.profileId, status: 'ACTIVE' },
                },
            },
        });
        if (validGroups !== uniqueGroupIds.length) {
            throw new common_1.BadRequestException('Tous les groupes doivent appartenir au profil du post');
        }
        return this.prisma.post.create({
            data: {
                ...postData,
                targets: {
                    create: uniqueGroupIds.map((groupId) => ({ groupId })),
                },
            },
            include: { targets: true },
        });
    }
    async findAll(profileId, { page, limit }) {
        const where = profileId ? { profileId } : {};
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
    findOne(id) {
        return this.prisma.post.findUniqueOrThrow({
            where: { id },
            include: { profile: true, targets: { include: { group: true } } },
        });
    }
    update(id, dto) {
        return this.prisma.post.update({ where: { id }, data: dto });
    }
};
exports.PostsService = PostsService;
exports.PostsService = PostsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], PostsService);
//# sourceMappingURL=posts.service.js.map