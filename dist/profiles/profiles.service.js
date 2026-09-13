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
exports.ProfilesService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
const paginated_1 = require("../common/paginated");
let ProfilesService = class ProfilesService {
    prisma;
    constructor(prisma) {
        this.prisma = prisma;
    }
    create(dto) {
        if (dto.minPostsPerJob > dto.maxPostsPerJob) {
            throw new common_1.BadRequestException('minPostsPerJob doit être inférieur ou égal à maxPostsPerJob');
        }
        return this.prisma.profile.create({ data: dto });
    }
    async findAll({ page, limit }) {
        const where = {};
        const [data, total] = await this.prisma.$transaction([
            this.prisma.profile.findMany({
                where,
                include: { _count: { select: { profileGroups: true, posts: true } } },
                orderBy: { createdAt: 'desc' },
                skip: (page - 1) * limit,
                take: limit,
            }),
            this.prisma.profile.count({ where }),
        ]);
        return (0, paginated_1.paginated)(data, total, page, limit);
    }
    findOne(id) {
        return this.prisma.profile.findUniqueOrThrow({
            where: { id },
            include: {
                profileGroups: { include: { group: true } },
                _count: { select: { posts: true, publicationJobs: true } },
            },
        });
    }
    update(id, dto) {
        if (dto.minPostsPerJob !== undefined &&
            dto.maxPostsPerJob !== undefined &&
            dto.minPostsPerJob > dto.maxPostsPerJob) {
            throw new common_1.BadRequestException('minPostsPerJob doit être inférieur ou égal à maxPostsPerJob');
        }
        return this.prisma.profile.update({ where: { id }, data: dto });
    }
    remove(id) {
        return this.prisma.profile.delete({ where: { id } });
    }
};
exports.ProfilesService = ProfilesService;
exports.ProfilesService = ProfilesService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], ProfilesService);
//# sourceMappingURL=profiles.service.js.map