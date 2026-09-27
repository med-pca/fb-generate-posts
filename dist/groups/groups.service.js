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
const scope_1 = require("../auth/scope");
const paginated_1 = require("../common/paginated");
let GroupsService = class GroupsService {
    prisma;
    constructor(prisma) {
        this.prisma = prisma;
    }
    async create(profileId, dto, owner) {
        await this.reachableProfile(profileId, owner);
        return this.prisma.group.create({
            data: {
                ...dto,
                ownerId: owner?.id ?? null,
                profiles: { create: { profileId } },
            },
            include: { profiles: true },
        });
    }
    async findAll(profileId, acting) {
        await this.reachableProfile(profileId, acting);
        const links = await this.prisma.profileGroup.findMany({
            where: { profileId, status: 'ACTIVE' },
            include: { group: true },
            orderBy: { createdAt: 'desc' },
        });
        return links.map((link) => link.group);
    }
    async link(profileId, groupId, acting) {
        await this.reachableProfile(profileId, acting);
        await this.reachableGroup(groupId, acting);
        return this.prisma.profileGroup.upsert({
            where: { profileId_groupId: { profileId, groupId } },
            update: { status: 'ACTIVE' },
            create: { profileId, groupId },
            include: { profile: true, group: true },
        });
    }
    async unlink(profileId, groupId, acting) {
        await this.reachableProfile(profileId, acting);
        return this.prisma.profileGroup.delete({
            where: { profileId_groupId: { profileId, groupId } },
        });
    }
    async findCatalog({ page, limit }, acting) {
        const scoped = (0, scope_1.groupWhere)((0, scope_1.scopeOf)(acting));
        const [groups, total] = await this.prisma.$transaction([
            this.prisma.group.findMany({
                where: scoped,
                include: {
                    profiles: { include: { profile: true } },
                    _count: { select: { targets: true } },
                },
                orderBy: { createdAt: 'desc' },
                skip: (page - 1) * limit,
                take: limit,
            }),
            this.prisma.group.count({ where: scoped }),
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
    async reachableGroup(id, acting) {
        const group = await this.prisma.group.findFirst({
            where: { id, ...(0, scope_1.groupWhere)((0, scope_1.scopeOf)(acting)) },
            select: { id: true },
        });
        if (!group)
            throw new common_1.NotFoundException('Groupe introuvable');
        return group;
    }
    async ownedGroup(id, acting) {
        const group = await this.prisma.group.findFirst({
            where: { id, ...(0, scope_1.groupManageWhere)((0, scope_1.scopeOf)(acting)) },
            select: { id: true },
        });
        if (!group) {
            const shared = await this.prisma.group.findFirst({
                where: { id, ...(0, scope_1.groupWhere)((0, scope_1.scopeOf)(acting)) },
                select: { id: true },
            });
            throw shared
                ? new common_1.ForbiddenException('Ce groupe vous est partagé pour publier : seul son propriétaire le modifie')
                : new common_1.NotFoundException('Groupe introuvable');
        }
        return group;
    }
    async reachableProfile(id, acting) {
        const profile = await this.prisma.profile.findFirst({
            where: { id, ...(0, scope_1.profileWhere)((0, scope_1.scopeOf)(acting)) },
            select: { id: true },
        });
        if (!profile)
            throw new common_1.NotFoundException('Profil introuvable');
        return profile;
    }
    async update(id, dto, acting) {
        await this.ownedGroup(id, acting);
        return this.prisma.group.update({ where: { id }, data: dto });
    }
    async remove(id, acting) {
        await this.ownedGroup(id, acting);
        return this.prisma.group.delete({ where: { id } });
    }
    async findAutomationProfile(profileExternalId) {
        const profile = await this.prisma.profile.findFirst({
            where: { externalId: profileExternalId, status: 'ACTIVE' },
        });
        if (!profile)
            throw new common_1.NotFoundException('Profil introuvable');
        return profile;
    }
    async findForJoin(profileExternalId, statuses) {
        const profile = await this.findAutomationProfile(profileExternalId);
        const links = await this.prisma.profileGroup.findMany({
            where: {
                profileId: profile.id,
                status: 'ACTIVE',
                group: { status: 'ACTIVE' },
                ...(statuses ? { joinStatus: { in: statuses } } : {}),
            },
            include: { group: true },
            orderBy: { createdAt: 'asc' },
        });
        return links.map(({ group, joinStatus, joinCheckedAt, joinError }) => ({
            id: group.id,
            externalId: group.externalId,
            name: group.name,
            url: group.url,
            joinStatus,
            joinCheckedAt,
            joinError,
        }));
    }
    async updateJoinStatus(profileExternalId, groupId, { joinStatus, error }) {
        const profile = await this.findAutomationProfile(profileExternalId);
        const link = await this.prisma.profileGroup.findUnique({
            where: { profileId_groupId: { profileId: profile.id, groupId } },
        });
        if (!link)
            throw new common_1.NotFoundException('Groupe non lié à ce profil');
        const updated = await this.prisma.profileGroup.update({
            where: { id: link.id },
            data: { joinStatus, joinCheckedAt: new Date(), joinError: error ?? null },
        });
        await this.prisma.activityLog.create({
            data: {
                profileId: profile.id,
                groupId,
                eventType: 'GROUP_JOIN_UPDATED',
                level: joinStatus === 'FAILED' ? 'WARN' : 'INFO',
                message: `Adhésion au groupe : ${joinStatus}`,
                metadata: { previous: link.joinStatus, joinStatus, error },
            },
        });
        return {
            groupId,
            joinStatus: updated.joinStatus,
            joinCheckedAt: updated.joinCheckedAt,
            joinError: updated.joinError,
        };
    }
};
exports.GroupsService = GroupsService;
exports.GroupsService = GroupsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], GroupsService);
//# sourceMappingURL=groups.service.js.map