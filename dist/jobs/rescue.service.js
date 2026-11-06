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
exports.RescueService = exports.MAX_RESCUES = void 0;
const common_1 = require("@nestjs/common");
const client_1 = require("@prisma/client");
const prisma_service_1 = require("../prisma/prisma.service");
const scope_1 = require("../auth/scope");
const trace_1 = require("../trace/trace");
const claimable_1 = require("./claimable");
exports.MAX_RESCUES = 2;
const CLAIM_MINUTES = 20;
const AFTER_JOB_MINUTES = 5;
const GIVE_UP_HOURS = 6;
const SWEEP_EVERY_MS = 60_000;
let RescueService = class RescueService {
    prisma;
    constructor(prisma) {
        this.prisma = prisma;
    }
    rescuersWhere(groupId, exclude, post) {
        return {
            groupId,
            status: 'ACTIVE',
            joinStatus: client_1.JoinStatus.JOINED,
            profileId: { notIn: exclude },
            profile: { status: 'ACTIVE', isModerator: false, facebookSuspension: null, ...(0, claimable_1.profilesForPostWhere)(post) },
        };
    }
    async authorOf(targetId) {
        const item = await this.prisma.publicationJobItem.findFirst({
            where: { postTargetId: targetId, status: client_1.TargetStatus.PUBLISHED },
            orderBy: { publishedAt: 'desc' },
            select: { job: { select: { profileId: true, status: true, completedAt: true } } },
        });
        return item?.job ?? null;
    }
    sweptAt = 0;
    async sweep(now = new Date(), force = false) {
        if (!force && now.getTime() - this.sweptAt < SWEEP_EVERY_MS)
            return { requested: 0, gaveUp: 0 };
        this.sweptAt = now.getTime();
        const gaveUp = await this.prisma.postTarget.updateMany({
            where: {
                rescueStatus: 'pending',
                rescueRequestedAt: { lt: new Date(now.getTime() - GIVE_UP_HOURS * 3_600_000) },
            },
            data: { rescueStatus: 'failed', rescueDetail: `aucun profil sauveteur passé en ${GIVE_UP_HOURS} h` },
        });
        const candidates = await this.prisma.postTarget.findMany({
            where: {
                status: client_1.TargetStatus.PUBLISHED,
                rescueStatus: null,
                linkUpdatedAt: null,
                approvalPendingSince: null,
                facebookUrl: { not: null },
                post: { url: { not: null }, noComment: false },
                jobItems: {
                    some: {
                        status: client_1.TargetStatus.PUBLISHED,
                        job: {
                            status: { not: client_1.JobStatus.CLAIMED },
                            OR: [
                                { completedAt: { lt: new Date(now.getTime() - AFTER_JOB_MINUTES * 60_000) } },
                                { completedAt: null, claimExpiresAt: { lt: new Date(now.getTime() - AFTER_JOB_MINUTES * 60_000) } },
                            ],
                        },
                    },
                },
            },
            select: { id: true, groupId: true },
            take: 100,
        });
        let requested = 0;
        for (const t of candidates) {
            if (await this.request(t.id, 'le lien n’a pas été mis dans le premier commentaire par son auteur', now))
                requested += 1;
        }
        return { requested, gaveUp: gaveUp.count };
    }
    async authorGaveUp(jobId, postId, now = new Date()) {
        const item = await this.prisma.publicationJobItem.findFirst({
            where: { jobId, postId, status: client_1.TargetStatus.PUBLISHED, linkUpdatedAt: null },
            select: {
                postTarget: {
                    select: {
                        id: true,
                        linkUpdatedAt: true,
                        rescueStatus: true,
                        facebookUrl: true,
                        approvalPendingSince: true,
                        post: { select: { url: true, noComment: true } },
                    },
                },
            },
        });
        const t = item?.postTarget;
        if (!t || t.linkUpdatedAt || t.rescueStatus || t.approvalPendingSince || !t.facebookUrl || !t.post.url || t.post.noComment) {
            return false;
        }
        return this.request(t.id, 'l’auteur n’a pas pu poser le lien après ses 3 essais', now);
    }
    async request(targetId, reason, now = new Date()) {
        const target = await this.prisma.postTarget.findUnique({
            where: { id: targetId },
            select: {
                id: true,
                groupId: true,
                rescueStatus: true,
                rescueAttempts: true,
                rescueTriedBy: true,
                facebookUrl: true,
                post: {
                    select: {
                        ownerId: true,
                        owner: { select: { role: true } },
                        article: { select: { source: { select: { access: { select: { userId: true } } } } } },
                    },
                },
            },
        });
        if (!target || target.rescueStatus === 'done' || target.rescueAttempts >= exports.MAX_RESCUES || !target.facebookUrl)
            return false;
        const author = await this.authorOf(targetId);
        const exclude = [...target.rescueTriedBy, ...(author ? [author.profileId] : [])];
        const rescuers = await this.prisma.profileGroup.count({ where: this.rescuersWhere(target.groupId, exclude, target.post) });
        if (!rescuers) {
            await this.prisma.postTarget.update({ where: { id: targetId }, data: { rescueStatus: 'failed', rescueDetail: 'aucun autre de nos profils dans ce groupe' } });
            return false;
        }
        await this.prisma.$transaction([
            this.prisma.postTarget.update({
                where: { id: targetId },
                data: { rescueStatus: 'pending', rescueRequestedAt: now, rescueClaimedUntil: null, rescueProfileId: null, rescueDetail: reason },
            }),
            (0, trace_1.trace)(this.prisma, { postTargetId: targetId, kind: 'RESCUE_REQUESTED', actor: 'Plateforme', detail: `${reason} — ${rescuers} profil(s) sauveteur(s) possible(s)` }),
        ]);
        return true;
    }
    async due(profileExternalId, acting, limit = 2, now = new Date()) {
        const profile = await this.prisma.profile.findFirst({
            where: { externalId: profileExternalId, status: 'ACTIVE', ...(0, scope_1.profileWhere)((0, scope_1.scopeOf)(acting)) },
            select: { id: true, ownerId: true, owner: { select: { role: true } }, isModerator: true, facebookSuspension: true },
        });
        if (!profile)
            throw new common_1.NotFoundException(`Profil introuvable pour externalId=${profileExternalId}`);
        if (profile.isModerator || profile.facebookSuspension)
            return [];
        await this.sweep(now);
        const rows = await this.prisma.postTarget.findMany({
            where: {
                status: client_1.TargetStatus.PUBLISHED,
                linkUpdatedAt: null,
                NOT: { rescueTriedBy: { has: profile.id } },
                OR: [{ rescueStatus: 'pending' }, { rescueStatus: 'claimed', rescueClaimedUntil: { lt: now } }],
                group: { profiles: { some: { profileId: profile.id, status: 'ACTIVE', joinStatus: client_1.JoinStatus.JOINED } } },
                post: { AND: [(0, scope_1.postWhere)((0, scope_1.scopeOf)(acting)), (0, claimable_1.claimablePostWhere)(profile)] },
                jobItems: { none: { status: client_1.TargetStatus.PUBLISHED, job: { profileId: profile.id } } },
            },
            orderBy: { rescueRequestedAt: 'asc' },
            take: limit,
            select: { id: true, facebookUrl: true, post: { select: { id: true, url: true, title: true } }, group: { select: { name: true, url: true } } },
        });
        const claimed = [];
        for (const r of rows) {
            const { count } = await this.prisma.postTarget.updateMany({
                where: { id: r.id, OR: [{ rescueStatus: 'pending' }, { rescueStatus: 'claimed', rescueClaimedUntil: { lt: now } }] },
                data: { rescueStatus: 'claimed', rescueProfileId: profile.id, rescueClaimedUntil: new Date(now.getTime() + CLAIM_MINUTES * 60_000) },
            });
            if (count && r.facebookUrl && r.post.url) {
                claimed.push({ targetId: r.id, postId: r.post.id, postUrl: r.facebookUrl, url: r.post.url, title: r.post.title, group: r.group.name });
            }
        }
        return claimed;
    }
    async report(targetId, profileExternalId, input, acting, now = new Date()) {
        const profile = await this.prisma.profile.findFirst({
            where: { externalId: profileExternalId, ...(0, scope_1.profileWhere)((0, scope_1.scopeOf)(acting)) },
            select: { id: true, name: true },
        });
        if (!profile)
            throw new common_1.NotFoundException(`Profil introuvable pour externalId=${profileExternalId}`);
        const target = await this.prisma.postTarget.findFirst({
            where: { id: targetId, rescueProfileId: profile.id, post: (0, scope_1.postWhere)((0, scope_1.scopeOf)(acting)) },
            select: { id: true, rescueAttempts: true, rescueTriedBy: true, facebookUrl: true, post: { select: { title: true } }, group: { select: { name: true } } },
        });
        if (!target)
            throw new common_1.NotFoundException('Sauvetage introuvable (ou réservé par un autre profil)');
        const detail = input.detail?.slice(0, 500) || '';
        const where = `« ${target.post.title} » dans « ${target.group.name} »`;
        if (input.outcome === 'done' || input.outcome === 'already') {
            const message = input.outcome === 'done' ? `🛟 lien posé par « ${profile.name} » (profil sauveteur)` : `🛟 lien déjà présent sous le post (vu par « ${profile.name} »)`;
            const items = await this.prisma.publicationJobItem.findMany({
                where: { postTargetId: targetId, status: client_1.TargetStatus.PUBLISHED, linkUpdatedAt: null },
                select: { id: true, jobId: true },
            });
            await this.prisma.publicationJobItem.updateMany({ where: { id: { in: items.map((i) => i.id) } }, data: { linkUpdatedAt: now } });
            for (const jobId of new Set(items.map((i) => i.jobId))) {
                const job = await this.prisma.publicationJob.findUnique({
                    where: { id: jobId },
                    select: { status: true, items: { select: { status: true, commentedAt: true, linkUpdatedAt: true, post: { select: { url: true } } } } },
                });
                if (!job || job.status !== client_1.JobStatus.AWAITING_LINK)
                    continue;
                const waiting = job.items.some((i) => i.status === client_1.TargetStatus.PUBLISHED && i.post.url && i.commentedAt && !i.linkUpdatedAt);
                if (waiting)
                    continue;
                const status = job.items.every((i) => i.status === client_1.TargetStatus.FAILED)
                    ? client_1.JobStatus.FAILED
                    : job.items.some((i) => i.status === client_1.TargetStatus.FAILED)
                        ? client_1.JobStatus.PARTIALLY_COMPLETED
                        : client_1.JobStatus.COMPLETED;
                await this.prisma.publicationJob.update({ where: { id: jobId }, data: { status } });
            }
            await this.prisma.$transaction([
                this.prisma.postTarget.update({
                    where: { id: targetId },
                    data: {
                        rescueStatus: 'done',
                        rescueDoneAt: now,
                        rescueClaimedUntil: null,
                        rescueDetail: [message, detail].filter(Boolean).join(' — '),
                        linkUpdatedAt: now,
                        commentedAt: now,
                        ...(input.commentExternalId ? { commentExternalId: input.commentExternalId } : {}),
                    },
                }),
                (0, trace_1.trace)(this.prisma, { postTargetId: targetId, kind: 'RESCUED', actor: profile.name, profileId: profile.id, facebookUrl: target.facebookUrl, detail: message }),
                this.prisma.activityLog.create({
                    data: { profileId: profile.id, postTargetId: targetId, eventType: 'LINK_RESCUED', message: `${where} : ${message}`, metadata: { outcome: input.outcome, detail } },
                }),
            ]);
            return { targetId, result: 'rescued' };
        }
        const attempts = target.rescueAttempts + 1;
        const triedBy = [...new Set([...target.rescueTriedBy, profile.id])];
        await this.prisma.postTarget.update({
            where: { id: targetId },
            data: { rescueStatus: 'failed', rescueAttempts: attempts, rescueTriedBy: triedBy, rescueClaimedUntil: null, rescueProfileId: null, rescueDetail: `« ${profile.name} » n’a pas pu : ${detail}` },
        });
        await this.prisma.activityLog.create({
            data: { profileId: profile.id, postTargetId: targetId, eventType: 'LINK_RESCUE_FAILED', level: 'WARN', message: `${where} : sauvetage du lien impossible par « ${profile.name} » — ${detail || 'sans détail'}`, metadata: { attempts } },
        });
        const again = await this.request(targetId, `nouvel essai après l’échec de « ${profile.name} »`, now);
        if (!again) {
            await (0, trace_1.trace)(this.prisma, { postTargetId: targetId, kind: 'RESCUE_FAILED', actor: profile.name, profileId: profile.id, detail: `sauvetage abandonné après ${attempts} essai(s) : le vérificateur reprend la main` });
        }
        return { targetId, result: again ? 'next_rescuer' : 'gave_up' };
    }
};
exports.RescueService = RescueService;
exports.RescueService = RescueService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], RescueService);
//# sourceMappingURL=rescue.service.js.map