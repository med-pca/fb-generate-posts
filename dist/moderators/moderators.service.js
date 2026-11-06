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
exports.ModeratorsService = void 0;
const common_1 = require("@nestjs/common");
const client_1 = require("@prisma/client");
const prisma_service_1 = require("../prisma/prisma.service");
const scope_1 = require("../auth/scope");
const verify_service_1 = require("../verify/verify.service");
const members_service_1 = require("../verify/members.service");
const DAY = 86_400_000;
const ONLINE_SECONDS = 180;
const VERIFY_KINDS = ['VERIFIED_OK', 'VERIFY_MISSING_POST', 'VERIFY_MISSING_LINK', 'VERIFY_PENDING', 'VERIFY_UNREACHABLE', 'DELETED', 'DELETE_FAILED', 'URL_FOUND'];
const MEMBER_EVENTS = ['MEMBER_APPROVED', 'MEMBER_PREAPPROVED', 'MEMBER_ACTION_FAILED', 'MEMBER_MISMATCH'];
const empty = () => ({
    verified: 0,
    ok: 0,
    missingPost: 0,
    missingLink: 0,
    pending: 0,
    unreachable: 0,
    deleted: 0,
    deleteFailed: 0,
    urlFound: 0,
    approved: 0,
    preApproved: 0,
    memberFailed: 0,
});
let ModeratorsService = class ModeratorsService {
    prisma;
    verify;
    members;
    constructor(prisma, verify, members) {
        this.prisma = prisma;
        this.verify = verify;
        this.members = members;
    }
    settingsOf(p, now) {
        return {
            paused: p.moderatorPaused,
            runRequestedAt: p.moderatorRunAt,
            membersRunRequestedAt: p.moderatorMembersRunAt,
            batchSize: p.moderatorBatch,
            everyMinutes: p.moderatorEveryMinutes,
            members: p.moderatorMembers,
            postsCheck: p.moderatorPostsCheck,
            removals: p.moderatorRemovals,
            spam: p.moderatorSpam,
            pending: p.moderatorPending,
            windowStart: p.moderatorWindowStart,
            windowEnd: p.moderatorWindowEnd,
            timezone: p.moderatorTimezone,
            hourlyLimit: p.moderatorHourlyLimit,
            dailyLimit: p.moderatorDailyLimit,
            seenAt: p.moderatorSeenAt,
            agent: p.moderatorAgent,
            online: Boolean(p.moderatorSeenAt && now.getTime() - p.moderatorSeenAt.getTime() < ONLINE_SECONDS * 1000),
        };
    }
    async counts(ids, since) {
        const out = new Map(ids.map((id) => [id, empty()]));
        if (!ids.length)
            return out;
        const list = client_1.Prisma.join(ids);
        const [traces, members] = await Promise.all([
            this.prisma.$queryRaw(client_1.Prisma.sql `
        SELECT profile_id, kind, COUNT(*) AS n FROM publication_traces
        WHERE profile_id IN (${list}) AND created_at >= ${since}
          AND kind IN (${client_1.Prisma.join([...VERIFY_KINDS])})
        GROUP BY profile_id, kind`),
            this.prisma.$queryRaw(client_1.Prisma.sql `
        SELECT metadata->>'moderatorId' AS moderator_id, event_type, COUNT(*) AS n FROM activity_logs
        WHERE event_type IN (${client_1.Prisma.join([...MEMBER_EVENTS])}) AND created_at >= ${since}
          AND metadata->>'moderatorId' IN (${list})
        GROUP BY 1, 2`),
        ]);
        const KEY = {
            VERIFIED_OK: 'ok',
            VERIFY_MISSING_POST: 'missingPost',
            VERIFY_MISSING_LINK: 'missingLink',
            VERIFY_PENDING: 'pending',
            VERIFY_UNREACHABLE: 'unreachable',
            DELETED: 'deleted',
            DELETE_FAILED: 'deleteFailed',
            URL_FOUND: 'urlFound',
            MEMBER_APPROVED: 'approved',
            MEMBER_PREAPPROVED: 'preApproved',
            MEMBER_ACTION_FAILED: 'memberFailed',
            MEMBER_MISMATCH: 'memberFailed',
        };
        for (const t of traces) {
            const c = out.get(t.profile_id);
            c[KEY[t.kind]] += Number(t.n);
            if (['VERIFIED_OK', 'VERIFY_MISSING_POST', 'VERIFY_MISSING_LINK', 'VERIFY_PENDING', 'VERIFY_UNREACHABLE'].includes(t.kind)) {
                c.verified += Number(t.n);
            }
        }
        for (const m of members) {
            const c = out.get(m.moderator_id);
            if (c)
                c[KEY[m.event_type]] += Number(m.n);
        }
        return out;
    }
    moderatorsWhere(acting) {
        return { isModerator: true, ...(0, scope_1.profileWhere)((0, scope_1.scopeOf)(acting)) };
    }
    async list(acting, now = new Date()) {
        const moderators = await this.prisma.profile.findMany({
            where: this.moderatorsWhere(acting),
            orderBy: { name: 'asc' },
        });
        const ids = moderators.map((m) => m.id);
        const dayStart = new Date(now.getTime() - DAY);
        const [today, week] = await Promise.all([
            this.counts(ids, dayStart),
            this.counts(ids, new Date(now.getTime() - 7 * DAY)),
        ]);
        const [verifyStats, membersOverview] = await Promise.all([this.verify.stats(acting, now), this.members.overview(acting, now)]);
        return {
            due: { verifications: verifyStats.due, needsAction: verifyStats.needsAction, members: membersOverview.due },
            moderators: moderators.map((m) => ({
                id: m.id,
                name: m.name,
                status: m.status,
                externalId: m.externalId,
                facebookUserId: m.facebookUserId,
                settings: this.settingsOf(m, now),
                today: today.get(m.id),
                week: week.get(m.id),
            })),
        };
    }
    async reachable(id, acting) {
        const m = await this.prisma.profile.findFirst({ where: { id, ...this.moderatorsWhere(acting) } });
        if (!m)
            throw new common_1.NotFoundException('Modérateur introuvable');
        return m;
    }
    async detail(id, acting, now = new Date()) {
        const m = await this.reachable(id, acting);
        const settings = await this.prisma.automationSetting.findUnique({ where: { id: 'global' } });
        const tz = settings?.objectiveTimezone || 'Europe/Paris';
        const since14 = new Date(now.getTime() - 14 * DAY);
        const [today, week, month, total, daily, memberDaily, recent] = await Promise.all([
            this.counts([id], new Date(now.getTime() - DAY)),
            this.counts([id], new Date(now.getTime() - 7 * DAY)),
            this.counts([id], new Date(now.getTime() - 30 * DAY)),
            this.counts([id], new Date(0)),
            this.prisma.$queryRaw(client_1.Prisma.sql `
        SELECT to_char(created_at AT TIME ZONE ${tz}, 'YYYY-MM-DD') AS day,
          COUNT(*) FILTER (WHERE kind = 'VERIFIED_OK') AS ok,
          COUNT(*) FILTER (WHERE kind IN ('VERIFY_MISSING_POST', 'VERIFY_MISSING_LINK')) AS problems
        FROM publication_traces
        WHERE profile_id = ${id} AND created_at >= ${since14}
        GROUP BY 1 ORDER BY 1`),
            this.prisma.$queryRaw(client_1.Prisma.sql `
        SELECT to_char(created_at AT TIME ZONE ${tz}, 'YYYY-MM-DD') AS day, COUNT(*) AS n
        FROM activity_logs
        WHERE event_type IN ('MEMBER_APPROVED', 'MEMBER_PREAPPROVED') AND metadata->>'moderatorId' = ${id} AND created_at >= ${since14}
        GROUP BY 1`),
            this.prisma.activityLog.findMany({
                where: {
                    createdAt: { gte: new Date(now.getTime() - 30 * DAY) },
                    OR: [
                        { profileId: id, eventType: { startsWith: 'VERIFY_' } },
                        { eventType: { startsWith: 'MEMBER_' }, metadata: { path: ['moderatorId'], equals: id } },
                    ],
                },
                orderBy: { createdAt: 'desc' },
                take: 40,
                include: {
                    group: { select: { id: true, name: true } },
                    post: { select: { id: true, title: true } },
                    profile: { select: { id: true, name: true } },
                },
            }),
        ]);
        const byDay = new Map(daily.map((d) => [d.day, d]));
        const memberBy = new Map(memberDaily.map((d) => [d.day, Number(d.n)]));
        const days = Array.from({ length: 14 }, (_, i) => {
            const key = new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date(now.getTime() - (13 - i) * DAY));
            const row = byDay.get(key);
            return { day: key, ok: Number(row?.ok ?? 0), problems: Number(row?.problems ?? 0), members: memberBy.get(key) ?? 0 };
        });
        const [verifyStats, membersOverview] = await Promise.all([this.verify.stats(acting, now), this.members.overview(acting, now)]);
        return {
            moderator: {
                id: m.id,
                name: m.name,
                status: m.status,
                externalId: m.externalId,
                facebookUserId: m.facebookUserId,
                settings: this.settingsOf(m, now),
            },
            counts: { today: today.get(id), week: week.get(id), month: month.get(id), total: total.get(id) },
            days,
            due: { verifications: verifyStats.due, needsAction: verifyStats.needsAction, members: membersOverview.due, memberProblems: membersOverview.problems.length },
            recent: recent.map((r) => ({
                at: r.createdAt,
                level: r.level,
                eventType: r.eventType,
                message: r.message,
                facebookUrl: r.facebookUrl,
                postTargetId: r.postTargetId,
                group: r.group,
                post: r.post,
                member: r.eventType.startsWith('MEMBER_') ? r.profile : null,
            })),
        };
    }
    async updateSettings(id, patch, acting) {
        const m = await this.reachable(id, acting);
        const data = {};
        if (patch.paused !== undefined)
            data.moderatorPaused = patch.paused;
        if (patch.batchSize !== undefined)
            data.moderatorBatch = patch.batchSize;
        if (patch.everyMinutes !== undefined)
            data.moderatorEveryMinutes = patch.everyMinutes;
        if (patch.members !== undefined)
            data.moderatorMembers = patch.members;
        if (patch.postsCheck !== undefined)
            data.moderatorPostsCheck = patch.postsCheck;
        if (patch.removals !== undefined)
            data.moderatorRemovals = patch.removals;
        if (patch.spam !== undefined)
            data.moderatorSpam = patch.spam;
        if (patch.pending !== undefined)
            data.moderatorPending = patch.pending;
        if (patch.windowStart !== undefined)
            data.moderatorWindowStart = patch.windowStart;
        if (patch.windowEnd !== undefined)
            data.moderatorWindowEnd = patch.windowEnd;
        if (patch.hourlyLimit !== undefined)
            data.moderatorHourlyLimit = patch.hourlyLimit;
        if (patch.dailyLimit !== undefined)
            data.moderatorDailyLimit = patch.dailyLimit;
        if (patch.timezone !== undefined) {
            try {
                new Intl.DateTimeFormat('fr-FR', { timeZone: patch.timezone });
            }
            catch {
                throw new common_1.BadRequestException(`Fuseau horaire inconnu : ${patch.timezone}`);
            }
            data.moderatorTimezone = patch.timezone;
        }
        const updated = await this.prisma.profile.update({ where: { id }, data });
        await this.log(m, 'MODERATOR_SETTINGS', `Réglages du modérateur « ${m.name} » modifiés`, acting, patch);
        return this.settingsOf(updated, new Date());
    }
    async run(id, acting, kind = 'posts', now = new Date()) {
        const m = await this.reachable(id, acting);
        if (m.moderatorPaused)
            throw new common_1.BadRequestException('Ce modérateur est suspendu : reprenez-le d’abord');
        if (kind === 'members' && !m.moderatorMembers && !m.moderatorSpam && !m.moderatorPending && !m.moderatorRemovals) {
            throw new common_1.BadRequestException('Les missions de groupe (pré-approbation, spam, posts en attente, retraits) sont toutes désactivées dans ses réglages');
        }
        if (kind === 'posts' && !m.moderatorPostsCheck) {
            throw new common_1.BadRequestException('La vérification des posts est désactivée dans ses réglages : activez-la d’abord');
        }
        await this.prisma.profile.update({
            where: { id },
            data: kind === 'members' ? { moderatorMembersRunAt: now } : { moderatorRunAt: now },
        });
        await this.log(m, kind === 'members' ? 'MODERATOR_MEMBERS_RUN_REQUESTED' : 'MODERATOR_RUN_REQUESTED', kind === 'members'
            ? `Tâches « nos profils » (adhésions, pré-approbations) demandées à « ${m.name} »`
            : `Vérification des posts demandée à « ${m.name} »`, acting, { kind });
        return { kind, requestedAt: now, online: this.settingsOf(m, now).online };
    }
    async recheck(id, acting) {
        const m = await this.reachable(id, acting);
        const { count } = await this.prisma.postTarget.updateMany({
            where: { verifyStatus: client_1.VerifyStatus.NEEDS_ACTION },
            data: { verifyStatus: null, verifyAttempts: 0, verifyClaimedUntil: null },
        });
        await this.log(m, 'MODERATOR_RECHECK', `${count} publication(s) « à traiter » remise(s) en vérification`, acting, { count });
        return { requeued: count };
    }
    async retryMembers(id, acting) {
        const m = await this.reachable(id, acting);
        const { count } = await this.prisma.profileGroup.updateMany({
            where: { memberActionError: { not: null } },
            data: { memberAttempts: 0, memberClaimedUntil: null, memberActionError: null },
        });
        await this.log(m, 'MODERATOR_RETRY_MEMBERS', `${count} adhésion(s) / pré-approbation(s) relancée(s)`, acting, { count });
        return { requeued: count };
    }
    async control(profileExternalId, agent, acting, now = new Date()) {
        const m = await this.verify.moderator(profileExternalId, acting);
        const updated = await this.prisma.profile.update({
            where: { id: m.id },
            data: { moderatorSeenAt: now, ...(agent ? { moderatorAgent: agent.slice(0, 200) } : {}) },
        });
        return this.settingsOf(updated, now);
    }
    log(m, eventType, message, acting, extra = {}) {
        return this.prisma.activityLog.create({
            data: {
                profileId: m.id,
                eventType,
                message,
                metadata: { ...extra, moderatorId: m.id, by: acting?.username ?? 'clé globale' },
            },
        });
    }
};
exports.ModeratorsService = ModeratorsService;
exports.ModeratorsService = ModeratorsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        verify_service_1.VerifyService,
        members_service_1.MembersService])
], ModeratorsService);
//# sourceMappingURL=moderators.service.js.map