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
exports.MembersService = exports.MEMBER_OUTCOMES = exports.MEMBER_KINDS = void 0;
const common_1 = require("@nestjs/common");
const client_1 = require("@prisma/client");
const prisma_service_1 = require("../prisma/prisma.service");
const scope_1 = require("../auth/scope");
const verify_service_1 = require("./verify.service");
exports.MEMBER_KINDS = ['approve', 'preapprove'];
exports.MEMBER_OUTCOMES = [
    'done',
    'already',
    'not_found',
    'no_permission',
    'unreachable',
];
const CLAIM_MINUTES = 30;
const MAX_ATTEMPTS = 6;
const RETRY_MINUTES = {
    not_found: 6 * 60,
    no_permission: 24 * 60,
    unreachable: 30,
};
const PENDING_JOIN = [client_1.JoinStatus.REQUESTED, client_1.JoinStatus.QUESTIONS];
let MembersService = class MembersService {
    prisma;
    verify;
    constructor(prisma, verify) {
        this.prisma = prisma;
        this.verify = verify;
    }
    dueWhere(acting, moderatorId, now) {
        const scope = (0, scope_1.scopeOf)(acting);
        return {
            status: 'ACTIVE',
            memberAttempts: { lt: MAX_ATTEMPTS },
            AND: [
                { OR: [{ memberClaimedUntil: null }, { memberClaimedUntil: { lt: now } }] },
                {
                    OR: [
                        { joinStatus: { in: PENDING_JOIN }, memberApprovedAt: null },
                        { joinStatus: client_1.JoinStatus.JOINED, preApprovedAt: null },
                    ],
                },
            ],
            profile: {
                status: 'ACTIVE',
                facebookUserId: { not: null },
                ...(moderatorId ? { id: { not: moderatorId } } : {}),
                ...(0, scope_1.profileWhere)(scope),
            },
            group: { status: 'ACTIVE', ...(0, scope_1.groupWhere)(scope) },
        };
    }
    async claim(profileExternalId, limit, acting, now = new Date()) {
        const moderator = await this.verify.moderator(profileExternalId, acting);
        const due = await this.prisma.profileGroup.findMany({
            where: this.dueWhere(acting, moderator.id, now),
            orderBy: { updatedAt: 'asc' },
            take: Math.max(1, Math.min(10, limit || 5)),
            select: {
                id: true,
                joinStatus: true,
                profile: { select: { name: true, facebookUserId: true, facebookName: true } },
                group: { select: { name: true, url: true } },
            },
        });
        if (due.length) {
            await this.prisma.profileGroup.updateMany({
                where: { id: { in: due.map((d) => d.id) } },
                data: { memberClaimedUntil: new Date(now.getTime() + CLAIM_MINUTES * 60_000) },
            });
        }
        return {
            tasks: due.map((d) => ({
                taskId: d.id,
                kind: (PENDING_JOIN.includes(d.joinStatus) ? 'approve' : 'preapprove'),
                member: {
                    facebookUserId: d.profile.facebookUserId,
                    name: d.profile.facebookName || d.profile.name,
                },
                group: d.group,
            })),
        };
    }
    async report(taskId, input, acting, now = new Date()) {
        const moderator = await this.verify.moderator(input.profileExternalId, acting);
        const row = await this.prisma.profileGroup.findFirst({
            where: { id: taskId, profile: (0, scope_1.profileWhere)((0, scope_1.scopeOf)(acting)), group: (0, scope_1.groupWhere)((0, scope_1.scopeOf)(acting)) },
            select: {
                id: true,
                profileId: true,
                groupId: true,
                memberAttempts: true,
                profile: { select: { name: true, facebookUserId: true } },
                group: { select: { name: true } },
            },
        });
        if (!row)
            throw new common_1.NotFoundException('Tâche introuvable');
        if (!row.profile.facebookUserId || row.profile.facebookUserId !== input.facebookUserId) {
            await this.log(row, 'MEMBER_MISMATCH', 'ERROR', `Rapport refusé : l’identifiant ${input.facebookUserId} n’est pas celui de « ${row.profile.name} »`, moderator.name);
            throw new common_1.ForbiddenException('Cet identifiant Facebook n’est pas celui de ce profil');
        }
        const detail = (input.detail || '').slice(0, 1000);
        if (input.outcome === 'done' || input.outcome === 'already') {
            const data = input.kind === 'approve'
                ? { joinStatus: client_1.JoinStatus.JOINED, joinCheckedAt: now, joinError: null, memberApprovedAt: now }
                : { preApprovedAt: now };
            await this.prisma.$transaction([
                this.prisma.profileGroup.update({
                    where: { id: row.id },
                    data: { ...data, memberAttempts: 0, memberActionError: null, memberActionAt: now, memberClaimedUntil: null },
                }),
                this.log(row, input.kind === 'approve' ? 'MEMBER_APPROVED' : 'MEMBER_PREAPPROVED', 'INFO', input.kind === 'approve'
                    ? `Adhésion de « ${row.profile.name} » acceptée dans « ${row.group.name} »${input.outcome === 'already' ? ' (déjà membre)' : ''}`
                    : `« ${row.profile.name} » pré-approuvé dans « ${row.group.name} » : ses posts paraissent sans validation${input.outcome === 'already' ? ' (déjà le cas)' : ''}`, moderator.name),
            ]);
            return { taskId, result: 'done' };
        }
        const attempts = row.memberAttempts + 1;
        const reason = input.outcome === 'no_permission'
            ? `le vérificateur n’a pas cette option dans « ${row.group.name} » : il doit y être administrateur ou modérateur`
            : input.outcome === 'not_found'
                ? input.kind === 'approve'
                    ? 'aucune demande d’adhésion de ce compte dans la liste'
                    : 'ce compte n’a pas été trouvé parmi les membres'
                : 'page illisible';
        await this.prisma.$transaction([
            this.prisma.profileGroup.update({
                where: { id: row.id },
                data: {
                    memberAttempts: attempts,
                    memberActionError: `${reason}${detail ? ` — ${detail}` : ''}`,
                    memberActionAt: now,
                    memberClaimedUntil: new Date(now.getTime() + RETRY_MINUTES[input.outcome] * 60_000),
                },
            }),
            this.log(row, 'MEMBER_ACTION_FAILED', attempts >= MAX_ATTEMPTS ? 'ERROR' : 'WARN', `${input.kind === 'approve' ? 'Adhésion' : 'Pré-approbation'} de « ${row.profile.name} » dans « ${row.group.name} » : ${reason}` +
                (attempts >= MAX_ATTEMPTS ? ` (abandon après ${MAX_ATTEMPTS} essais)` : ''), moderator.name, { detail }),
        ]);
        return { taskId, result: attempts >= MAX_ATTEMPTS ? 'gave_up' : 'retry_later' };
    }
    log(row, eventType, level, message, by, extra = {}) {
        return this.prisma.activityLog.create({
            data: { profileId: row.profileId, groupId: row.groupId, eventType, level, message, metadata: { by, ...extra } },
        });
    }
    async overview(acting, now = new Date()) {
        const scope = (0, scope_1.scopeOf)(acting);
        const ours = { profile: (0, scope_1.profileWhere)(scope), group: (0, scope_1.groupWhere)(scope) };
        const [due, preApproved, approved, unknownIdentity, problems] = await Promise.all([
            this.prisma.profileGroup.count({ where: this.dueWhere(acting, null, now) }),
            this.prisma.profileGroup.count({ where: { ...ours, preApprovedAt: { not: null } } }),
            this.prisma.profileGroup.count({ where: { ...ours, memberApprovedAt: { not: null } } }),
            this.prisma.profile.count({ where: { ...(0, scope_1.profileWhere)(scope), status: 'ACTIVE', facebookUserId: null } }),
            this.prisma.profileGroup.findMany({
                where: { ...ours, memberActionError: { not: null }, status: 'ACTIVE' },
                orderBy: { memberActionAt: 'desc' },
                take: 30,
                select: {
                    id: true,
                    joinStatus: true,
                    memberActionError: true,
                    memberActionAt: true,
                    memberAttempts: true,
                    profile: { select: { id: true, name: true } },
                    group: { select: { id: true, name: true, url: true } },
                },
            }),
        ]);
        return {
            due,
            preApproved,
            approved,
            unknownIdentity,
            problems: problems.map((p) => ({
                taskId: p.id,
                kind: PENDING_JOIN.includes(p.joinStatus) ? 'approve' : 'preapprove',
                error: p.memberActionError,
                at: p.memberActionAt,
                attempts: p.memberAttempts,
                gaveUp: p.memberAttempts >= MAX_ATTEMPTS,
                profile: p.profile,
                group: p.group,
            })),
        };
    }
    async retry(taskId, acting) {
        const row = await this.prisma.profileGroup.findFirst({
            where: { id: taskId, profile: (0, scope_1.profileWhere)((0, scope_1.scopeOf)(acting)) },
            select: { id: true },
        });
        if (!row)
            throw new common_1.NotFoundException('Tâche introuvable');
        await this.prisma.profileGroup.update({
            where: { id: row.id },
            data: { memberAttempts: 0, memberClaimedUntil: null, memberActionError: null },
        });
        return { taskId, result: 'queued' };
    }
};
exports.MembersService = MembersService;
exports.MembersService = MembersService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        verify_service_1.VerifyService])
], MembersService);
//# sourceMappingURL=members.service.js.map