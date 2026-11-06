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
exports.AuditService = exports.AUDIT_OUTCOMES = void 0;
const common_1 = require("@nestjs/common");
const client_1 = require("@prisma/client");
const prisma_service_1 = require("../prisma/prisma.service");
const scope_1 = require("../auth/scope");
const verify_service_1 = require("./verify.service");
exports.AUDIT_OUTCOMES = ['already', 'not_done', 'fixed', 'no_permission', 'not_found', 'unreachable'];
const STATE = {
    already: 'PREAPPROVED',
    fixed: 'PREAPPROVED',
    not_done: 'NOT_PREAPPROVED',
    no_permission: 'NO_PERMISSION',
    not_found: 'NOT_FOUND',
};
const CLAIM_MINUTES = 20;
const RETRY_MINUTES = 30;
let AuditService = class AuditService {
    prisma;
    verify;
    constructor(prisma, verify) {
        this.prisma = prisma;
        this.verify = verify;
    }
    eligible(acting) {
        const scope = (0, scope_1.scopeOf)(acting);
        return {
            status: 'ACTIVE',
            joinStatus: client_1.JoinStatus.JOINED,
            profile: { status: 'ACTIVE', isModerator: false, facebookUserId: { not: null }, ...(0, scope_1.profileWhere)(scope) },
            group: { status: 'ACTIVE', ...(0, scope_1.groupWhere)(scope) },
        };
    }
    async request(input, acting, now = new Date()) {
        const where = {
            ...this.eligible(acting),
            ...(input.profileGroupIds?.length ? { id: { in: input.profileGroupIds } } : {}),
            ...(input.profileId ? { profileId: input.profileId } : {}),
        };
        const { count } = await this.prisma.profileGroup.updateMany({
            where,
            data: { auditRequestedAt: now, auditMode: input.mode, auditClaimedUntil: null },
        });
        const woken = await this.prisma.profile.updateMany({
            where: { isModerator: true, status: 'ACTIVE', moderatorPaused: false },
            data: { moderatorMembersRunAt: now },
        });
        await this.prisma.activityLog.create({
            data: {
                eventType: 'MEMBER_AUDIT_REQUESTED',
                message: `Contrôle de la pré-approbation demandé (${input.mode === 'check' ? 'sans rien modifier' : 'puis pré-approuver ce qui manque'}) : ${count} liaison(s)` +
                    (woken.count ? `, ${woken.count} modérateur(s) réveillé(s)` : ' — aucun modérateur actif pour le faire'),
                metadata: { mode: input.mode, count, by: acting?.username ?? 'clé globale', ids: input.profileGroupIds ?? null },
            },
        });
        return { requested: count, moderators: woken.count };
    }
    async claim(profileExternalId, limit, acting, now = new Date()) {
        const moderator = await this.verify.moderator(profileExternalId, acting);
        if (moderator.moderatorPaused)
            return { tasks: [] };
        const due = await this.prisma.profileGroup.findMany({
            where: {
                ...this.eligible(acting),
                auditRequestedAt: { not: null },
                OR: [{ auditClaimedUntil: null }, { auditClaimedUntil: { lt: now } }],
                profileId: { not: moderator.id },
            },
            orderBy: { auditRequestedAt: 'asc' },
            take: Math.max(1, Math.min(20, limit || 5)),
            select: {
                id: true,
                auditMode: true,
                profile: { select: { name: true, facebookUserId: true, facebookName: true } },
                group: { select: { name: true, url: true } },
            },
        });
        if (due.length) {
            await this.prisma.profileGroup.updateMany({
                where: { id: { in: due.map((d) => d.id) } },
                data: { auditClaimedUntil: new Date(now.getTime() + CLAIM_MINUTES * 60_000) },
            });
        }
        return {
            tasks: due.map((d) => ({
                taskId: d.id,
                mode: d.auditMode === 'fix' ? 'fix' : 'check',
                member: { facebookUserId: d.profile.facebookUserId, name: d.profile.facebookName || d.profile.name },
                group: d.group,
            })),
        };
    }
    async report(taskId, input, acting, now = new Date()) {
        const moderator = await this.verify.moderator(input.profileExternalId, acting);
        const row = await this.prisma.profileGroup.findFirst({
            where: { id: taskId, profile: (0, scope_1.profileWhere)((0, scope_1.scopeOf)(acting)) },
            select: {
                id: true,
                profileId: true,
                groupId: true,
                preApprovedAt: true,
                auditMode: true,
                profile: { select: { name: true, facebookUserId: true } },
                group: { select: { name: true, url: true } },
            },
        });
        if (!row)
            throw new common_1.NotFoundException('Contrôle introuvable');
        const meta = { by: moderator.name, moderatorId: moderator.id, mode: row.auditMode };
        if (!row.profile.facebookUserId || row.profile.facebookUserId !== input.facebookUserId) {
            await this.prisma.activityLog.create({
                data: { profileId: row.profileId, groupId: row.groupId, eventType: 'MEMBER_MISMATCH', level: 'ERROR', message: `Contrôle refusé : l’identifiant ${input.facebookUserId} n’est pas celui de « ${row.profile.name} »`, metadata: meta },
            });
            throw new common_1.ForbiddenException('Cet identifiant Facebook n’est pas celui de ce profil');
        }
        const detail = (input.detail || '').slice(0, 1000);
        const who = `« ${row.profile.name} » dans « ${row.group.name} »`;
        if (input.outcome === 'unreachable') {
            await this.prisma.$transaction([
                this.prisma.profileGroup.update({
                    where: { id: row.id },
                    data: { auditClaimedUntil: new Date(now.getTime() + RETRY_MINUTES * 60_000), preApprovalDetail: detail || 'page illisible' },
                }),
                this.prisma.activityLog.create({
                    data: { profileId: row.profileId, groupId: row.groupId, eventType: 'MEMBER_AUDIT_UNREACHABLE', level: 'WARN', message: `Contrôle de ${who} : page illisible, nouvel essai dans ${RETRY_MINUTES} min${detail ? ` — ${detail}` : ''}`, metadata: meta },
                }),
            ]);
            return { taskId, state: null, result: 'retry_later' };
        }
        const state = STATE[input.outcome];
        const preApproved = state === 'PREAPPROVED';
        const MESSAGES = {
            already: { event: 'MEMBER_AUDIT_ALREADY', level: 'INFO', text: 'déjà pré-approuvé ✓' },
            fixed: { event: 'MEMBER_AUDIT_FIXED', level: 'INFO', text: 'n’était pas pré-approuvé → pré-approuvé maintenant ✓' },
            not_done: { event: 'MEMBER_AUDIT_NOT_DONE', level: 'WARN', text: 'PAS pré-approuvé (rien n’a été modifié)' },
            no_permission: { event: 'MEMBER_AUDIT_NO_PERMISSION', level: 'ERROR', text: 'impossible à contrôler : le modérateur n’a pas l’option (admin/modérateur du groupe ?)' },
            not_found: { event: 'MEMBER_AUDIT_NOT_FOUND', level: 'WARN', text: 'option de pré-approbation introuvable sur sa page' },
        };
        const msg = MESSAGES[input.outcome];
        const preApprovedAt = preApproved ? (row.preApprovedAt ?? now) : state === 'NOT_PREAPPROVED' ? null : row.preApprovedAt;
        await this.prisma.$transaction([
            this.prisma.profileGroup.update({
                where: { id: row.id },
                data: {
                    preApprovalState: state,
                    preApprovalCheckedAt: now,
                    preApprovalDetail: detail || null,
                    preApprovedAt,
                    auditRequestedAt: null,
                    auditClaimedUntil: null,
                    ...(state === 'NOT_PREAPPROVED' ? { memberAttempts: 0, memberClaimedUntil: null, memberActionError: null } : {}),
                },
            }),
            this.prisma.activityLog.create({
                data: {
                    profileId: row.profileId,
                    groupId: row.groupId,
                    eventType: msg.event,
                    level: msg.level,
                    message: `Contrôle de ${who} : ${msg.text}${detail ? ` — vu : ${detail}` : ''}`,
                    metadata: { ...meta, state, groupUrl: row.group.url },
                },
            }),
        ]);
        return { taskId, state, result: 'recorded' };
    }
    async results(acting, profileId) {
        const rows = await this.prisma.profileGroup.findMany({
            where: {
                ...this.eligible(acting),
                ...(profileId ? { profileId } : {}),
                OR: [{ auditRequestedAt: { not: null } }, { preApprovalCheckedAt: { not: null } }],
            },
            orderBy: [{ preApprovalCheckedAt: 'desc' }],
            take: 500,
            select: {
                id: true,
                auditRequestedAt: true,
                auditMode: true,
                preApprovalState: true,
                preApprovalCheckedAt: true,
                preApprovalDetail: true,
                preApprovedAt: true,
                profile: { select: { id: true, name: true } },
                group: { select: { id: true, name: true, url: true } },
            },
        });
        const pending = rows.filter((r) => r.auditRequestedAt);
        const done = rows.filter((r) => !r.auditRequestedAt);
        const count = (state) => done.filter((r) => r.preApprovalState === state).length;
        return {
            summary: {
                pending: pending.length,
                preApproved: count('PREAPPROVED'),
                notPreApproved: count('NOT_PREAPPROVED'),
                noPermission: count('NO_PERMISSION'),
                notFound: count('NOT_FOUND'),
            },
            rows: rows.map((r) => ({
                taskId: r.id,
                profile: r.profile,
                group: r.group,
                pending: Boolean(r.auditRequestedAt),
                mode: r.auditMode,
                state: r.preApprovalState,
                checkedAt: r.preApprovalCheckedAt,
                detail: r.preApprovalDetail,
            })),
        };
    }
};
exports.AuditService = AuditService;
exports.AuditService = AuditService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        verify_service_1.VerifyService])
], AuditService);
//# sourceMappingURL=audit.service.js.map