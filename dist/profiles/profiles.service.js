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
exports.facebookIdOfUrl = facebookIdOfUrl;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
const paginated_1 = require("../common/paginated");
const scope_1 = require("../auth/scope");
const profile_health_service_1 = require("./profile-health.service");
const profile_health_1 = require("./profile-health");
const moderator_guard_1 = require("../auth/moderator-guard");
function facebookIdOfUrl(url) {
    const m = /[?&]id=(\d{5,20})/.exec(url || '') || /facebook\.com\/(\d{5,20})(?:[/?#]|$)/.exec(url || '');
    return m ? m[1] : null;
}
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
        return this.prisma.profile
            .create({ data: { ...dto, facebookProfileUrl: dto.facebookProfileUrl?.trim() || null, ownerId: owner?.id ?? null } })
            .then((p) => this.adoptFacebookId(p));
    }
    async adoptFacebookId(p) {
        const id = facebookIdOfUrl(p.facebookProfileUrl);
        if (!id || p.facebookUserId)
            return p;
        const holder = await this.prisma.profile.findUnique({ where: { facebookUserId: id }, select: { id: true } });
        if (holder)
            return p;
        return (await this.prisma.profile.update({ where: { id: p.id }, data: { facebookUserId: id } }));
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
                    { facebookProfileUrl: { contains: search, mode: 'insensitive' } },
                ],
            });
        }
        if (query.status === 'SUSPENDED')
            and.push({ facebookSuspension: { not: null } });
        else if (query.status)
            and.push({ status: query.status });
        if (!query.withModerators)
            and.push({ isModerator: false });
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
            include: {
                _count: { select: { profileGroups: true, posts: true } },
                owner: { select: { id: true, username: true } },
            },
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
    async requestGroupRemoval(id, acting) {
        const profile = await this.prisma.profile.findFirst({
            where: { id, ...(0, scope_1.profileWhere)((0, scope_1.scopeOf)(acting)) },
            select: { id: true, name: true, facebookSuspension: true, facebookUserId: true },
        });
        if (!profile)
            throw new common_1.NotFoundException('Profil introuvable');
        if (profile.facebookSuspension !== 'disabled') {
            throw new common_1.BadRequestException('Seul un compte suspendu par Facebook (« Nous avons suspendu votre compte ») peut être retiré des groupes');
        }
        if (!profile.facebookUserId) {
            throw new common_1.BadRequestException('Identifiant Facebook inconnu : le modérateur ne pourrait pas le reconnaître sûrement. Renseignez-le d’abord.');
        }
        const { count } = await this.prisma.profileGroup.updateMany({
            where: { profileId: id, status: 'ACTIVE', removedAt: null },
            data: { removalRequestedAt: new Date(), removalAttempts: 0, removalClaimedUntil: null, removalError: null },
        });
        await this.prisma.activityLog.create({
            data: { profileId: id, eventType: 'PROFILE_REMOVAL_REQUESTED', message: `Retrait de « ${profile.name} » (suspendu par Facebook) de ${count} groupe(s) demandé au modérateur`, metadata: { groups: count, by: acting?.username ?? 'clé globale' } },
        });
        return { requested: count };
    }
    async clearSuspension(id, acting, opts = {}) {
        const profile = await this.prisma.profile.findFirst({
            where: { id, ...(0, scope_1.profileWhere)((0, scope_1.scopeOf)(acting)) },
            select: { id: true, name: true, facebookSuspension: true, modeBeforeSuspension: true },
        });
        if (!profile)
            throw new common_1.NotFoundException('Profil introuvable');
        await this.prisma.profile.update({ where: { id }, data: { facebookSuspension: null, suspendedAt: null, suspensionDetail: null, ...(opts.resume ? { modeBeforeSuspension: null } : {}) } });
        let mode = null;
        if (opts.resume) {
            const current = (await this.prisma.profileRunner.findUnique({ where: { profileId: id }, select: { mode: true } }))?.mode;
            const wanted = profile.modeBeforeSuspension ?? (current && current !== 'OFF' ? current : null);
            mode = wanted === 'ON' ? 'ON' : 'AUTO';
            await this.prisma.profileRunner.upsert({
                where: { profileId: id },
                create: { profileId: id, mode: mode },
                update: { mode: mode },
            });
        }
        const { count } = await this.prisma.profileGroup.updateMany({
            where: { profileId: id, removalRequestedAt: { not: null }, removedAt: null },
            data: { removalRequestedAt: null, removalClaimedUntil: null },
        });
        await this.prisma.activityLog.create({
            data: {
                profileId: id,
                eventType: 'PROFILE_SUSPENSION_CLEARED',
                message: `« ${profile.name} » ${mode ? `remis au travail (mode ${mode === 'ON' ? 'marche forcée' : 'auto'})` : 'marqué rétabli'}${profile.facebookSuspension ? ` après ${profile.facebookSuspension === 'checkpoint' ? 'une vérification Facebook' : profile.facebookSuspension === 'logged_out' ? 'une déconnexion' : 'une suspension'}` : ''}${count ? ` (${count} retrait(s) annulé(s))` : ''}`,
                metadata: { cancelled: count, previous: profile.facebookSuspension, mode, by: acting?.username ?? 'clé globale' },
            },
        });
        return { cleared: true, cancelledRemovals: count, mode };
    }
    async assign(dto, acting) {
        let owner = null;
        if (dto.ownerId) {
            const user = await this.prisma.user.findUnique({ where: { id: dto.ownerId }, select: { id: true, username: true, role: true, status: true } });
            if (!user)
                throw new common_1.NotFoundException('Compte introuvable');
            if (user.status !== 'ACTIVE')
                throw new common_1.BadRequestException('Ce compte est désactivé');
            if (user.role === 'ADMIN')
                throw new common_1.BadRequestException('Un administrateur voit déjà tous les profils : choisissez « Administration »');
            owner = { id: user.id, username: user.username };
        }
        const profiles = await this.prisma.profile.findMany({
            where: { id: { in: dto.profileIds } },
            select: { id: true, name: true, ownerId: true, owner: { select: { role: true } } },
        });
        if (!profiles.length)
            throw new common_1.NotFoundException('Aucun profil trouvé');
        const ids = profiles.map((p) => p.id);
        const repair = profiles
            .filter((p) => p.ownerId && p.ownerId !== (owner?.id ?? null) && p.owner?.role !== 'ADMIN')
            .map((p) => p.name);
        const { count } = await this.prisma.profile.updateMany({ where: { id: { in: ids } }, data: { ownerId: owner?.id ?? null } });
        let groupsShared = 0;
        if (owner && dto.shareGroups) {
            const links = await this.prisma.profileGroup.findMany({
                where: { profileId: { in: ids }, status: 'ACTIVE', group: { ownerId: { not: owner.id } } },
                select: { groupId: true },
                distinct: ['groupId'],
            });
            for (const { groupId } of links) {
                await this.prisma.groupAccess.upsert({
                    where: { groupId_userId: { groupId, userId: owner.id } },
                    create: { groupId, userId: owner.id, grantedBy: acting?.id ?? null },
                    update: {},
                });
            }
            groupsShared = links.length;
        }
        await this.prisma.activityLog.create({
            data: {
                eventType: 'PROFILE_ASSIGNED',
                message: `${count} profil(s) confié(s) à ${owner ? owner.username : 'l’administration'}${groupsShared ? `, ${groupsShared} groupe(s) partagé(s)` : ''}`,
                metadata: { profileIds: ids, ownerId: owner?.id ?? null, groupsShared, repair, by: acting?.username ?? 'clé globale' },
            },
        });
        return { updated: count, owner, groupsShared, repair };
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
            select: { id: true, isModerator: true },
        });
        if (!profile)
            throw new common_1.NotFoundException('Profil introuvable');
        (0, moderator_guard_1.assertMayManage)(profile, acting);
        return profile;
    }
    async update(id, dto, acting) {
        if (dto.minPostsPerJob !== undefined &&
            dto.maxPostsPerJob !== undefined &&
            dto.minPostsPerJob > dto.maxPostsPerJob) {
            throw new common_1.BadRequestException('minPostsPerJob doit être inférieur ou égal à maxPostsPerJob');
        }
        await this.reachable(id, acting);
        const data = dto.facebookProfileUrl !== undefined ? { ...dto, facebookProfileUrl: dto.facebookProfileUrl?.trim() || null } : dto;
        return this.adoptFacebookId(await this.prisma.profile.update({ where: { id }, data }));
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