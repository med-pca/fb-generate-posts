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
exports.AccessService = void 0;
const common_1 = require("@nestjs/common");
const client_1 = require("@prisma/client");
const prisma_service_1 = require("../prisma/prisma.service");
let AccessService = class AccessService {
    prisma;
    constructor(prisma) {
        this.prisma = prisma;
    }
    listGroupAccess(groupId, acting) {
        return this.list('group', groupId, acting);
    }
    listSiteAccess(sourceId, acting) {
        return this.list('site', sourceId, acting);
    }
    grantGroup(groupId, userId, acting) {
        return this.grant('group', groupId, userId, acting);
    }
    grantSite(sourceId, userId, acting) {
        return this.grant('site', sourceId, userId, acting);
    }
    revokeGroup(groupId, userId, acting) {
        return this.revoke('group', groupId, userId, acting);
    }
    revokeSite(sourceId, userId, acting) {
        return this.revoke('site', sourceId, userId, acting);
    }
    async list(kind, id, acting) {
        await this.assertOwner(kind, id, acting);
        const rows = kind === 'group'
            ? await this.prisma.groupAccess.findMany({
                where: { groupId: id },
                include: {
                    user: { select: { id: true, username: true, role: true } },
                },
                orderBy: { createdAt: 'asc' },
            })
            : await this.prisma.siteAccess.findMany({
                where: { sourceId: id },
                include: {
                    user: { select: { id: true, username: true, role: true } },
                },
                orderBy: { createdAt: 'asc' },
            });
        return rows.map((row) => ({
            userId: row.user.id,
            username: row.user.username,
            role: row.user.role,
            grantedAt: row.createdAt,
        }));
    }
    async grant(kind, id, userId, acting) {
        const owner = await this.assertOwner(kind, id, acting);
        if (userId === owner.ownerId) {
            throw new common_1.BadRequestException('Le propriétaire a déjà tous les droits sur cette ressource');
        }
        const user = await this.prisma.user.findUnique({ where: { id: userId } });
        if (!user)
            throw new common_1.NotFoundException('Compte introuvable');
        if (user.status !== client_1.RecordStatus.ACTIVE) {
            throw new common_1.BadRequestException('Ce compte est désactivé');
        }
        if (user.role === client_1.Role.ADMIN) {
            throw new common_1.BadRequestException('Un administrateur voit déjà toutes les ressources');
        }
        const data = {
            userId,
            grantedBy: acting?.id ?? null,
            ...(kind === 'group' ? { groupId: id } : { sourceId: id }),
        };
        if (kind === 'group') {
            await this.prisma.groupAccess.upsert({
                where: { groupId_userId: { groupId: id, userId } },
                create: data,
                update: {},
            });
        }
        else {
            await this.prisma.siteAccess.upsert({
                where: { sourceId_userId: { sourceId: id, userId } },
                create: data,
                update: {},
            });
        }
        return { granted: true, userId, username: user.username };
    }
    async revoke(kind, id, userId, acting) {
        await this.assertOwner(kind, id, acting);
        const { count } = kind === 'group'
            ? await this.prisma.groupAccess.deleteMany({
                where: { groupId: id, userId },
            })
            : await this.prisma.siteAccess.deleteMany({
                where: { sourceId: id, userId },
            });
        if (!count)
            throw new common_1.NotFoundException('Ce partage n’existe pas');
        return { revoked: true, userId };
    }
    async assertOwner(kind, id, acting) {
        const resource = kind === 'group'
            ? await this.prisma.group.findUnique({
                where: { id },
                select: { id: true, ownerId: true },
            })
            : await this.prisma.contentSource.findUnique({
                where: { id },
                select: { id: true, ownerId: true },
            });
        if (!resource) {
            throw new common_1.NotFoundException(kind === 'group' ? 'Groupe introuvable' : 'Site introuvable');
        }
        if (!acting || acting.role === client_1.Role.ADMIN)
            return resource;
        if (resource.ownerId !== acting.id) {
            throw resource.ownerId === null
                ? new common_1.NotFoundException('Ressource introuvable')
                : new common_1.ForbiddenException('Seul le propriétaire partage cette ressource');
        }
        return resource;
    }
};
exports.AccessService = AccessService;
exports.AccessService = AccessService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], AccessService);
//# sourceMappingURL=access.service.js.map