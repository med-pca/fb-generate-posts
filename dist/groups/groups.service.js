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
exports.GroupsService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
const paginated_1 = require("../common/paginated");
let GroupsService = class GroupsService {
    prisma;
    constructor(prisma) {
        this.prisma = prisma;
    }
    create(profileId, dto) {
        return this.prisma.group.create({
            data: {
                ...dto,
                profiles: { create: { profileId } },
            },
            include: { profiles: true },
        });
    }
    async findAll(profileId) {
        const links = await this.prisma.profileGroup.findMany({
            where: { profileId, status: 'ACTIVE' },
            include: { group: true },
            orderBy: { createdAt: 'desc' },
        });
        return links.map((link) => link.group);
    }
    link(profileId, groupId) {
        return this.prisma.profileGroup.upsert({
            where: { profileId_groupId: { profileId, groupId } },
            update: { status: 'ACTIVE' },
            create: { profileId, groupId },
            include: { profile: true, group: true },
        });
    }
    unlink(profileId, groupId) {
        return this.prisma.profileGroup.delete({
            where: { profileId_groupId: { profileId, groupId } },
        });
    }
    async findCatalog({ page, limit }) {
        const [groups, total] = await this.prisma.$transaction([
            this.prisma.group.findMany({
                include: {
                    profiles: { include: { profile: true } },
                    _count: { select: { targets: true } },
                },
                orderBy: { createdAt: 'desc' },
                skip: (page - 1) * limit,
                take: limit,
            }),
            this.prisma.group.count(),
        ]);
        const stocks = await this.prisma.postTarget.groupBy({
            by: ['groupId'],
            where: {
                groupId: { in: groups.map(({ id }) => id) },
                status: 'AVAILABLE',
                post: { status: 'AVAILABLE' },
            },
            _count: { _all: true },
        });
        const available = new Map(stocks.map((stock) => [stock.groupId, stock._count._all]));
        const data = groups.map((group) => ({
            ...group,
            availablePosts: available.get(group.id) ?? 0,
        }));
        return (0, paginated_1.paginated)(data, total, page, limit);
    }
    update(id, dto) {
        return this.prisma.group.update({ where: { id }, data: dto });
    }
    remove(id) {
        return this.prisma.group.delete({ where: { id } });
    }
};
exports.GroupsService = GroupsService;
exports.GroupsService = GroupsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], GroupsService);
//# sourceMappingURL=groups.service.js.map