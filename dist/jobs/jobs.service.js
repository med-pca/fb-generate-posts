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
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.JobsService = exports.RATE_LIMITED = exports.mayPublishPost = exports.isHouseProfile = exports.claimablePostWhere = void 0;
exports.notForcedElsewhere = notForcedElsewhere;
exports.isRateLimited = isRateLimited;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const client_1 = require("@prisma/client");
const trace_1 = require("../trace/trace");
const insights_service_1 = require("../insights/insights.service");
const window_1 = require("../runners/window");
const objective_1 = require("../insights/objective");
const claimable_1 = require("./claimable");
const campaigns_service_1 = require("../campaigns/campaigns.service");
const cycle_1 = require("../runners/cycle");
const prisma_service_1 = require("../prisma/prisma.service");
const scope_1 = require("../auth/scope");
const RESCUE_TAKES_OVER = new Set(['pending', 'claimed', 'done']);
var claimable_2 = require("./claimable");
Object.defineProperty(exports, "claimablePostWhere", { enumerable: true, get: function () { return claimable_2.claimablePostWhere; } });
Object.defineProperty(exports, "isHouseProfile", { enumerable: true, get: function () { return claimable_2.isHouseProfile; } });
Object.defineProperty(exports, "mayPublishPost", { enumerable: true, get: function () { return claimable_2.mayPublishPost; } });
function notForcedElsewhere(profileId) {
    return {
        AND: [
            { OR: [{ forcedProfileId: null }, { forcedProfileId: profileId }] },
            { OR: [{ avoidProfileId: null }, { avoidProfileId: { not: profileId } }] },
        ],
    };
}
exports.RATE_LIMITED = /publication bloqu|limit how often|try again later|temporarily blocked|limitons la fr[ée]quence|r[ée]essayez plus tard|temporairement bloqu|limitamos|int[ée]ntalo de nuevo m[aá]s tarde|wir begrenzen|حاول مرة اخرى لاحق|حاول مرة أخرى لاحق|نحد من|محظور مؤقت|نقيد معدل|اعادة المحاولة لاحق|мы ограничиваем|попробуйте позже|повторите попытку позже|ми обмежуємо|спробуйте пізніше|limităm|limitam frecven|încearcă din nou mai târziu|incearca din nou mai tarziu/i;
function isRateLimited(text) {
    const folded = String(text ?? '')
        .replace(/[\u064b-\u065f\u0670\u0640]/g, '')
        .replace(/[\u0622\u0623\u0625\u0671]/g, '\u0627');
    return exports.RATE_LIMITED.test(folded);
}
const MAX_AUTO_REQUEUE = 3;
const GROUP_GAP_MINUTES = 3;
const APPROVAL_RECHECK_MINUTES = 10;
const APPROVAL_MAX_HOURS = 24;
let JobsService = class JobsService {
    prisma;
    config;
    campaigns;
    constructor(prisma, config, campaigns) {
        this.prisma = prisma;
        this.config = config;
        this.campaigns = campaigns;
    }
    listAutomationProfiles(acting = null) {
        return this.prisma.profile.findMany({
            where: {
                status: 'ACTIVE',
                externalId: { not: null },
                ...(0, scope_1.profileWhere)((0, scope_1.scopeOf)(acting)),
            },
            select: { id: true, name: true, externalId: true },
            orderBy: { createdAt: 'asc' },
        });
    }
    async reachableJob(jobId, acting) {
        const job = await this.prisma.publicationJob.findFirst({
            where: { id: jobId, ...(0, scope_1.jobWhere)((0, scope_1.scopeOf)(acting)) },
            select: { id: true },
        });
        if (!job)
            throw new common_1.NotFoundException('Job introuvable');
        return job;
    }
    async claim(dto, acting = null, limits = {}) {
        const profile = await this.prisma.profile.findFirst({
            where: {
                id: dto.profileId,
                status: 'ACTIVE',
                ...(0, scope_1.profileWhere)((0, scope_1.scopeOf)(acting)),
            },
        });
        if (!profile)
            throw new common_1.NotFoundException('Profil introuvable');
        const group = await this.prisma.group.findFirst({
            where: {
                id: dto.groupId,
                status: 'ACTIVE',
                profiles: {
                    some: {
                        profileId: dto.profileId,
                        status: 'ACTIVE',
                        joinStatus: client_1.JoinStatus.JOINED,
                    },
                },
            },
        });
        if (!group)
            throw new common_1.NotFoundException('Groupe introuvable ou pas encore rejoint par ce profil');
        const count = Math.max(1, Math.min(this.randomInt(profile.minPostsPerJob, profile.maxPostsPerJob), limits.maxCount ?? Number.POSITIVE_INFINITY));
        const ttlMinutes = Number(this.config.get('CLAIM_TTL_MINUTES', 30));
        let claimExpiresAt = new Date(Date.now() + ttlMinutes * 60_000);
        const job = await this.prisma.$transaction(async (tx) => {
            await this.releaseExpiredClaims(tx);
            let targets = await tx.$queryRaw(client_1.Prisma.sql `
        SELECT pt.id, pt.post_id AS "postId", p.delay, p.no_comment AS "noComment"
        FROM post_targets pt
        INNER JOIN posts p ON p.id = pt.post_id
        LEFT JOIN users u ON u.id = p.owner_id
        INNER JOIN profiles pr ON pr.id = ${dto.profileId}
        LEFT JOIN users pu ON pu.id = pr.owner_id
        INNER JOIN groups g ON g.id = pt.group_id
        LEFT JOIN articles a ON a.id = p.article_id
        WHERE pt.group_id = ${dto.groupId}
          AND pt.status = 'AVAILABLE'::"TargetStatus"
          ${limits.postId ? client_1.Prisma.sql `AND pt.post_id = ${limits.postId}` : client_1.Prisma.empty}
          -- Rotation / plafond des campagnes : cibles fermées à ce profil aujourd'hui.
          ${limits.excludeTargetIds?.length ? client_1.Prisma.sql `AND pt.id NOT IN (${client_1.Prisma.join(limits.excludeTargetIds)})` : client_1.Prisma.empty}
          -- Une cible forcée vers un autre profil lui est réservée.
          AND (pt.forced_profile_id IS NULL OR pt.forced_profile_id = ${dto.profileId})
          -- Republication d'un post incomplet : pas par le profil qui l'avait raté
          -- (sauf envoi forcé vers lui par l'admin).
          AND (pt.avoid_profile_id IS NULL OR pt.avoid_profile_id <> ${dto.profileId} OR pt.forced_profile_id = ${dto.profileId})
          -- Chaque compte garde ses publications (claimablePostWhere) : un
          -- profil de gestionnaire, les posts de son gestionnaire et ceux des
          -- sites qui lui sont partagés ; un profil
          -- de la maison (sans propriétaire ou ADMIN), ceux des ADMIN et sans
          -- propriétaire. Chaque cible ne part qu'une fois : le premier
          -- profil qui la réserve publie dans ce groupe.
          AND (
            p.profile_id = ${dto.profileId}
            OR (
              p.profile_id IS NULL
              AND (
                p.owner_id = pr.owner_id
                OR (
                  pr.owner_id IS NOT NULL
                  AND EXISTS (
                    SELECT 1 FROM site_access sa
                    WHERE sa.source_id = a.source_id AND sa.user_id = pr.owner_id
                  )
                )
                OR (
                  (p.owner_id IS NULL OR u.role = 'ADMIN'::"Role")
                  AND (pr.owner_id IS NULL OR pu.role = 'ADMIN'::"Role")
                )
              )
            )
          )
          AND p.status = 'AVAILABLE'::"PostStatus"
          AND pr.status = 'ACTIVE'::"RecordStatus"
          AND g.status = 'ACTIVE'::"RecordStatus"
          -- Article actif, et son site pas en pause (publishableArticleWhere).
          AND (
            p.article_id IS NULL
            OR (
              a.status = 'ACTIVE'::"RecordStatus"
              AND NOT EXISTS (
                SELECT 1 FROM content_sources cs WHERE cs.id = a.source_id AND cs.paused_at IS NOT NULL
              )
            )
          )
        -- La file : priorité d'abord, puis le plus ancien. C'est l'ordre que
        -- la page « File d'attente » affiche ; le hasard le rendait
        -- impossible à prévoir comme à piloter.
        ORDER BY (pt.forced_profile_id IS NOT NULL) DESC,
          p.priority DESC, p.created_at ASC, pt.created_at ASC
        FOR UPDATE OF pt SKIP LOCKED
        LIMIT ${count}
      `);
            const kind = targets[0]?.noComment ?? false;
            targets = targets.filter((t) => Boolean(t.noComment) === Boolean(kind));
            if (targets.length === 0)
                return null;
            const pacing = targets.reduce((sum, target) => sum + Number(target.delay || 0), 0);
            claimExpiresAt = new Date(Date.now() + (ttlMinutes + pacing) * 60_000);
            const targetIds = targets.map((target) => target.id);
            await tx.postTarget.updateMany({
                where: { id: { in: targetIds }, status: client_1.TargetStatus.AVAILABLE },
                data: {
                    status: client_1.TargetStatus.CLAIMED,
                    claimedAt: new Date(),
                    claimExpiresAt,
                    attemptsCount: { increment: 1 },
                },
            });
            return tx.publicationJob.create({
                data: {
                    profileId: dto.profileId,
                    groupId: dto.groupId,
                    claimExpiresAt,
                    items: {
                        create: targets.map((target) => ({
                            postId: target.postId,
                            postTargetId: target.id,
                        })),
                    },
                    logs: {
                        create: {
                            profileId: dto.profileId,
                            groupId: dto.groupId,
                            eventType: 'JOB_CLAIMED',
                            message: `${targets.length} post(s) réservé(s)`,
                            metadata: { requestedCount: count },
                        },
                    },
                },
                include: {
                    profile: true,
                    group: true,
                    items: { include: { post: true } },
                },
            });
        });
        if (!job)
            return { job: null, posts: [] };
        if (this.campaigns) {
            try {
                const owners = await this.campaigns.assign({ id: job.profile.id, ownerId: job.profile.ownerId }, job.items.map((i) => i.postTargetId));
                const byCampaign = new Map();
                for (const item of job.items) {
                    const campaignId = owners.get(item.postTargetId);
                    if (campaignId)
                        byCampaign.set(campaignId, [...(byCampaign.get(campaignId) ?? []), item.id]);
                }
                for (const [campaignId, ids] of byCampaign) {
                    await this.prisma.publicationJobItem.updateMany({ where: { id: { in: ids } }, data: { campaignId } });
                }
            }
            catch {
            }
        }
        const gap = await this.pacedGap(job.profile.ownerId);
        return {
            jobId: job.id,
            claimExpiresAt: job.claimExpiresAt,
            profile: {
                id: job.profile.id,
                externalId: job.profile.externalId,
                name: job.profile.name,
            },
            group: {
                id: job.group.id,
                externalId: job.group.externalId,
                name: job.group.name,
                url: job.group.url,
            },
            posts: job.items.map(({ post }) => ({
                id: post.id,
                title: post.title,
                description: post.description,
                image: post.imageUrl ?? job.profile.defaultImageUrl,
                delay: gap === null ? post.delay : Math.min(post.delay, gap),
                noComment: post.noComment,
                comment: { text: post.description, willReceiveLink: Boolean(post.url) },
            })),
        };
    }
    async claimBatch({ profileExternalIds, limit }, acting = null) {
        const requested = [...new Set(profileExternalIds ?? [])];
        const profiles = await this.prisma.profile.findMany({
            where: {
                status: 'ACTIVE',
                externalId: requested.length ? { in: requested } : { not: null },
                ...(0, scope_1.profileWhere)((0, scope_1.scopeOf)(acting)),
            },
            select: { id: true, name: true, externalId: true },
            orderBy: { createdAt: 'asc' },
            take: limit,
        });
        if (!profiles.length) {
            return { requested: limit, claimed: 0, jobs: [], skipped: [] };
        }
        const results = await Promise.all(profiles.map(async (profile) => {
            const externalId = profile.externalId ?? '';
            try {
                const claim = await this.claimByProfileExternalId(externalId, undefined, acting);
                if ('jobId' in claim)
                    return { status: 'claimed', ...claim };
                return {
                    status: claim.activeJobId ? 'busy' : 'empty',
                    profileExternalId: externalId,
                    profileName: profile.name,
                    message: claim.message,
                };
            }
            catch (error) {
                const message = error instanceof Error ? error.message : 'Erreur inconnue';
                await this.log({
                    profileId: profile.id,
                    eventType: 'CLAIM_FAILED',
                    level: 'ERROR',
                    message,
                });
                return {
                    status: 'error',
                    profileExternalId: externalId,
                    profileName: profile.name,
                    message,
                };
            }
        }));
        const jobs = [];
        const skipped = [];
        for (const result of results) {
            if (result.status === 'claimed')
                jobs.push(result);
            else
                skipped.push(result);
        }
        await this.log({
            eventType: 'JOBS_BATCH_CLAIMED',
            level: jobs.length ? 'INFO' : 'WARN',
            message: `${jobs.length} job(s) réservé(s) sur ${profiles.length} profil(s)`,
            metadata: {
                claimed: jobs.length,
                skipped: skipped.map(({ status, profileExternalId }) => ({
                    status,
                    profileExternalId,
                })),
            },
        });
        return {
            requested: profiles.length,
            claimed: jobs.length,
            posts: jobs.reduce((total, job) => total + job.posts.length, 0),
            jobs,
            skipped,
        };
    }
    async releaseExpiredClaims(tx = this.prisma) {
        const now = new Date();
        await tx.publicationJob.updateMany({
            where: { status: client_1.JobStatus.CLAIMED, claimExpiresAt: { lt: now } },
            data: { status: client_1.JobStatus.EXPIRED },
        });
        const released = await tx.postTarget.updateMany({
            where: { status: client_1.TargetStatus.CLAIMED, claimExpiresAt: { lt: now } },
            data: {
                status: client_1.TargetStatus.AVAILABLE,
                claimedAt: null,
                claimExpiresAt: null,
            },
        });
        return released.count;
    }
    async claimByProfileExternalId(profileExternalId, groupExternalId, acting = null) {
        const profile = await this.prisma.profile.findFirst({
            where: {
                externalId: profileExternalId,
                status: 'ACTIVE',
                ...(0, scope_1.profileWhere)((0, scope_1.scopeOf)(acting)),
            },
            include: { owner: { select: { role: true } } },
        });
        if (!profile) {
            throw new common_1.NotFoundException(`Profil introuvable pour externalId=${profileExternalId}`);
        }
        if (profile.facebookSuspension) {
            return {
                job: null,
                posts: [],
                reason: 'suspended',
                message: profile.facebookSuspension === 'disabled'
                    ? 'Compte suspendu par Facebook : il ne publie plus'
                    : profile.facebookSuspension === 'logged_out'
                        ? 'Déconnecté de Facebook : il attend qu’on le reconnecte (puis « Marquer reconnecté »)'
                        : 'Facebook demande une vérification du compte : il ne publie plus en attendant',
            };
        }
        const paused = await this.pausedUntil(profile.id);
        if (paused) {
            return {
                job: null,
                posts: [],
                reason: 'paused',
                message: `Profil en pause jusqu’au ${paused.toISOString().slice(0, 16).replace('T', ' ')} UTC : Facebook a limité ses publications`,
            };
        }
        const mode = (await this.prisma.profileRunner?.findUnique({ where: { profileId: profile.id }, select: { mode: true } }).catch(() => null))?.mode;
        const day = this.campaigns
            ? await this.campaigns
                .dayPlan()
                .then((plan) => this.campaigns.profileDay({ id: profile.id, ownerId: profile.ownerId, team: profile.teamNstGroupId ?? null }, plan, { strict: mode === 'AUTO' }))
                .catch(() => null)
            : null;
        if (day?.resting) {
            return { job: null, posts: [], reason: 'rest', message: `😴 ${day.reason} — il reprend quand une campagne a du travail pour lui` };
        }
        const exclude = day?.exclude ?? null;
        const cycle = await this.cycleState(profile.id);
        if (cycle?.restUntil) {
            return {
                job: null,
                posts: [],
                reason: 'rest',
                message: `⏳ En repos jusqu’au ${cycle.restUntil.toISOString().slice(0, 16).replace('T', ' ')} UTC : ${cycle.max} post(s) publiés, pause de ${cycle.hours} h`,
            };
        }
        const active = await this.prisma.publicationJob.findFirst({
            where: {
                profileId: profile.id,
                status: client_1.JobStatus.CLAIMED,
                claimExpiresAt: { gt: new Date() },
            },
            select: { id: true, claimExpiresAt: true },
        });
        if (active && (await this.isFinished(active.id))) {
            await this.complete(active.id).catch(() => undefined);
            await this.log({
                profileId: profile.id,
                jobId: active.id,
                eventType: 'JOB_AUTO_COMPLETED',
                message: `Lot ${active.id} clos automatiquement : tous ses posts étaient terminés`,
            });
        }
        else if (active) {
            await this.log({
                profileId: profile.id,
                jobId: active.id,
                eventType: 'CLAIM_SKIPPED_BUSY',
                message: `Profil déjà occupé par le job ${active.id}`,
                metadata: { claimExpiresAt: active.claimExpiresAt.toISOString() },
            });
            return {
                job: null,
                posts: [],
                activeJobId: active.id,
                message: `Ce profil traite déjà le job ${active.id}`,
            };
        }
        await this.releaseExpiredClaims();
        const groups = await this.prisma.group.findMany({
            where: {
                status: 'ACTIVE',
                externalId: groupExternalId || undefined,
                profiles: {
                    some: {
                        profileId: profile.id,
                        status: 'ACTIVE',
                        joinStatus: client_1.JoinStatus.JOINED,
                    },
                },
                targets: {
                    some: {
                        status: client_1.TargetStatus.AVAILABLE,
                        post: { status: 'AVAILABLE', AND: [(0, claimable_1.claimablePostWhere)(profile), claimable_1.publishableArticleWhere] },
                        ...notForcedElsewhere(profile.id),
                        ...(exclude ? { NOT: exclude } : {}),
                    },
                },
            },
            select: { id: true },
        });
        if (!groups.length) {
            const why = await this.explainNothingToClaim(profile, groupExternalId);
            const closed = day?.closed?.length ? ` — Campagnes en attente : ${day.closed.slice(0, 2).join(' ; ')}.` : '';
            return {
                job: null,
                posts: [],
                ...why,
                message: why.message + closed,
                diagnosis: { ...why.diagnosis, ...(day?.closed?.length ? { campaignsClosed: day.closed } : {}) },
            };
        }
        const rules = await this.pilotRules(profile.id, groups.map((g) => g.id));
        if (rules.quotaLeft !== null && rules.quotaLeft <= 0) {
            return { job: null, posts: [], reason: 'quota', message: `Quota du jour atteint (${rules.quota} publication(s)) : il reprend demain` };
        }
        const usable = groups.filter((g) => {
            const r = rules.groups.get(g.id);
            return !r || (r.open && (r.left === null || r.left > 0));
        });
        if (!usable.length) {
            return {
                job: null,
                posts: [],
                reason: 'group_limits',
                message: `Ses groupes sont fermés à cette heure ou ont atteint leur plafond du jour (${[...rules.groups.values()].map((r) => r.why).filter(Boolean).slice(0, 3).join(' ; ')})`,
            };
        }
        const excludeTargetIds = exclude
            ? (await this.prisma.postTarget.findMany({
                where: { AND: [{ groupId: { in: usable.map((g) => g.id) }, status: client_1.TargetStatus.AVAILABLE }, exclude] },
                select: { id: true },
                take: 20_000,
            })).map((t) => t.id)
            : [];
        const campaignLeft = day?.left ?? null;
        const ordered = await this.byTopPriority(usable, profile);
        if (!groupExternalId && (await this.pilotMode()) === 'article') {
            for (const postId of await this.currentArticles(profile, usable.map((g) => g.id), exclude)) {
                const where = await this.prisma.postTarget.findMany({
                    where: { postId, status: client_1.TargetStatus.AVAILABLE, groupId: { in: usable.map((g) => g.id) }, ...notForcedElsewhere(profile.id), ...(exclude ? { NOT: exclude } : {}) },
                    select: { groupId: true },
                });
                const inGroups = new Set(where.map((t) => t.groupId));
                for (const group of ordered.filter((g) => inGroups.has(g.id))) {
                    const result = await this.claim({ profileId: profile.id, groupId: group.id }, acting, { maxCount: 1, postId, excludeTargetIds });
                    if ('jobId' in result)
                        return result;
                }
            }
            return {
                job: null,
                posts: [],
                reason: 'taken',
                message: 'Les posts disponibles viennent d’être réservés par d’autres profils : réessayer au prochain passage',
            };
        }
        for (const group of ordered) {
            const left = rules.groups.get(group.id)?.left ?? null;
            const caps = [left, rules.quotaLeft, campaignLeft, cycle?.left ?? null].filter((n) => n !== null);
            const result = await this.claim({ profileId: profile.id, groupId: group.id }, acting, { ...(caps.length ? { maxCount: Math.min(...caps) } : {}), excludeTargetIds });
            if ('jobId' in result)
                return result;
        }
        return {
            job: null,
            posts: [],
            reason: 'taken',
            message: 'Les posts disponibles viennent d’être réservés par d’autres profils : réessayer au prochain passage',
        };
    }
    async explainNothingToClaim(profile, groupExternalId) {
        const links = await this.prisma.profileGroup.findMany({
            where: {
                profileId: profile.id,
                status: 'ACTIVE',
                group: {
                    status: 'ACTIVE',
                    ...(groupExternalId ? { externalId: groupExternalId } : {}),
                },
            },
            select: { joinStatus: true, group: { select: { id: true, name: true } } },
        });
        const scope = groupExternalId ? ` (groupe imposé : ${groupExternalId})` : '';
        if (!links.length) {
            return {
                reason: 'no_group',
                message: `Ce profil n’est lié à aucun groupe actif${scope} : liez-le à des groupes (page Groupes).`,
                diagnosis: { linkedGroups: 0 },
            };
        }
        const waiting = {
            status: client_1.TargetStatus.AVAILABLE,
            post: { status: 'AVAILABLE', ...claimable_1.publishableArticleWhere },
        };
        const joined = links.filter((l) => l.joinStatus === client_1.JoinStatus.JOINED);
        const notJoined = links.filter((l) => l.joinStatus !== client_1.JoinStatus.JOINED);
        const pending = notJoined.filter((l) => l.joinStatus === client_1.JoinStatus.REQUESTED || l.joinStatus === client_1.JoinStatus.QUESTIONS);
        const ids = (list) => list.map((l) => l.group.id);
        const names = (list) => list.slice(0, 3).map((l) => l.group.name).join(', ') + (list.length > 3 ? '…' : '');
        const [inJoined, allowedInJoined, inNotJoined] = await Promise.all([
            joined.length
                ? this.prisma.postTarget.count({ where: { ...waiting, groupId: { in: ids(joined) } } })
                : 0,
            joined.length
                ? this.prisma.postTarget.count({
                    where: {
                        ...waiting,
                        groupId: { in: ids(joined) },
                        post: { AND: [waiting.post, (0, claimable_1.claimablePostWhere)(profile)] },
                        ...notForcedElsewhere(profile.id),
                    },
                })
                : 0,
            notJoined.length
                ? this.prisma.postTarget.count({ where: { ...waiting, groupId: { in: ids(notJoined) } } })
                : 0,
        ]);
        const diagnosis = {
            linkedGroups: links.length,
            joinedGroups: joined.length,
            pendingRequests: pending.length,
            postsInJoinedGroups: inJoined,
            postsAllowed: allowedInJoined,
            postsInGroupsNotJoined: inNotJoined,
        };
        const elsewhere = inNotJoined
            ? ` ${inNotJoined} post(s) attendent dans des groupes qu’il n’a pas rejoints (${names(notJoined)})` +
                (pending.length
                    ? ` — ${pending.length} demande(s) d’adhésion en attente : si elles ont été acceptées, marquez-les « rejoint » (page Groupes).`
                    : '.')
            : '';
        if (!joined.length) {
            return {
                reason: 'not_joined',
                message: `Ce profil n’a rejoint aucun de ses ${links.length} groupe(s)${scope}` +
                    (pending.length ? ` (${pending.length} demande(s) en attente)` : '') +
                    '.' +
                    elsewhere,
                diagnosis,
            };
        }
        if (!inJoined) {
            return {
                reason: 'no_post',
                message: `Aucun post en attente dans ses ${joined.length} groupe(s) rejoint(s)${scope}.` + elsewhere,
                diagnosis,
            };
        }
        if (!allowedInJoined) {
            return {
                reason: 'not_allowed',
                message: `${inJoined} post(s) attendent dans ses groupes, mais aucun ne lui est permis : ` +
                    'ils appartiennent à un autre compte (gestionnaire), ou sont forcés vers un autre profil.',
                diagnosis,
            };
        }
        return {
            reason: 'taken',
            message: 'Les posts disponibles viennent d’être réservés par d’autres profils : réessayer au prochain passage.',
            diagnosis,
        };
    }
    paced = new Map();
    async pacedGap(ownerId, now = new Date()) {
        const key = ownerId ?? '';
        const cached = this.paced.get(key);
        if (cached && now.getTime() - cached.at < 120_000)
            return cached.gap;
        let gap = null;
        try {
            const s = await this.prisma.automationSetting.findUnique({ where: { id: 'global' } });
            const need = s?.adaptivePacing ? await this.campaigns?.pacingNeed(now, ownerId).catch(() => null) : null;
            if (s?.adaptivePacing && need) {
                const profiles = await this.prisma.profileRunner.count({
                    where: { running: true, lastSeenAt: { gte: new Date(now.getTime() - 180_000) }, mode: { not: 'OFF' }, profile: { ownerId } },
                });
                gap = (0, objective_1.adaptiveGap)({ neededPerHour: need.neededPerHour, ratePerHour: need.ratePerHour, profiles, minGap: s.minPostGapMinutes, status: need.status });
            }
        }
        catch {
            gap = null;
        }
        this.paced.set(key, { at: now.getTime(), gap });
        return gap;
    }
    async pilotMode() {
        const settings = await this.prisma.automationSetting
            .findUnique({ where: { id: 'global' }, select: { pilotMode: true } })
            .catch(() => null);
        return settings?.pilotMode === 'group' ? 'group' : 'article';
    }
    async currentArticles(profile, groupIds, exclude = null) {
        const base = {
            groupId: { in: groupIds },
            status: client_1.TargetStatus.AVAILABLE,
            post: {
                status: 'AVAILABLE',
                AND: [(0, claimable_1.claimablePostWhere)(profile), claimable_1.publishableArticleWhere],
            },
            ...notForcedElsewhere(profile.id),
            ...(exclude ? { NOT: exclude } : {}),
        };
        const boosted = [];
        const behind = (await this.campaigns?.behind().catch(() => [])) ?? [];
        for (const c of behind) {
            if (c.profileIds.length && !c.profileIds.includes(profile.id))
                continue;
            const rows = await this.prisma.postTarget.findMany({
                where: { AND: [base, c.where, { forcedProfileId: null }] },
                orderBy: [{ post: { priority: 'desc' } }, { post: { createdAt: 'asc' } }],
                select: { postId: true },
                take: 50,
            });
            for (const r of rows)
                if (!boosted.includes(r.postId))
                    boosted.push(r.postId);
            if (boosted.length >= 3)
                break;
        }
        const forced = await this.prisma.postTarget.findMany({
            where: { AND: [base, { forcedProfileId: profile.id }] },
            select: { postId: true },
            take: 50,
        });
        const targets = await this.prisma.postTarget.findMany({
            where: base,
            orderBy: [
                { forcedProfileId: { sort: 'asc', nulls: 'last' } },
                { post: { priority: 'desc' } },
                { post: { createdAt: 'asc' } },
            ],
            select: { postId: true },
            take: 200,
        });
        return [...new Set([...forced.map((t) => t.postId), ...boosted, ...targets.map((t) => t.postId)])].slice(0, 3);
    }
    async byTopPriority(groups, profile) {
        const now = Date.now();
        const crowded = new Set((await this.prisma.publicationJobItem.findMany({
            where: {
                job: { groupId: { in: groups.map((g) => g.id) }, profileId: { not: profile.id } },
                OR: [
                    { status: client_1.TargetStatus.CONSUMED, updatedAt: { gt: new Date(now - 10 * 60_000) } },
                    { status: client_1.TargetStatus.PUBLISHED, publishedAt: { gt: new Date(now - GROUP_GAP_MINUTES * 60_000) } },
                ],
            },
            select: { job: { select: { groupId: true } } },
        })).map((item) => item.job.groupId));
        const groupPriority = new Map((await this.prisma.group.findMany({ where: { id: { in: groups.map((g) => g.id) } }, select: { id: true, priority: true } })).map((g) => [g.id, g.priority ?? 0]));
        const preApproved = new Set((await this.prisma.profileGroup.findMany({
            where: { profileId: profile.id, groupId: { in: groups.map((g) => g.id) }, preApprovedAt: { not: null } },
            select: { groupId: true },
        })).map((link) => link.groupId));
        const tops = await Promise.all(groups.map(async (group) => {
            const top = await this.prisma.postTarget.findFirst({
                where: {
                    groupId: group.id,
                    status: client_1.TargetStatus.AVAILABLE,
                    post: { status: 'AVAILABLE', AND: [(0, claimable_1.claimablePostWhere)(profile), claimable_1.publishableArticleWhere] },
                    ...notForcedElsewhere(profile.id),
                },
                orderBy: [
                    { forcedProfileId: { sort: 'asc', nulls: 'last' } },
                    { post: { priority: 'desc' } },
                    { post: { createdAt: 'asc' } },
                ],
                select: {
                    forcedProfileId: true,
                    post: { select: { priority: true } },
                },
            });
            return {
                group,
                forced: top?.forcedProfileId === profile.id ? 1 : 0,
                priority: top?.post.priority ?? 0,
                free: crowded.has(group.id) ? 0 : 1,
                groupPriority: groupPriority.get(group.id) ?? 0,
                preApproved: preApproved.has(group.id) ? 1 : 0,
                tie: Math.random(),
            };
        }));
        return tops
            .sort((a, b) => b.forced - a.forced ||
            b.groupPriority - a.groupPriority ||
            b.free - a.free ||
            b.priority - a.priority ||
            b.preApproved - a.preApproved ||
            a.tie - b.tie)
            .map(({ group }) => group);
    }
    async isFinished(jobId) {
        const open = await this.prisma.publicationJobItem.count({
            where: {
                jobId,
                status: { in: [client_1.TargetStatus.CLAIMED, client_1.TargetStatus.CONSUMED] },
            },
        });
        return open === 0;
    }
    async release(jobId, acting = null, reason = 'lot libéré') {
        await this.reachableJob(jobId, acting);
        const job = await this.prisma.publicationJob.findUnique({
            where: { id: jobId },
            select: {
                id: true,
                status: true,
                profileId: true,
                groupId: true,
                items: { select: { id: true, status: true, postTargetId: true } },
            },
        });
        if (!job)
            throw new common_1.NotFoundException('Job introuvable');
        const waiting = job.items.filter((item) => item.status === client_1.TargetStatus.CLAIMED);
        const started = job.items.filter((item) => item.status === client_1.TargetStatus.CONSUMED);
        if (job.status !== client_1.JobStatus.CLAIMED && !waiting.length && !started.length) {
            return { jobId, released: 0, inProgress: 0, interrupted: 0, alreadyClosed: true };
        }
        const interruptedWhy = 'Interrompu pendant la publication (lot libéré) : vérifiez sur Facebook — « Déjà en ligne » s’il y est, sinon « Relancer »';
        await this.prisma.$transaction([
            this.prisma.postTarget.updateMany({
                where: {
                    id: { in: waiting.map((item) => item.postTargetId) },
                    status: client_1.TargetStatus.CLAIMED,
                },
                data: { status: client_1.TargetStatus.AVAILABLE, claimedAt: null, claimExpiresAt: null },
            }),
            this.prisma.publicationJobItem.updateMany({
                where: { id: { in: waiting.map((item) => item.id) } },
                data: { status: client_1.TargetStatus.FAILED, error: `Rendu à la file : ${reason}` },
            }),
            this.prisma.postTarget.updateMany({
                where: {
                    id: { in: started.map((item) => item.postTargetId) },
                    status: { in: [client_1.TargetStatus.CONSUMED, client_1.TargetStatus.CLAIMED] },
                },
                data: { status: client_1.TargetStatus.FAILED, lastError: interruptedWhy, claimedAt: null, claimExpiresAt: null },
            }),
            this.prisma.publicationJobItem.updateMany({
                where: { id: { in: started.map((item) => item.id) } },
                data: { status: client_1.TargetStatus.FAILED, error: `Interrompu pendant la publication : ${reason}` },
            }),
            ...started.map((item) => (0, trace_1.trace)(this.prisma, {
                postTargetId: item.postTargetId,
                kind: 'FAILED',
                actor: acting?.username ?? 'clé globale',
                jobId,
                detail: interruptedWhy,
            })),
            ...(job.status === client_1.JobStatus.CLAIMED
                ? [this.prisma.publicationJob.update({ where: { id: jobId }, data: { status: client_1.JobStatus.EXPIRED, completedAt: new Date() } })]
                : []),
            this.prisma.activityLog.create({
                data: {
                    jobId,
                    profileId: job.profileId,
                    groupId: job.groupId,
                    eventType: 'JOB_RELEASED',
                    level: 'WARN',
                    message: `Lot libéré (${reason}) : ${waiting.length} post(s) rendu(s) à la file` +
                        (started.length ? `, ${started.length} interrompu(s) en cours de publication → « En échec », à vérifier` : ''),
                    metadata: { by: acting?.username ?? 'clé globale', reason, released: waiting.length, interrupted: started.length },
                },
            }),
        ]);
        return { jobId, released: waiting.length, inProgress: 0, interrupted: started.length, alreadyClosed: false };
    }
    async markConsumed(jobId, postId, acting = null) {
        await this.reachableJob(jobId, acting);
        return this.updateItem(jobId, postId, client_1.TargetStatus.CONSUMED, {});
    }
    async markPublished(jobId, postId, dto, acting = null) {
        await this.reachableJob(jobId, acting);
        const publishedAt = dto.publishedAt
            ? new Date(dto.publishedAt)
            : new Date();
        const result = await this.updateItem(jobId, postId, client_1.TargetStatus.PUBLISHED, { publishedAt, externalPostUrl: dto.externalPostUrl });
        if (dto.pendingApproval)
            await this.notePendingApproval(result.postTargetId, jobId, postId, publishedAt);
        await this.archiveArticleOf(postId, publishedAt);
        await this.noteCycle(jobId).catch(() => undefined);
        return result;
    }
    async cycleState(profileId, now = new Date()) {
        const [settings, runner] = await Promise.all([
            Promise.resolve(this.prisma.automationSetting?.findUnique({ where: { id: 'global' }, select: { cycleMaxPosts: true, cyclePauseHours: true } })).catch(() => null),
            Promise.resolve(this.prisma.profileRunner?.findUnique({ where: { profileId }, select: { cycleMaxPosts: true, cyclePauseHours: true, cycleStartedAt: true, restUntil: true } })).catch(() => null),
        ]);
        const rule = (0, cycle_1.cycleRule)(settings, runner);
        if (!rule.max)
            return null;
        if (runner?.restUntil && runner.restUntil > now)
            return { ...rule, used: rule.max, left: 0, restUntil: runner.restUntil };
        const used = await this.prisma.publicationJobItem.count({
            where: { status: client_1.TargetStatus.PUBLISHED, publishedAt: { gte: (0, cycle_1.cycleSince)(runner, now) }, job: { profileId } },
        });
        return { ...rule, used, left: Math.max(0, rule.max - used), restUntil: null };
    }
    async noteCycle(jobId, now = new Date()) {
        const job = await this.prisma.publicationJob.findUnique({ where: { id: jobId }, select: { profileId: true, profile: { select: { name: true } } } });
        if (!job)
            return;
        const cycle = await this.cycleState(job.profileId, now);
        if (!cycle || cycle.restUntil || cycle.used < cycle.max)
            return;
        const restUntil = new Date(now.getTime() + cycle.hours * 3_600_000);
        await this.prisma.profileRunner.update({ where: { profileId: job.profileId }, data: { restUntil, cycleStartedAt: restUntil } });
        await this.log({
            profileId: job.profileId,
            jobId,
            eventType: 'PROFILE_CYCLE_REST',
            message: `« ${job.profile.name} » : ${cycle.used} post(s) publiés — pause de ${cycle.hours} h (reprise le ${restUntil.toISOString().slice(0, 16).replace('T', ' ')} UTC)`,
            metadata: { used: cycle.used, max: cycle.max, hours: cycle.hours, restUntil: restUntil.toISOString() },
        });
    }
    async notePendingApproval(postTargetId, jobId, postId, at) {
        await this.prisma.postTarget.update({ where: { id: postTargetId }, data: { approvalPendingSince: at, approvalCheckedAt: at } });
        await (0, trace_1.trace)(this.prisma, { postTargetId, kind: 'APPROVAL_PENDING', jobId });
        await this.log({ jobId, postId, eventType: 'POST_APPROVAL_PENDING', level: 'WARN', message: 'Soumis : en attente de validation par l’administrateur du groupe (revérifié après chaque lot du profil)' });
    }
    async approvalsDue(profileExternalId, acting, limit = 2, now = new Date()) {
        const profile = await this.prisma.profile.findFirst({
            where: { externalId: profileExternalId, ...(0, scope_1.profileWhere)((0, scope_1.scopeOf)(acting)) },
            select: { id: true },
        });
        if (!profile)
            throw new common_1.NotFoundException(`Profil introuvable pour externalId=${profileExternalId}`);
        await this.expireApprovals(profile.id, now);
        const items = await this.prisma.publicationJobItem.findMany({
            where: {
                status: client_1.TargetStatus.PUBLISHED,
                job: { profileId: profile.id },
                postTarget: {
                    status: client_1.TargetStatus.PUBLISHED,
                    approvalPendingSince: { not: null },
                    OR: [{ approvalCheckedAt: null }, { approvalCheckedAt: { lt: new Date(now.getTime() - APPROVAL_RECHECK_MINUTES * 60_000) } }],
                },
            },
            orderBy: { postTarget: { approvalCheckedAt: 'asc' } },
            take: limit,
            select: {
                jobId: true,
                postId: true,
                postTargetId: true,
                post: { select: { description: true, url: true, noComment: true } },
                job: { select: { group: { select: { externalId: true, url: true, name: true } } } },
                postTarget: { select: { approvalPendingSince: true, approvalChecks: true } },
            },
        });
        return items.map((i) => ({
            targetId: i.postTargetId,
            jobId: i.jobId,
            postId: i.postId,
            content: i.post.description,
            willReceiveLink: Boolean(i.post.url),
            noComment: i.post.noComment,
            group: i.job.group,
            pendingSince: i.postTarget.approvalPendingSince,
            checks: i.postTarget.approvalChecks,
        }));
    }
    async expireApprovals(profileId, now) {
        const stale = await this.prisma.publicationJobItem.findMany({
            where: {
                status: client_1.TargetStatus.PUBLISHED,
                job: { profileId },
                postTarget: { status: client_1.TargetStatus.PUBLISHED, approvalPendingSince: { lt: new Date(now.getTime() - APPROVAL_MAX_HOURS * 3_600_000) } },
            },
            select: { id: true, jobId: true, postId: true, postTargetId: true },
        });
        const error = `Non validé par l’administrateur du groupe en ${APPROVAL_MAX_HOURS} h`;
        for (const s of stale) {
            await this.prisma.$transaction(async (tx) => {
                await tx.publicationJobItem.update({ where: { id: s.id }, data: { status: client_1.TargetStatus.FAILED, error } });
                await tx.postTarget.update({ where: { id: s.postTargetId }, data: { status: client_1.TargetStatus.FAILED, lastError: error, approvalPendingSince: null } });
                await (0, trace_1.trace)(tx, { postTargetId: s.postTargetId, kind: 'NOT_APPROVED', jobId: s.jobId, detail: error });
            });
            await this.log({ jobId: s.jobId, postId: s.postId, eventType: 'POST_NOT_APPROVED', level: 'WARN', message: error });
        }
    }
    async reportApproval(targetId, dto, acting, now = new Date()) {
        const item = await this.prisma.publicationJobItem.findFirst({
            where: { postTargetId: targetId, status: client_1.TargetStatus.PUBLISHED, job: (0, scope_1.jobWhere)((0, scope_1.scopeOf)(acting)) },
            orderBy: { createdAt: 'desc' },
            select: { id: true, jobId: true, postId: true, postTarget: { select: { approvalPendingSince: true } }, job: { select: { profileId: true } } },
        });
        if (!item)
            throw new common_1.NotFoundException('Publication introuvable');
        if (!item.postTarget.approvalPendingSince)
            return { result: 'not_pending' };
        if (dto.outcome === 'pending') {
            await this.prisma.postTarget.update({ where: { id: targetId }, data: { approvalCheckedAt: now, approvalChecks: { increment: 1 } } });
            return { result: 'still_pending' };
        }
        const facebookUrl = (0, trace_1.normalizeFacebookUrl)(dto.externalPostUrl) ?? dto.externalPostUrl ?? null;
        await this.prisma.$transaction(async (tx) => {
            await tx.publicationJobItem.update({ where: { id: item.id }, data: { publishedAt: now, ...(facebookUrl ? { externalPostUrl: facebookUrl } : {}) } });
            await tx.postTarget.update({
                where: { id: targetId },
                data: { approvalPendingSince: null, approvalCheckedAt: now, approvalChecks: { increment: 1 }, publishedAt: now, ...(facebookUrl ? { facebookUrl } : {}) },
            });
            await (0, trace_1.trace)(tx, { postTargetId: targetId, kind: 'APPROVED', facebookUrl, profileId: item.job.profileId, jobId: item.jobId });
        });
        await this.log({ jobId: item.jobId, postId: item.postId, eventType: 'POST_APPROVED', message: 'Validé par l’administrateur du groupe : visible, le travail continue (commentaire puis URL)' });
        return { result: 'approved', jobId: item.jobId, postId: item.postId, externalPostUrl: facebookUrl };
    }
    async archiveArticleOf(postId, publishedAt) {
        const { count } = await this.prisma.article.updateMany({
            where: { archivedAt: null, posts: { some: { id: postId } } },
            data: { archivedAt: publishedAt },
        });
        if (count) {
            await this.log({
                postId,
                eventType: 'ARTICLE_ARCHIVED',
                message: 'Article archivé : un de ses posts vient d’être publié',
            });
        }
    }
    async markFailed(jobId, postId, error, acting = null, requeue = false, blocked = false) {
        await this.reachableJob(jobId, acting);
        const item = await this.updateItem(jobId, postId, client_1.TargetStatus.FAILED, { error });
        if (blocked || isRateLimited(error))
            await this.pauseForRateLimit(jobId, error);
        if (requeue || blocked)
            await this.requeueUnpublished(jobId, postId, error);
        return item;
    }
    async pauseForRateLimit(jobId, reason, now = new Date()) {
        const job = await this.prisma.publicationJob.findUnique({
            where: { id: jobId },
            select: { profileId: true, profile: { select: { name: true, ownerId: true } } },
        });
        if (!job)
            return null;
        const profileId = job.profileId;
        const settings = await this.prisma.automationSetting.findUnique({ where: { id: 'global' }, select: { rateLimitPauseDays: true } });
        const days = settings?.rateLimitPauseDays ?? 5;
        const until = new Date(now.getTime() + days * 86_400_000);
        const why = `Facebook limite ses publications : ${String(reason).slice(0, 300)}`;
        await this.prisma.profileRunner.upsert({
            where: { profileId },
            create: { profileId, pausedUntil: until, pauseReason: why },
            update: { pausedUntil: until, pauseReason: why },
        });
        const active = await this.prisma.publicationJob.findMany({
            where: { profileId, status: client_1.JobStatus.CLAIMED },
            select: { id: true },
        });
        let released = 0;
        for (const j of active) {
            const r = await this.release(j.id, null, `profil « ${job.profile.name} » limité par Facebook`).catch(() => null);
            released += r?.released ?? 0;
        }
        const [unforced, opened] = await this.prisma.$transaction([
            this.prisma.postTarget.updateMany({
                where: { forcedProfileId: profileId, status: { in: [client_1.TargetStatus.AVAILABLE, client_1.TargetStatus.FAILED] } },
                data: { forcedProfileId: null, forcedAt: null },
            }),
            this.prisma.post.updateMany({
                where: { profileId, status: 'AVAILABLE' },
                data: { profileId: null, ownerId: job.profile.ownerId },
            }),
        ]);
        await this.log({
            profileId,
            jobId,
            eventType: 'PROFILE_RATE_LIMITED',
            level: 'WARN',
            message: `« ${job.profile.name} » limité par Facebook : en pause ${days} jour(s), jusqu’au ${until.toISOString().slice(0, 10)}` +
                ` — ${released} post(s) du lot rendus à la file, ${unforced.count} envoi(s) forcé(s) rendus, ${opened.count} post(s) ouverts aux autres profils`,
            metadata: { until: until.toISOString(), days, released, unforced: unforced.count, opened: opened.count, reason: String(reason).slice(0, 500) },
        });
        return { until, released, unforced: unforced.count, opened: opened.count };
    }
    async suspendProfile(profileExternalId, input, acting) {
        if (input.kind === 'logged_out')
            return this.loggedOut(profileExternalId, input, acting);
        const profile = await this.prisma.profile.findFirst({
            where: { externalId: profileExternalId, ...(0, scope_1.profileWhere)((0, scope_1.scopeOf)(acting)) },
            select: { id: true, name: true, ownerId: true, facebookSuspension: true },
        });
        if (!profile)
            throw new common_1.NotFoundException(`Profil introuvable pour externalId=${profileExternalId}`);
        const detail = [input.detail, input.url].filter(Boolean).join(' — ').slice(0, 1000);
        const kind = profile.facebookSuspension === 'disabled' ? 'disabled' : input.kind;
        const before = profile.facebookSuspension ? null : (await this.prisma.profileRunner.findUnique({ where: { profileId: profile.id }, select: { mode: true } }))?.mode ?? null;
        await this.prisma.profile.update({
            where: { id: profile.id },
            data: { facebookSuspension: kind, suspendedAt: new Date(), suspensionDetail: detail || null, ...(before && before !== 'OFF' ? { modeBeforeSuspension: before } : {}) },
        });
        await this.prisma.profileRunner.updateMany({ where: { profileId: profile.id }, data: { mode: 'OFF' } });
        const active = await this.prisma.publicationJob.findMany({ where: { profileId: profile.id, status: client_1.JobStatus.CLAIMED }, select: { id: true } });
        let released = 0;
        for (const j of active) {
            const r = await this.release(j.id, null, `profil « ${profile.name} » suspendu par Facebook`).catch(() => null);
            released += r?.released ?? 0;
        }
        const [unforced, opened] = await this.prisma.$transaction([
            this.prisma.postTarget.updateMany({
                where: { forcedProfileId: profile.id, status: { in: [client_1.TargetStatus.AVAILABLE, client_1.TargetStatus.FAILED] } },
                data: { forcedProfileId: null, forcedAt: null },
            }),
            this.prisma.post.updateMany({ where: { profileId: profile.id, status: 'AVAILABLE' }, data: { profileId: null, ownerId: profile.ownerId } }),
        ]);
        await this.log({
            profileId: profile.id,
            eventType: kind === 'disabled' ? 'PROFILE_SUSPENDED_FACEBOOK' : 'PROFILE_CHECKPOINT_FACEBOOK',
            level: 'ERROR',
            message: (kind === 'disabled' ? `« ${profile.name} » : compte suspendu par Facebook` : `« ${profile.name} » : Facebook demande une vérification du compte`) +
                ` — arrêté, ${released} post(s) du lot rendus à la file, ${opened.count} post(s) ouverts aux autres profils`,
            metadata: { kind, detail, released, unforced: unforced.count, opened: opened.count },
        });
        return { kind, released, opened: opened.count };
    }
    async loggedOut(profileExternalId, input, acting) {
        const profile = await this.prisma.profile.findFirst({
            where: { externalId: profileExternalId, ...(0, scope_1.profileWhere)((0, scope_1.scopeOf)(acting)) },
            select: { id: true, name: true, facebookSuspension: true },
        });
        if (!profile)
            throw new common_1.NotFoundException(`Profil introuvable pour externalId=${profileExternalId}`);
        if (profile.facebookSuspension && profile.facebookSuspension !== 'logged_out')
            return { kind: profile.facebookSuspension, released: 0, opened: 0 };
        const detail = [input.detail, input.url].filter(Boolean).join(' — ').slice(0, 1000);
        await this.prisma.profile.update({ where: { id: profile.id }, data: { facebookSuspension: 'logged_out', suspendedAt: new Date(), suspensionDetail: detail || null } });
        const active = await this.prisma.publicationJob.findMany({ where: { profileId: profile.id, status: client_1.JobStatus.CLAIMED }, select: { id: true } });
        let released = 0;
        for (const j of active) {
            const r = await this.release(j.id, null, `profil « ${profile.name} » déconnecté de Facebook`).catch(() => null);
            released += r?.released ?? 0;
        }
        if (profile.facebookSuspension !== 'logged_out') {
            await this.log({
                profileId: profile.id,
                eventType: 'PROFILE_LOGGED_OUT_FACEBOOK',
                level: 'WARN',
                message: `« ${profile.name} » : déconnecté de Facebook — arrêté, ${released} post(s) du lot rendus à la file. À reconnecter dans son navigateur : il reprend seul ensuite`,
                metadata: { detail, released },
            });
        }
        return { kind: 'logged_out', released, opened: 0 };
    }
    async reconnected(profileExternalId, acting) {
        const profile = await this.prisma.profile.findFirst({
            where: { externalId: profileExternalId, ...(0, scope_1.profileWhere)((0, scope_1.scopeOf)(acting)) },
            select: { id: true, name: true, facebookSuspension: true },
        });
        if (!profile)
            throw new common_1.NotFoundException(`Profil introuvable pour externalId=${profileExternalId}`);
        if (profile.facebookSuspension !== 'logged_out')
            return { reconnected: false, state: profile.facebookSuspension ?? 'ok' };
        await this.prisma.profile.update({ where: { id: profile.id }, data: { facebookSuspension: null, suspendedAt: null, suspensionDetail: null } });
        await this.log({ profileId: profile.id, eventType: 'PROFILE_RECONNECTED_FACEBOOK', message: `« ${profile.name} » : reconnecté à Facebook — il reprend` });
        return { reconnected: true, state: 'ok' };
    }
    async pilotRules(profileId, groupIds, now = new Date()) {
        const [settings, runner, groupRows] = await Promise.all([
            this.prisma.automationSetting.findUnique({ where: { id: 'global' }, select: { objectiveTimezone: true } }),
            this.prisma.profileRunner.findUnique({ where: { profileId }, select: { dailyQuota: true } }),
            this.prisma.group.findMany({ where: { id: { in: groupIds } }, select: { id: true, name: true, dailyCap: true, hoursStart: true, hoursEnd: true } }),
        ]);
        const tz = settings?.objectiveTimezone || 'Europe/Paris';
        const dayStart = (0, insights_service_1.startOfLocalDay)(now, tz);
        const minutes = (0, window_1.localClock)(now, tz).minutes;
        const quota = runner?.dailyQuota ?? null;
        const publishedToday = quota === null ? 0 : await this.prisma.publicationJobItem.count({
            where: { status: client_1.TargetStatus.PUBLISHED, publishedAt: { gte: dayStart }, job: { profileId } },
        });
        const capped = groupRows.filter((g) => g.dailyCap != null).map((g) => g.id);
        const [done, inFlight] = capped.length
            ? await Promise.all([
                this.prisma.postTarget.groupBy({ by: ['groupId'], where: { groupId: { in: capped }, status: client_1.TargetStatus.PUBLISHED, publishedAt: { gte: dayStart } }, _count: { _all: true } }),
                this.prisma.postTarget.groupBy({ by: ['groupId'], where: { groupId: { in: capped }, status: { in: [client_1.TargetStatus.CLAIMED, client_1.TargetStatus.CONSUMED] } }, _count: { _all: true } }),
            ])
            : [[], []];
        const used = new Map();
        for (const row of [...done, ...inFlight])
            used.set(row.groupId, (used.get(row.groupId) ?? 0) + row._count._all);
        const hhmm = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
        const groups = new Map();
        for (const g of groupRows) {
            let open = true;
            let why = '';
            if (g.hoursStart != null && g.hoursEnd != null && g.hoursStart !== g.hoursEnd) {
                open = g.hoursStart < g.hoursEnd ? minutes >= g.hoursStart && minutes < g.hoursEnd : minutes >= g.hoursStart || minutes < g.hoursEnd;
                if (!open)
                    why = `« ${g.name} » : publication de ${hhmm(g.hoursStart)} à ${hhmm(g.hoursEnd)}`;
            }
            const left = g.dailyCap == null ? null : Math.max(0, g.dailyCap - (used.get(g.id) ?? 0));
            if (left === 0)
                why = `« ${g.name} » : plafond de ${g.dailyCap}/jour atteint`;
            groups.set(g.id, { open, left, why });
        }
        return { quota, quotaLeft: quota === null ? null : Math.max(0, quota - publishedToday), groups, timeZone: tz };
    }
    async pausedUntil(profileId, now = new Date()) {
        const runner = await this.prisma.profileRunner.findUnique({ where: { profileId }, select: { pausedUntil: true } });
        return runner?.pausedUntil && runner.pausedUntil > now ? runner.pausedUntil : null;
    }
    async requeueUnpublished(jobId, postId, error) {
        const item = await this.prisma.publicationJobItem.findUnique({
            where: { jobId_postId: { jobId, postId } },
            select: {
                postTargetId: true,
                postTarget: { select: { status: true, attemptsCount: true, groupId: true, facebookUrl: true } },
                job: { select: { profileId: true, profile: { select: { name: true } } } },
                post: { select: { title: true } },
            },
        });
        if (!item || item.postTarget.status !== client_1.TargetStatus.FAILED)
            return;
        const tries = item.postTarget.attemptsCount;
        if (tries >= MAX_AUTO_REQUEUE) {
            await this.log({
                jobId,
                postId,
                profileId: item.job.profileId,
                eventType: 'TARGET_REQUEUE_EXHAUSTED',
                level: 'ERROR',
                message: `« ${item.post.title} » : ${tries} tentatives sans publier, laissé en échec — ${error}`,
            });
            return;
        }
        const others = await this.prisma.profileGroup.count({
            where: {
                groupId: item.postTarget.groupId,
                status: 'ACTIVE',
                joinStatus: client_1.JoinStatus.JOINED,
                profileId: { not: item.job.profileId },
                profile: { status: 'ACTIVE', isModerator: false },
            },
        });
        const who = others ? ` (par un autre profil que « ${item.job.profile.name} »)` : '';
        const detail = `rien n’était parti : remis dans la file automatiquement${who}, tentative ${tries + 1}/${MAX_AUTO_REQUEUE} — ${error}`;
        await this.prisma.$transaction([
            this.prisma.postTarget.update({
                where: { id: item.postTargetId },
                data: {
                    status: client_1.TargetStatus.AVAILABLE,
                    claimedAt: null,
                    claimExpiresAt: null,
                    consumedAt: null,
                    lastError: error,
                    avoidProfileId: others ? item.job.profileId : null,
                },
            }),
            (0, trace_1.trace)(this.prisma, { postTargetId: item.postTargetId, kind: 'RETRIED', actor: 'Remise en file automatique', jobId, detail }),
        ]);
        await this.log({
            jobId,
            postId,
            profileId: item.job.profileId,
            eventType: 'TARGET_AUTO_REQUEUED',
            level: 'WARN',
            message: `« ${item.post.title} » ${detail}`,
        });
    }
    async complete(jobId, acting = null) {
        await this.reachableJob(jobId, acting);
        const job = await this.prisma.publicationJob.findUnique({
            where: { id: jobId },
            include: { items: { include: { post: { select: { url: true } } } } },
        });
        if (!job)
            throw new common_1.NotFoundException('Job introuvable');
        const unfinished = job.items.some((item) => item.status === client_1.TargetStatus.CLAIMED ||
            item.status === client_1.TargetStatus.CONSUMED);
        if (unfinished) {
            throw new common_1.BadRequestException('Tous les posts doivent être finalisés');
        }
        const awaiting = job.items.filter((item) => this.awaitsLink(item));
        const missingComments = job.items.filter((item) => item.status === client_1.TargetStatus.PUBLISHED &&
            item.post.url &&
            !item.commentedAt);
        const outcome = this.outcomeFor(job.items);
        const status = awaiting.length ? client_1.JobStatus.AWAITING_LINK : outcome;
        const updated = await this.prisma.$transaction(async (tx) => {
            const result = await tx.publicationJob.update({
                where: { id: jobId },
                data: { status, completedAt: new Date() },
            });
            if (missingComments.length) {
                await tx.activityLog.create({
                    data: {
                        jobId,
                        profileId: job.profileId,
                        groupId: job.groupId,
                        eventType: 'COMMENT_MISSING',
                        level: 'WARN',
                        message: `${missingComments.length} post(s) publié(s) sans commentaire : leur URL ne pourra pas être placée`,
                        metadata: { postIds: missingComments.map((item) => item.postId) },
                    },
                });
            }
            await tx.activityLog.create({
                data: {
                    jobId,
                    profileId: job.profileId,
                    groupId: job.groupId,
                    eventType: awaiting.length ? 'JOB_AWAITING_LINK' : 'JOB_COMPLETED',
                    message: awaiting.length
                        ? `${awaiting.length} commentaire(s) à basculer sur l'URL`
                        : `Job clôturé avec le statut ${outcome}`,
                    metadata: { status, awaitingLink: awaiting.length },
                },
            });
            return result;
        });
        return {
            ...updated,
            awaitingLink: awaiting.length,
            missingComments: missingComments.length,
        };
    }
    async markCommented(jobId, postId, dto, acting = null) {
        await this.reachableJob(jobId, acting);
        const item = await this.prisma.publicationJobItem.findUnique({
            where: { jobId_postId: { jobId, postId } },
            include: {
                job: true,
                postTarget: true,
                post: { select: { url: true } },
            },
        });
        if (!item)
            throw new common_1.NotFoundException('Post introuvable dans ce job');
        if (item.status !== client_1.TargetStatus.PUBLISHED) {
            throw new common_1.BadRequestException('Le post doit être confirmé publié avant d’enregistrer son commentaire');
        }
        const replacing = Boolean(dto.replace) && Boolean(item.commentedAt) && !item.linkUpdatedAt && item.commentExternalId !== dto.commentExternalId;
        if (item.commentedAt && !replacing) {
            if (item.commentExternalId !== dto.commentExternalId) {
                await this.log({
                    jobId,
                    postId,
                    eventType: 'COMMENT_DUPLICATE',
                    level: 'WARN',
                    message: 'Un second commentaire a été signalé pour ce post',
                    metadata: {
                        enregistre: item.commentExternalId,
                        recu: dto.commentExternalId,
                    },
                });
            }
            return { ...item, url: item.post.url };
        }
        if (!replacing && item.job.status === client_1.JobStatus.CLAIMED && !this.stillOwnsTarget(item.job, item.postTarget)) {
            await this.logLostClaim(jobId, postId, item.postTargetId, item.status);
            throw new common_1.ConflictException('La réservation de ce post a expiré et a été reprise. ' +
                'Ne republiez pas ce post : signalez-le à un administrateur.');
        }
        const commentedAt = dto.commentedAt
            ? new Date(dto.commentedAt)
            : new Date();
        const data = { commentExternalId: dto.commentExternalId, commentedAt };
        return this.prisma.$transaction(async (tx) => {
            const updated = await tx.publicationJobItem.update({
                where: { id: item.id },
                data,
            });
            await tx.postTarget.update({ where: { id: item.postTargetId }, data });
            await (0, trace_1.trace)(tx, {
                postTargetId: item.postTargetId,
                kind: 'COMMENTED',
                facebookUrl: item.externalPostUrl
                    ? `${item.externalPostUrl}${item.externalPostUrl.includes('?') ? '&' : '?'}comment_id=${dto.commentExternalId}`
                    : null,
                profileId: item.job.profileId,
                jobId,
                detail: `commentaire ${dto.commentExternalId}`,
            });
            await tx.activityLog.create({
                data: {
                    jobId,
                    postId,
                    postTargetId: item.postTargetId,
                    profileId: item.job.profileId,
                    groupId: item.job.groupId,
                    facebookUrl: item.externalPostUrl,
                    eventType: replacing ? 'COMMENT_REPLACED' : 'POST_COMMENTED',
                    message: replacing
                        ? 'Premier commentaire introuvable : un nouveau a été posé, en attente de l’URL'
                        : 'Commentaire posé, en attente de l’URL',
                    metadata: replacing
                        ? { commentExternalId: dto.commentExternalId, remplace: item.commentExternalId }
                        : { commentExternalId: dto.commentExternalId },
                },
            });
            return { ...updated, url: item.post.url };
        });
    }
    async linkUpdates(jobId, acting = null) {
        await this.reachableJob(jobId, acting);
        const job = await this.prisma.publicationJob.findUnique({
            where: { id: jobId },
            include: {
                profile: { select: { id: true, name: true, externalId: true } },
                group: { select: { id: true, name: true, externalId: true } },
                items: { include: { post: { select: { url: true, title: true } }, postTarget: { select: { rescueStatus: true } } } },
            },
        });
        if (!job)
            throw new common_1.NotFoundException('Job introuvable');
        if (job.status === client_1.JobStatus.CLAIMED) {
            throw new common_1.BadRequestException('Clôturez le job (complete) avant de basculer les commentaires sur l’URL');
        }
        return {
            jobId: job.id,
            status: job.status,
            completedAt: job.completedAt,
            profile: job.profile,
            group: job.group,
            updates: job.items
                .filter((item) => this.awaitsLink(item) && !RESCUE_TAKES_OVER.has(item.postTarget?.rescueStatus ?? ''))
                .map((item) => ({
                postId: item.postId,
                title: item.post.title,
                commentExternalId: item.commentExternalId,
                url: item.post.url,
                externalPostUrl: item.externalPostUrl,
            })),
        };
    }
    async pendingLinkUpdates(profileExternalId, limit, acting = null) {
        const jobs = await this.prisma.publicationJob.findMany({
            where: {
                status: { not: client_1.JobStatus.CLAIMED },
                ...(0, scope_1.jobWhere)((0, scope_1.scopeOf)(acting)),
                ...(profileExternalId
                    ? { profile: { externalId: profileExternalId } }
                    : {}),
            },
            include: {
                profile: { select: { id: true, name: true, externalId: true } },
                group: { select: { id: true, name: true, externalId: true } },
                items: { include: { post: { select: { url: true, title: true } }, postTarget: { select: { rescueStatus: true } } } },
            },
            orderBy: { completedAt: 'asc' },
            take: limit,
        });
        return jobs
            .map((job) => ({
            jobId: job.id,
            completedAt: job.completedAt,
            profile: job.profile,
            group: job.group,
            updates: job.items
                .filter((item) => this.awaitsLink(item) && !RESCUE_TAKES_OVER.has(item.postTarget?.rescueStatus ?? ''))
                .map((item) => ({
                postId: item.postId,
                title: item.post.title,
                commentExternalId: item.commentExternalId,
                url: item.post.url,
            })),
        }))
            .filter((job) => job.updates.length > 0);
    }
    async markLinkUpdated(jobId, postId, dto, acting = null) {
        await this.reachableJob(jobId, acting);
        const item = await this.prisma.publicationJobItem.findUnique({
            where: { jobId_postId: { jobId, postId } },
            include: { job: true, post: { select: { url: true } } },
        });
        if (!item)
            throw new common_1.NotFoundException('Post introuvable dans ce job');
        if (!item.commentExternalId) {
            throw new common_1.BadRequestException('Aucun commentaire enregistré pour ce post : rien à modifier');
        }
        if (!item.post.url) {
            throw new common_1.BadRequestException('Ce post n’a pas d’URL à placer');
        }
        if (item.linkUpdatedAt)
            return { ...item, remaining: 0 };
        const linkUpdatedAt = dto.linkUpdatedAt
            ? new Date(dto.linkUpdatedAt)
            : new Date();
        return this.prisma.$transaction(async (tx) => {
            const updated = await tx.publicationJobItem.update({
                where: { id: item.id },
                data: { linkUpdatedAt },
            });
            await tx.postTarget.update({
                where: { id: item.postTargetId },
                data: { linkUpdatedAt },
            });
            await (0, trace_1.trace)(tx, {
                postTargetId: item.postTargetId,
                kind: 'LINK_PLACED',
                facebookUrl: item.externalPostUrl,
                profileId: item.job.profileId,
                jobId,
                detail: item.post.url,
            });
            await tx.activityLog.create({
                data: {
                    jobId,
                    postId,
                    postTargetId: item.postTargetId,
                    profileId: item.job.profileId,
                    groupId: item.job.groupId,
                    facebookUrl: item.externalPostUrl,
                    eventType: 'COMMENT_LINK_UPDATED',
                    message: `Commentaire modifié avec l’URL de l’article : ${item.post.url}`,
                    metadata: {
                        commentExternalId: item.commentExternalId,
                        url: item.post.url,
                    },
                },
            });
            const siblings = await tx.publicationJobItem.findMany({
                where: { jobId },
                include: { post: { select: { url: true } } },
            });
            const remaining = siblings.filter((sibling) => this.awaitsLink(sibling)).length;
            if (!remaining && item.job.status === client_1.JobStatus.AWAITING_LINK) {
                const status = this.outcomeFor(siblings);
                await tx.publicationJob.update({
                    where: { id: jobId },
                    data: { status },
                });
                await tx.activityLog.create({
                    data: {
                        jobId,
                        profileId: item.job.profileId,
                        groupId: item.job.groupId,
                        eventType: 'JOB_FINALIZED',
                        message: `Toutes les URL sont en place, job clôturé avec le statut ${status}`,
                        metadata: { status },
                    },
                });
            }
            return { ...updated, remaining };
        });
    }
    awaitsLink(item) {
        return (item.status === client_1.TargetStatus.PUBLISHED &&
            Boolean(item.post.url) &&
            item.commentedAt !== null &&
            item.linkUpdatedAt === null);
    }
    outcomeFor(items) {
        if (items.every((item) => item.status === client_1.TargetStatus.FAILED)) {
            return client_1.JobStatus.FAILED;
        }
        return items.some((item) => item.status === client_1.TargetStatus.FAILED)
            ? client_1.JobStatus.PARTIALLY_COMPLETED
            : client_1.JobStatus.COMPLETED;
    }
    log(data) {
        return this.prisma.activityLog.create({ data });
    }
    async updateItem(jobId, postId, status, data) {
        const item = await this.prisma.publicationJobItem.findUnique({
            where: { jobId_postId: { jobId, postId } },
            include: {
                job: { include: { profile: { select: { name: true } } } },
                postTarget: true,
            },
        });
        if (!item)
            throw new common_1.NotFoundException('Post introuvable dans ce job');
        if (item.status === status)
            return item;
        if (!this.canTransition(item.status, status)) {
            throw new common_1.BadRequestException(`Le post est déjà finalisé avec le statut ${item.status}`);
        }
        if (!this.stillOwnsTarget(item.job, item.postTarget)) {
            await this.logLostClaim(jobId, postId, item.postTargetId, status);
            throw new common_1.ConflictException('La réservation de ce post a expiré et a été reprise. ' +
                'Ne republiez pas ce post : signalez-le à un administrateur.');
        }
        const facebookUrl = status === client_1.TargetStatus.PUBLISHED
            ? ((0, trace_1.normalizeFacebookUrl)(data.externalPostUrl) ?? data.externalPostUrl ?? null)
            : undefined;
        return this.prisma.$transaction(async (tx) => {
            const updated = await tx.publicationJobItem.update({
                where: { id: item.id },
                data: {
                    status,
                    ...data,
                    ...(facebookUrl !== undefined ? { externalPostUrl: facebookUrl } : {}),
                },
            });
            await tx.postTarget.update({
                where: { id: item.postTargetId },
                data: {
                    status,
                    consumedAt: status === client_1.TargetStatus.CONSUMED ? new Date() : undefined,
                    publishedAt: data.publishedAt,
                    lastError: data.error,
                    facebookUrl,
                },
            });
            if (status === client_1.TargetStatus.PUBLISHED || status === client_1.TargetStatus.FAILED) {
                await (0, trace_1.trace)(tx, {
                    postTargetId: item.postTargetId,
                    kind: status === client_1.TargetStatus.FAILED
                        ? 'FAILED'
                        : facebookUrl
                            ? 'PUBLISHED'
                            : 'URL_MISSING',
                    facebookUrl,
                    actor: item.job.profile?.name ?? null,
                    profileId: item.job.profileId,
                    jobId,
                    detail: status === client_1.TargetStatus.FAILED
                        ? data.error
                        : facebookUrl
                            ? null
                            : 'l’extension n’a pas retrouvé l’adresse du post : le vérificateur la cherchera dans le groupe',
                });
            }
            await tx.activityLog.create({
                data: {
                    jobId,
                    postId,
                    postTargetId: item.postTargetId,
                    profileId: item.job.profileId,
                    groupId: item.job.groupId,
                    facebookUrl: facebookUrl ?? item.externalPostUrl ?? null,
                    eventType: `POST_${status}`,
                    level: status === client_1.TargetStatus.FAILED ? 'ERROR' : status === client_1.TargetStatus.PUBLISHED && !facebookUrl ? 'WARN' : 'INFO',
                    message: data.error ??
                        (status === client_1.TargetStatus.PUBLISHED
                            ? facebookUrl
                                ? `Publié par ${item.job.profile?.name ?? 'le profil'} : ${facebookUrl}`
                                : `Publié par ${item.job.profile?.name ?? 'le profil'}, SANS adresse Facebook : le vérificateur la cherchera dans le groupe`
                            : `Post marqué ${status}`),
                },
            });
            return updated;
        });
    }
    canTransition(from, to) {
        if (from === client_1.TargetStatus.CLAIMED)
            return true;
        if (from === client_1.TargetStatus.CONSUMED) {
            return to === client_1.TargetStatus.PUBLISHED || to === client_1.TargetStatus.FAILED;
        }
        return false;
    }
    stillOwnsTarget(job, target) {
        return (target.claimExpiresAt !== null &&
            target.claimExpiresAt.getTime() === job.claimExpiresAt.getTime());
    }
    logLostClaim(jobId, postId, postTargetId, status) {
        return this.prisma.activityLog.create({
            data: {
                jobId,
                postId,
                postTargetId,
                eventType: 'CLAIM_LOST',
                level: 'ERROR',
                message: `Confirmation ${status} refusée : la réservation a été reprise`,
            },
        });
    }
    randomInt(min, max) {
        return Math.floor(Math.random() * (max - min + 1)) + min;
    }
};
exports.JobsService = JobsService;
exports.JobsService = JobsService = __decorate([
    (0, common_1.Injectable)(),
    __param(2, (0, common_1.Optional)()),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        config_1.ConfigService,
        campaigns_service_1.CampaignsService])
], JobsService);
//# sourceMappingURL=jobs.service.js.map