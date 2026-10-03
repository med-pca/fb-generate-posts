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
const scope_1 = require("../auth/scope");
const profile_health_service_1 = require("./profile-health.service");
const profile_health_1 = require("./profile-health");
let ProfilesService = class ProfilesService {
    prisma;
    health;
    constructor(prisma, health) {
        this.prisma = prisma;
        this.health = health;
    }
    create(dto, owner) {
        if (dto.minPostsPerJob > dto.maxPostsPerJob) {
            throw new common_1.BadRequestException('minPostsPerJob doit être inférieur ou égal à maxPostsPerJob');
        }
        return this.prisma.profile.create({
            data: { ...dto, ownerId: owner?.id ?? null },
        });
    }
    async findAll(query, acting) {
        const { page, limit } = query;
        const and = [(0, scope_1.profileWhere)((0, scope_1.scopeOf)(acting))];
        const search = query.search?.trim();
        if (search) {
            and.push({
                OR: [
                    { name: { contains: search, mode: 'insensitive' } },
                    { externalId: { contains: search, mode: 'insensitive' } },
                    { facebookUserId: { contains: search } },
                    { facebookName: { contains: search, mode: 'insensitive' } },
                ],
            });
        }
        if (query.status)
            and.push({ status: query.status });
        if (query.activity === 'running')
            and.push({ runner: { mode: { not: 'OFF' } } });
        if (query.activity === 'off')
            and.push({ OR: [{ runner: null }, { runner: { mode: 'OFF' } }] });
        if (query.categoryId) {
            and.push({ profileGroups: { some: { status: 'ACTIVE', group: { categoryId: query.categoryId } } } });
        }
        const where = { AND: and };
        const candidates = await this.prisma.profile.findMany({
            where,
            select: { id: true, name: true, createdAt: true },
        });
        const health = await this.health.inputs(candidates.map((c) => c.id));
        const scored = candidates.map((c) => {
            const input = health.get(c.id);
            return { ...c, input, health: (0, profile_health_1.healthOf)(input) };
        });
        const kept = scored.filter((c) => !query.health
            ? true
            : query.health === 'deactivate'
                ? c.health.suggestDeactivate
                : c.health.label === query.health);
        const sort = query.sort ?? 'recent';
        kept.sort((a, b) => {
            if (sort === 'name')
                return a.name.localeCompare(b.name, 'fr');
            if (sort === 'score')
                return (b.health.score ?? -1) - (a.health.score ?? -1);
            if (sort === 'failures')
                return b.input.failed - a.input.failed || b.input.failStreak - a.input.failStreak;
            if (sort === 'published')
                return b.input.published - a.input.published;
            return b.createdAt.getTime() - a.createdAt.getTime();
        });
        const pageIds = kept.slice((page - 1) * limit, page * limit).map((c) => c.id);
        const rows = await this.prisma.profile.findMany({
            where: { id: { in: pageIds } },
            include: { _count: { select: { profileGroups: true, posts: true } } },
        });
        const byId = new Map(rows.map((r) => [r.id, r]));
        const byScore = new Map(kept.map((c) => [c.id, c]));
        const data = pageIds
            .map((id) => byId.get(id))
            .filter((r) => Boolean(r))
            .map((r) => {
            const h = byScore.get(r.id);
            return {
                ...r,
                health: {
                    score: h.health.score,
                    label: h.health.label,
                    labelText: profile_health_1.HEALTH_LABELS[h.health.label],
                    suggestDeactivate: h.health.suggestDeactivate,
                    reasons: h.health.reasons,
                    published: h.input.published,
                    failed: h.input.failed,
                    failStreak: h.input.failStreak,
                },
            };
        });
        return (0, paginated_1.paginated)(data, kept.length, page, limit);
    }
    async findOne(id, acting) {
        const profile = await this.prisma.profile.findFirst({
            where: { id, ...(0, scope_1.profileWhere)((0, scope_1.scopeOf)(acting)) },
            include: {
                profileGroups: { include: { group: true } },
                _count: { select: { posts: true, publicationJobs: true } },
            },
        });
        if (!profile)
            throw new common_1.NotFoundException('Profil introuvable');
        return profile;
    }
    async reachable(id, acting) {
        const profile = await this.prisma.profile.findFirst({
            where: { id, ...(0, scope_1.profileWhere)((0, scope_1.scopeOf)(acting)) },
            select: { id: true },
        });
        if (!profile)
            throw new common_1.NotFoundException('Profil introuvable');
        return profile;
    }
    async update(id, dto, acting) {
        if (dto.minPostsPerJob !== undefined &&
            dto.maxPostsPerJob !== undefined &&
            dto.minPostsPerJob > dto.maxPostsPerJob) {
            throw new common_1.BadRequestException('minPostsPerJob doit être inférieur ou égal à maxPostsPerJob');
        }
        await this.reachable(id, acting);
        return this.prisma.profile.update({ where: { id }, data: dto });
    }
    async remove(id, acting) {
        await this.reachable(id, acting);
        return this.prisma.profile.delete({ where: { id } });
    }
};
exports.ProfilesService = ProfilesService;
exports.ProfilesService = ProfilesService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        profile_health_service_1.ProfileHealthService])
], ProfilesService);
//# sourceMappingURL=profiles.service.js.map