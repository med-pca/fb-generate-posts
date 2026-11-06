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
exports.GroupTasksService = exports.SPAM_OUTCOMES = exports.GROUP_TASK_OUTCOMES = void 0;
const common_1 = require("@nestjs/common");
const client_1 = require("@prisma/client");
const prisma_service_1 = require("../prisma/prisma.service");
const scope_1 = require("../auth/scope");
const trace_1 = require("../trace/trace");
const verify_service_1 = require("./verify.service");
exports.GROUP_TASK_OUTCOMES = ['done', 'already', 'not_found', 'no_permission', 'unreachable'];
const CLAIM_MINUTES = 30;
exports.SPAM_OUTCOMES = ['done', 'nothing', 'no_permission', 'unreachable'];
const SPAM_EVERY_HOURS = 6;
const SPAM_RECENT_DAYS = 14;
const SPAM_RETRY_MINUTES = {
    done: SPAM_EVERY_HOURS * 60,
    nothing: SPAM_EVERY_HOURS * 60,
    no_permission: 7 * 24 * 60,
    unreachable: 60,
};
const MAX_REMOVAL_ATTEMPTS = 6;
const MAX_APPROVAL_ATTEMPTS = 4;
const RETRY_MINUTES = {
    not_found: 3 * 60,
    no_permission: 24 * 60,
    unreachable: 30,
};
let GroupTasksService = class GroupTasksService {
    prisma;
    verify;
    constructor(prisma, verify) {
        this.prisma = prisma;
        this.verify = verify;
    }
    async claimRemovals(profileExternalId, limit, acting, now = new Date()) {
        const moderator = await this.verify.moderator(profileExternalId, acting);
        if (moderator.moderatorPaused || moderator.moderatorRemovals === false)
            return { tasks: [] };
        const scope = (0, scope_1.scopeOf)(acting);
        const due = await this.prisma.profileGroup.findMany({
            where: {
                removalRequestedAt: { not: null },
                removedAt: null,
                removalAttempts: { lt: MAX_REMOVAL_ATTEMPTS },
                OR: [{ removalClaimedUntil: null }, { removalClaimedUntil: { lt: now } }],
                profile: { facebookSuspension: 'disabled', facebookUserId: { not: null }, isModerator: false, id: { not: moderator.id }, ...(0, scope_1.profileWhere)(scope) },
                group: { status: 'ACTIVE', ...(0, scope_1.groupWhere)(scope) },
            },
            orderBy: { removalRequestedAt: 'asc' },
            take: Math.max(1, Math.min(5, limit || 2)),
            select: {
                id: true,
                profile: { select: { name: true, facebookUserId: true, facebookName: true } },
                group: { select: { name: true, url: true } },
            },
        });
        if (due.length) {
            await this.prisma.profileGroup.updateMany({
                where: { id: { in: due.map((d) => d.id) } },
                data: { removalClaimedUntil: new Date(now.getTime() + CLAIM_MINUTES * 60_000) },
            });
        }
        return {
            tasks: due.map((d) => ({
                taskId: d.id,
                kind: 'remove',
                member: { facebookUserId: d.profile.facebookUserId, name: d.profile.facebookName || d.profile.name },
                group: d.group,
            })),
        };
    }
    async reportRemoval(taskId, input, acting, now = new Date()) {
        const moderator = await this.verify.moderator(input.profileExternalId, acting);
        const link = await this.prisma.profileGroup.findFirst({
            where: { id: taskId, profile: (0, scope_1.profileWhere)((0, scope_1.scopeOf)(acting)) },
            select: { id: true, profileId: true, groupId: true, removalAttempts: true, profile: { select: { name: true, facebookUserId: true, facebookSuspension: true } }, group: { select: { name: true } } },
        });
        if (!link)
            throw new common_1.NotFoundException('Tâche introuvable');
        if (link.profile.facebookUserId !== input.facebookUserId)
            throw new common_1.BadRequestException('Identifiant Facebook différent de la tâche');
        if (link.profile.facebookSuspension !== 'disabled')
            throw new common_1.BadRequestException('Ce profil n’est plus suspendu : rien n’est retiré');
        const detail = String(input.detail || '').slice(0, 500);
        if (input.outcome === 'done' || input.outcome === 'already' || input.outcome === 'not_found') {
            await this.prisma.profileGroup.update({
                where: { id: link.id },
                data: { removedAt: now, removalClaimedUntil: null, removalError: null, status: 'INACTIVE', joinStatus: client_1.JoinStatus.NOT_JOINED },
            });
            await this.log('PROFILE_REMOVED_FROM_GROUP', `« ${link.profile.name} » (suspendu par Facebook) retiré du groupe « ${link.group.name} » par ${moderator.name}`, link, { outcome: input.outcome, detail });
            return { taskId, result: 'removed' };
        }
        const retry = new Date(now.getTime() + RETRY_MINUTES[input.outcome] * 60_000);
        await this.prisma.profileGroup.update({
            where: { id: link.id },
            data: { removalAttempts: { increment: 1 }, removalClaimedUntil: retry, removalError: `${input.outcome} : ${detail}` },
        });
        await this.log('PROFILE_REMOVAL_FAILED', `Retrait de « ${link.profile.name} » du groupe « ${link.group.name} » : ${input.outcome}${detail ? ` — ${detail}` : ''}`, link, { outcome: input.outcome, detail }, 'WARN');
        return { taskId, result: 'retry_later' };
    }
    async claimApprovals(profileExternalId, limit, acting, now = new Date()) {
        const moderator = await this.verify.moderator(profileExternalId, acting);
        if (moderator.moderatorPaused || moderator.moderatorPending === false)
            return { tasks: [] };
        const scope = (0, scope_1.scopeOf)(acting);
        const due = await this.prisma.postTarget.findMany({
            where: {
                status: client_1.TargetStatus.PUBLISHED,
                approvalPendingSince: { not: null },
                approvalModAttempts: { lt: MAX_APPROVAL_ATTEMPTS },
                OR: [{ approvalModClaimedUntil: null }, { approvalModClaimedUntil: { lt: now } }],
                post: (0, scope_1.postWhere)(scope),
                group: { status: 'ACTIVE', ...(0, scope_1.groupWhere)(scope) },
            },
            orderBy: { approvalPendingSince: 'asc' },
            take: Math.max(1, Math.min(5, limit || 2)),
            select: {
                id: true,
                post: { select: { description: true } },
                group: { select: { name: true, url: true, externalId: true } },
                jobItems: { take: 1, orderBy: { createdAt: 'desc' }, select: { job: { select: { profile: { select: { name: true, facebookName: true, facebookUserId: true } } } } } },
            },
        });
        if (due.length) {
            await this.prisma.postTarget.updateMany({
                where: { id: { in: due.map((d) => d.id) } },
                data: { approvalModClaimedUntil: new Date(now.getTime() + CLAIM_MINUTES * 60_000) },
            });
        }
        return {
            tasks: due.map((d) => {
                const author = d.jobItems[0]?.job.profile;
                return {
                    taskId: d.id,
                    kind: 'approve_post',
                    content: d.post.description,
                    author: author ? { name: author.facebookName || author.name, facebookUserId: author.facebookUserId } : null,
                    group: d.group,
                };
            }),
        };
    }
    async reportApproval(taskId, input, acting, now = new Date()) {
        const moderator = await this.verify.moderator(input.profileExternalId, acting);
        const target = await this.prisma.postTarget.findFirst({
            where: { id: taskId, post: (0, scope_1.postWhere)((0, scope_1.scopeOf)(acting)) },
            select: { id: true, postId: true, groupId: true, approvalPendingSince: true, group: { select: { name: true } } },
        });
        if (!target)
            throw new common_1.NotFoundException('Tâche introuvable');
        const detail = String(input.detail || '').slice(0, 500);
        if (input.outcome === 'done' || input.outcome === 'already') {
            await this.prisma.postTarget.update({ where: { id: target.id }, data: { approvalCheckedAt: null, approvalModClaimedUntil: null } });
            await this.prisma.activityLog.create({
                data: { postId: target.postId, postTargetId: target.id, groupId: target.groupId, eventType: 'POST_APPROVED_BY_MODERATOR', message: `Post validé par le modérateur ${moderator.name} dans « ${target.group.name} »`, metadata: { outcome: input.outcome, detail } },
            });
            return { taskId, result: 'approved' };
        }
        await this.prisma.postTarget.update({
            where: { id: target.id },
            data: { approvalModAttempts: { increment: 1 }, approvalModClaimedUntil: new Date(now.getTime() + RETRY_MINUTES[input.outcome] * 60_000) },
        });
        await this.prisma.activityLog.create({
            data: { postId: target.postId, postTargetId: target.id, groupId: target.groupId, level: 'WARN', eventType: 'POST_APPROVAL_BY_MODERATOR_FAILED', message: `Validation par ${moderator.name} dans « ${target.group.name} » : ${input.outcome}${detail ? ` — ${detail}` : ''}`, metadata: { outcome: input.outcome, detail } },
        });
        return { taskId, result: 'retry_later' };
    }
    async claimSpam(profileExternalId, limit, acting, now = new Date()) {
        const moderator = await this.verify.moderator(profileExternalId, acting);
        if (moderator.moderatorPaused || moderator.moderatorSpam === false)
            return { tasks: [] };
        const scope = (0, scope_1.scopeOf)(acting);
        const recent = new Date(now.getTime() - SPAM_RECENT_DAYS * 86_400_000);
        const due = new Date(now.getTime() - SPAM_EVERY_HOURS * 3_600_000);
        const groups = await this.prisma.group.findMany({
            where: {
                status: 'ACTIVE',
                ...(0, scope_1.groupWhere)(scope),
                targets: { some: { status: client_1.TargetStatus.PUBLISHED, publishedAt: { gte: recent } } },
                AND: [
                    { OR: [{ spamClaimedUntil: null }, { spamClaimedUntil: { lt: now } }] },
                    { OR: [{ spamCheckedAt: null }, { spamCheckedAt: { lt: due } }] },
                ],
            },
            orderBy: [{ spamCheckedAt: { sort: 'asc', nulls: 'first' } }],
            take: Math.max(1, Math.min(3, limit || 2)),
            select: {
                id: true,
                name: true,
                url: true,
                profiles: {
                    where: {
                        status: 'ACTIVE',
                        joinStatus: client_1.JoinStatus.JOINED,
                        profile: { isModerator: false, id: { not: moderator.id }, facebookUserId: { not: null }, ...(0, scope_1.profileWhere)(scope) },
                    },
                    select: { profile: { select: { name: true, facebookName: true, facebookUserId: true } } },
                },
            },
        });
        const tasks = groups.filter((g) => g.profiles.length);
        if (tasks.length) {
            await this.prisma.group.updateMany({
                where: { id: { in: tasks.map((g) => g.id) } },
                data: { spamClaimedUntil: new Date(now.getTime() + CLAIM_MINUTES * 60_000) },
            });
        }
        return {
            tasks: tasks.map((g) => ({
                taskId: g.id,
                kind: 'release_spam',
                group: { name: g.name, url: g.url },
                members: g.profiles.map(({ profile: p }) => ({ facebookUserId: p.facebookUserId, name: p.facebookName || p.name })),
                max: 8,
            })),
        };
    }
    async reportSpam(groupId, input, acting, now = new Date()) {
        const moderator = await this.verify.moderator(input.profileExternalId, acting);
        const scope = (0, scope_1.scopeOf)(acting);
        const group = await this.prisma.group.findFirst({
            where: { id: groupId, ...(0, scope_1.groupWhere)(scope) },
            select: {
                id: true,
                name: true,
                profiles: { where: { status: 'ACTIVE', profile: { facebookUserId: { not: null }, ...(0, scope_1.profileWhere)(scope) } }, select: { profile: { select: { id: true, name: true, facebookUserId: true } } } },
            },
        });
        if (!group)
            throw new common_1.NotFoundException('Groupe introuvable');
        const ours = new Map(group.profiles.map(({ profile }) => [profile.facebookUserId, profile]));
        const detail = String(input.detail || '').slice(0, 500);
        const released = (input.released ?? []).slice(0, 20);
        const strangers = released.filter((r) => !ours.has(r.facebookUserId));
        const accepted = released.filter((r) => ours.has(r.facebookUserId));
        let matched = 0;
        for (const r of accepted) {
            const profile = ours.get(r.facebookUserId);
            const url = (0, trace_1.canonicalGroupPostUrl)(r.postUrl);
            const target = (url ? await this.prisma.postTarget.findFirst({ where: { groupId: group.id, status: client_1.TargetStatus.PUBLISHED, facebookUrl: url }, select: { id: true, postId: true } }) : null) ??
                (await this.prisma.postTarget.findFirst({
                    where: { groupId: group.id, status: client_1.TargetStatus.PUBLISHED, jobItems: { some: { status: client_1.TargetStatus.PUBLISHED, job: { profileId: profile.id } } } },
                    orderBy: { publishedAt: 'desc' },
                    select: { id: true, postId: true },
                }));
            if (target) {
                matched += 1;
                await this.prisma.postTarget.update({
                    where: { id: target.id },
                    data: { approvalPendingSince: null, approvalCheckedAt: null, verifyStatus: null, verifyClaimedUntil: null, verifyAttempts: 0, ...(url ? { facebookUrl: url } : {}) },
                });
            }
            await this.prisma.activityLog.create({
                data: {
                    ...(target ? { postId: target.postId, postTargetId: target.id } : {}),
                    profileId: profile.id,
                    groupId: group.id,
                    eventType: 'SPAM_POST_RELEASED',
                    message: `Post de « ${profile.name} » sorti du spam dans « ${group.name} » par ${moderator.name}${target ? '' : ' (publication non retrouvée dans la plateforme)'}`,
                    metadata: { moderatorId: moderator.id, postUrl: r.postUrl ?? null, text: String(r.text || '').slice(0, 200) },
                },
            });
        }
        if (strangers.length) {
            await this.prisma.activityLog.create({
                data: {
                    groupId: group.id,
                    level: 'ERROR',
                    eventType: 'SPAM_MEMBER_MISMATCH',
                    message: `${moderator.name} a publié ${strangers.length} post(s) du spam de « ${group.name} » qui ne sont pas de nos profils : signalé`,
                    metadata: { moderatorId: moderator.id, facebookUserIds: strangers.map((s) => s.facebookUserId) },
                },
            });
        }
        const minutes = SPAM_RETRY_MINUTES[input.outcome] ?? 60;
        const checked = input.outcome === 'done' || input.outcome === 'nothing';
        await this.prisma.group.update({
            where: { id: group.id },
            data: {
                ...(checked ? { spamCheckedAt: now, spamClaimedUntil: null } : { spamClaimedUntil: new Date(now.getTime() + minutes * 60_000) }),
                spamDetail: `${input.outcome}${detail ? ` : ${detail}` : ''}`.slice(0, 500),
            },
        });
        if (!checked) {
            await this.prisma.activityLog.create({
                data: { groupId: group.id, level: 'WARN', eventType: 'SPAM_CHECK_FAILED', message: `Spam de « ${group.name} » non lu par ${moderator.name} : ${input.outcome}${detail ? ` — ${detail}` : ''}`, metadata: { moderatorId: moderator.id, outcome: input.outcome } },
            });
        }
        return { groupId: group.id, released: accepted.length, matched, refused: strangers.length };
    }
    async suspendedOverview(acting) {
        const scope = (0, scope_1.scopeOf)(acting);
        const profiles = await this.prisma.profile.findMany({
            where: { facebookSuspension: { not: null }, ...(0, scope_1.profileWhere)(scope) },
            select: {
                id: true,
                name: true,
                facebookUserId: true,
                facebookSuspension: true,
                suspendedAt: true,
                suspensionDetail: true,
                profileGroups: {
                    where: { group: (0, scope_1.groupWhere)(scope) },
                    select: { status: true, removalRequestedAt: true, removedAt: true, removalError: true, removalAttempts: true },
                },
            },
            orderBy: { suspendedAt: 'desc' },
        });
        return profiles.map((p) => {
            const links = p.profileGroups;
            return {
                id: p.id,
                name: p.name,
                facebookUserId: p.facebookUserId,
                kind: p.facebookSuspension,
                suspendedAt: p.suspendedAt,
                detail: p.suspensionDetail,
                groups: links.filter((l) => l.status === 'ACTIVE' && !l.removedAt).length,
                requested: links.filter((l) => l.removalRequestedAt && !l.removedAt).length,
                removed: links.filter((l) => l.removedAt).length,
                failing: links.filter((l) => l.removalRequestedAt && !l.removedAt && l.removalAttempts >= MAX_REMOVAL_ATTEMPTS).length,
                lastError: links.find((l) => l.removalError && !l.removedAt)?.removalError ?? null,
            };
        });
    }
    log(eventType, message, link, metadata, level = 'INFO') {
        return this.prisma.activityLog.create({
            data: { profileId: link.profileId, groupId: link.groupId, eventType, level, message, metadata: metadata },
        });
    }
};
exports.GroupTasksService = GroupTasksService;
exports.GroupTasksService = GroupTasksService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        verify_service_1.VerifyService])
], GroupTasksService);
//# sourceMappingURL=group-tasks.service.js.map