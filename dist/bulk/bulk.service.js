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
exports.BulkService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
const scope_1 = require("../auth/scope");
const access_service_1 = require("../access/access.service");
const moderator_guard_1 = require("../auth/moderator-guard");
const MAX_PAIRS = 50_000;
let BulkService = class BulkService {
    prisma;
    access;
    constructor(prisma, access) {
        this.prisma = prisma;
        this.access = access;
    }
    async groupOptions(query, acting) {
        const and = [(0, scope_1.groupWhere)((0, scope_1.scopeOf)(acting))];
        const search = query.search?.trim();
        if (search)
            and.push({ OR: [{ name: { contains: search, mode: 'insensitive' } }, { url: { contains: search, mode: 'insensitive' } }] });
        if (query.categoryId)
            and.push({ categoryId: query.categoryId === 'none' ? null : query.categoryId });
        return this.prisma.group.findMany({
            where: { AND: and },
            orderBy: { name: 'asc' },
            take: 3000,
            select: {
                id: true,
                name: true,
                url: true,
                status: true,
                ownerId: true,
                category: { select: { id: true, name: true } },
                _count: { select: { profiles: true } },
            },
        });
    }
    profileOptions(query, acting) {
        const search = query.search?.trim();
        return this.prisma.profile.findMany({
            where: {
                AND: [
                    (0, scope_1.profileWhere)((0, scope_1.scopeOf)(acting)),
                    { isModerator: false },
                    search ? { OR: [{ name: { contains: search, mode: 'insensitive' } }, { externalId: { contains: search } }, { facebookName: { contains: search, mode: 'insensitive' } }] } : {},
                ],
            },
            orderBy: [{ createdAt: 'desc' }, { name: 'asc' }],
            take: 1000,
            select: { id: true, name: true, status: true, externalId: true, createdAt: true, facebookUserId: true, facebookName: true, facebookProfileUrl: true, _count: { select: { profileGroups: true } } },
        });
    }
    async link(input, acting) {
        const scope = (0, scope_1.scopeOf)(acting);
        const profileIds = [...new Set(input.profileIds)];
        const groupIds = [...new Set(input.groupIds)];
        if (profileIds.length * groupIds.length > MAX_PAIRS) {
            throw new common_1.BadRequestException(`Trop de liaisons d’un coup (${profileIds.length} × ${groupIds.length}) : découpez la sélection`);
        }
        const [profiles, groups] = await Promise.all([
            this.prisma.profile.findMany({
                where: { id: { in: profileIds }, ...(0, scope_1.profileWhere)(scope), ...((0, moderator_guard_1.isAdmin)(acting) ? {} : { isModerator: false }) },
                select: { id: true, name: true },
            }),
            this.prisma.group.findMany({ where: { id: { in: groupIds }, ...(0, scope_1.groupWhere)(scope) }, select: { id: true, name: true } }),
        ]);
        const pIds = profiles.map((p) => p.id);
        const gIds = groups.map((g) => g.id);
        const ignored = profileIds.length - pIds.length + (groupIds.length - gIds.length);
        if (!pIds.length || !gIds.length) {
            return { action: input.action, profiles: pIds.length, groups: gIds.length, created: 0, reactivated: 0, already: 0, removed: 0, ignored };
        }
        if (input.action === 'unlink') {
            const { count } = await this.prisma.profileGroup.deleteMany({ where: { profileId: { in: pIds }, groupId: { in: gIds } } });
            await this.log('GROUP_BULK_UNLINK', `${count} liaison(s) retirée(s) : ${pIds.length} profil(s) × ${gIds.length} groupe(s)`, acting, { profiles: pIds, groups: gIds, removed: count });
            return { action: 'unlink', profiles: pIds.length, groups: gIds.length, created: 0, reactivated: 0, already: 0, removed: count, ignored };
        }
        const existing = await this.prisma.profileGroup.findMany({
            where: { profileId: { in: pIds }, groupId: { in: gIds } },
            select: { profileId: true, groupId: true, status: true },
        });
        const key = (p, g) => `${p}|${g}`;
        const have = new Map(existing.map((e) => [key(e.profileId, e.groupId), e.status]));
        const toCreate = [];
        for (const p of pIds)
            for (const g of gIds)
                if (!have.has(key(p, g)))
                    toCreate.push({ profileId: p, groupId: g });
        const inactive = existing.filter((e) => e.status !== 'ACTIVE');
        const [created, reactivated] = await this.prisma.$transaction([
            this.prisma.profileGroup.createMany({ data: toCreate, skipDuplicates: true }),
            this.prisma.profileGroup.updateMany({
                where: { OR: inactive.map((e) => ({ profileId: e.profileId, groupId: e.groupId })) },
                data: { status: 'ACTIVE' },
            }),
        ]);
        const already = existing.length - inactive.length;
        await this.log('GROUP_BULK_LINK', `${created.count} liaison(s) créée(s), ${inactive.length ? `${reactivated.count} réactivée(s), ` : ''}${already} déjà en place : ${pIds.length} profil(s) × ${gIds.length} groupe(s)`, acting, { profiles: pIds, groups: gIds, created: created.count, reactivated: reactivated.count, already });
        return {
            action: 'link',
            profiles: pIds.length,
            groups: gIds.length,
            created: created.count,
            reactivated: inactive.length ? reactivated.count : 0,
            already,
            removed: 0,
            ignored,
        };
    }
    async memberships(input, acting, now = new Date()) {
        if (!input.joinStatus && input.preApproved === undefined)
            throw new common_1.BadRequestException('Choisissez un état d’adhésion ou la pré-approbation');
        if (input.preApproved && input.joinStatus && input.joinStatus !== 'JOINED') {
            throw new common_1.BadRequestException('Un profil pré-approuvé est forcément membre (« Rejoint »)');
        }
        let linked = { created: 0, reactivated: 0 };
        if (input.linkMissing) {
            const r = await this.link({ profileIds: input.profileIds, groupIds: input.groupIds, action: 'link' }, acting);
            linked = { created: r.created, reactivated: r.reactivated };
        }
        const scope = (0, scope_1.scopeOf)(acting);
        const where = {
            profileId: { in: [...new Set(input.profileIds)] },
            groupId: { in: [...new Set(input.groupIds)] },
            profile: { ...(0, scope_1.profileWhere)(scope), ...((0, moderator_guard_1.isAdmin)(acting) ? {} : { isModerator: false }) },
            group: (0, scope_1.groupWhere)(scope),
        };
        const by = acting?.username ?? 'un administrateur';
        const data = {};
        const joinStatus = input.preApproved ? 'JOINED' : input.joinStatus;
        if (joinStatus) {
            Object.assign(data, { joinStatus, joinCheckedAt: now, joinError: null });
            if (joinStatus === 'JOINED')
                Object.assign(data, { memberApprovedAt: now, memberRequestedAt: null, memberClaimedUntil: null, memberActionError: null, memberAttempts: 0 });
        }
        if (input.preApproved === true) {
            Object.assign(data, { preApprovedAt: now, preApprovalState: 'PREAPPROVED', preApprovalCheckedAt: now, preApprovalDetail: `marqué à la main par ${by}` });
        }
        else if (input.preApproved === false || (joinStatus && joinStatus !== 'JOINED')) {
            Object.assign(data, { preApprovedAt: null, preApprovalState: null, preApprovalDetail: null });
        }
        const { count } = await this.prisma.profileGroup.updateMany({ where, data });
        const pairs = new Set(input.profileIds).size * new Set(input.groupIds).size;
        const what = [
            joinStatus ? `« ${{ JOINED: 'rejoint', REQUESTED: 'demande envoyée', QUESTIONS: 'questions', NOT_JOINED: 'à rejoindre' }[joinStatus]} »` : '',
            input.preApproved === true ? 'pré-approuvé' : input.preApproved === false ? 'pré-approbation retirée' : '',
        ].filter(Boolean).join(' + ');
        await this.log('MEMBERSHIP_BULK_MANUAL', `${count} adhésion(s) marquée(s) ${what} à la main${linked.created ? ` (${linked.created} lien(s) créé(s))` : ''}`, acting, {
            profiles: input.profileIds, groups: input.groupIds, joinStatus: joinStatus ?? null, preApproved: input.preApproved ?? null, updated: count, ...linked,
        });
        return { updated: count, notLinked: Math.max(0, pairs - count), ...linked };
    }
    async share(input, acting) {
        const ids = [...new Set(input.ids)];
        const userIds = [...new Set(input.userIds)];
        const scope = (0, scope_1.scopeOf)(acting);
        const items = input.kind === 'groups'
            ? await this.prisma.group.findMany({ where: { id: { in: ids }, ...(0, scope_1.groupWhere)(scope) }, select: { id: true, name: true } })
            : await this.prisma.contentSource.findMany({ where: { id: { in: ids }, ...(0, scope_1.siteWhere)(scope) }, select: { id: true, name: true } });
        let done = 0;
        const failures = [];
        for (const item of items) {
            for (const userId of userIds) {
                try {
                    if (input.kind === 'groups') {
                        if (input.action === 'grant')
                            await this.access.grantGroup(item.id, userId, acting);
                        else
                            await this.access.revokeGroup(item.id, userId, acting);
                    }
                    else if (input.action === 'grant')
                        await this.access.grantSite(item.id, userId, acting);
                    else
                        await this.access.revokeSite(item.id, userId, acting);
                    done += 1;
                }
                catch (error) {
                    failures.push({ item: item.name, userId, reason: error.message });
                }
            }
        }
        await this.log(input.action === 'grant' ? 'GROUP_BULK_SHARE' : 'GROUP_BULK_UNSHARE', `${input.action === 'grant' ? 'Partage' : 'Retrait de partage'} en masse : ${done} fait(s) sur ${items.length} ${input.kind === 'groups' ? 'groupe(s)' : 'site(s)'} × ${userIds.length} compte(s)${failures.length ? `, ${failures.length} refus` : ''}`, acting, { kind: input.kind, ids: items.map((i) => i.id), userIds, done, failures: failures.slice(0, 50) });
        return { done, items: items.length, users: userIds.length, ignored: ids.length - items.length, failures: failures.slice(0, 100) };
    }
    log(eventType, message, acting, metadata) {
        return this.prisma.activityLog.create({
            data: { eventType, message, metadata: { ...metadata, by: acting?.username ?? 'clé globale' } },
        });
    }
};
exports.BulkService = BulkService;
exports.BulkService = BulkService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        access_service_1.AccessService])
], BulkService);
//# sourceMappingURL=bulk.service.js.map