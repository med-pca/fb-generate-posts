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
exports.UsersService = void 0;
exports.publicUser = publicUser;
const common_1 = require("@nestjs/common");
const client_1 = require("@prisma/client");
const password_1 = require("../auth/password");
const prisma_service_1 = require("../prisma/prisma.service");
function publicUser(user) {
    return {
        id: user.id,
        username: user.username,
        role: user.role,
        status: user.status,
        createdAt: user.createdAt,
    };
}
let UsersService = class UsersService {
    prisma;
    constructor(prisma) {
        this.prisma = prisma;
    }
    async findAll() {
        const users = await this.prisma.user.findMany({
            orderBy: [{ role: 'asc' }, { username: 'asc' }],
        });
        return users.map(publicUser);
    }
    async create(dto) {
        const existing = await this.prisma.user.findUnique({
            where: { username: dto.username },
        });
        if (existing)
            throw new common_1.ConflictException('Ce nom d’utilisateur est déjà pris');
        const user = await this.prisma.user.create({
            data: {
                username: dto.username,
                passwordHash: (0, password_1.hashPassword)(dto.password),
                role: dto.role ?? client_1.Role.MANAGER,
                automationKey: (0, password_1.newAutomationKey)(),
            },
        });
        return { ...publicUser(user), automationKey: user.automationKey };
    }
    async update(id, dto, acting) {
        const user = await this.load(id);
        if (dto.username && dto.username !== user.username) {
            const taken = await this.prisma.user.findUnique({
                where: { username: dto.username },
            });
            if (taken)
                throw new common_1.ConflictException('Ce nom d’utilisateur est déjà pris');
        }
        if (user.id === acting.id) {
            if (dto.role && dto.role !== client_1.Role.ADMIN) {
                throw new common_1.BadRequestException('Un administrateur ne peut pas se rétrograder');
            }
            if (dto.status === client_1.RecordStatus.INACTIVE) {
                throw new common_1.BadRequestException('Un administrateur ne peut pas se désactiver');
            }
        }
        if (user.role === client_1.Role.ADMIN &&
            (dto.role === client_1.Role.MANAGER || dto.status === client_1.RecordStatus.INACTIVE)) {
            await this.assertAnotherAdminRemains(user.id);
        }
        const updated = await this.prisma.user.update({
            where: { id },
            data: {
                ...(dto.username ? { username: dto.username } : {}),
                ...(dto.password ? { passwordHash: (0, password_1.hashPassword)(dto.password) } : {}),
                ...(dto.role ? { role: dto.role } : {}),
                ...(dto.status ? { status: dto.status } : {}),
            },
        });
        return publicUser(updated);
    }
    async rotateKey(id) {
        await this.load(id);
        const user = await this.prisma.user.update({
            where: { id },
            data: { automationKey: (0, password_1.newAutomationKey)() },
        });
        return { ...publicUser(user), automationKey: user.automationKey };
    }
    async remove(id, acting) {
        const user = await this.load(id);
        if (user.id === acting.id) {
            throw new common_1.BadRequestException('Un administrateur ne peut pas se supprimer');
        }
        if (user.role === client_1.Role.ADMIN)
            await this.assertAnotherAdminRemains(user.id);
        const released = await this.owned(id);
        await this.prisma.user.delete({ where: { id } });
        return { deleted: true, released };
    }
    async assertAnotherAdminRemains(exceptId) {
        const others = await this.prisma.user.count({
            where: {
                role: client_1.Role.ADMIN,
                status: client_1.RecordStatus.ACTIVE,
                id: { not: exceptId },
            },
        });
        if (!others) {
            throw new common_1.BadRequestException('Il doit rester au moins un administrateur actif');
        }
    }
    async owned(id) {
        const [profiles, groups, sites, ingests] = await Promise.all([
            this.prisma.profile.count({ where: { ownerId: id } }),
            this.prisma.group.count({ where: { ownerId: id } }),
            this.prisma.contentSource.count({ where: { ownerId: id } }),
            this.prisma.sourceIngest.count({ where: { ownerId: id } }),
        ]);
        return { profiles, groups, sites, ingests };
    }
    async load(id) {
        const user = await this.prisma.user.findUnique({ where: { id } });
        if (!user)
            throw new common_1.NotFoundException('Compte introuvable');
        return user;
    }
};
exports.UsersService = UsersService;
exports.UsersService = UsersService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], UsersService);
//# sourceMappingURL=users.service.js.map