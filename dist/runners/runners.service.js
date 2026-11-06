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
exports.RunnersService = void 0;
exports.sleepUntilOf = sleepUntilOf;
exports.stateGroupNames = stateGroupNames;
exports.wantedNstGroup = wantedNstGroup;
exports.withSuspension = withSuspension;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const node_crypto_1 = require("node:crypto");
const client_1 = require("@prisma/client");
const prisma_service_1 = require("../prisma/prisma.service");
const campaigns_service_1 = require("../campaigns/campaigns.service");
const scope_1 = require("../auth/scope");
const moderator_guard_1 = require("../auth/moderator-guard");
const scope_2 = require("../auth/scope");
const window_1 = require("./window");
const pairing_1 = require("./pairing");
const STALE_SECONDS = 180;
const POLL_RUNNING = 60;
const POLL_IDLE = 120;
const PAIR_CODE_LENGTH = 8;
const PAIR_CODE_TTL_MINUTES = 15;
const PAIR_MAX_ATTEMPTS = 10;
const PAIR_WINDOW_MINUTES = 10;
const MAX_SLEEP_MS = 24 * 3600 * 1000;
function sleepUntilOf(raw, now = new Date()) {
    if (!raw)
        return null;
    const at = new Date(raw);
    if (Number.isNaN(at.getTime()) || at <= now)
        return null;
    return at.getTime() - now.getTime() > MAX_SLEEP_MS ? new Date(now.getTime() + MAX_SLEEP_MS) : at;
}
function sleeping(runner, now) {
    return Boolean(runner?.sleepUntil && runner.sleepUntil.getTime() > now.getTime());
}
function pauseEnd(at, timezone) {
    try {
        return at.toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: timezone });
    }
    catch {
        return at.toISOString().slice(0, 16).replace('T', ' ');
    }
}
function clock(at, timezone) {
    try {
        return at.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: timezone });
    }
    catch {
        return at.toISOString().slice(11, 16);
    }
}
let RunnersService = class RunnersService {
    prisma;
    config;
    campaigns;
    constructor(prisma, config, campaigns) {
        this.prisma = prisma;
        this.config = config;
        this.campaigns = campaigns;
    }
    async dayPlan(now) {
        return (await this.campaigns?.dayPlan(now).catch(() => null)) ?? null;
    }
    restOf(plan, profile) {
        if (!plan || !this.campaigns)
            return null;
        const day = this.campaigns.profileDay({ id: profile.id, ownerId: profile.ownerId ?? null, team: profile.teamNstGroupId ?? null }, plan, { strict: profile.runner?.mode === client_1.RunnerMode.AUTO });
        return day.resting ? day.reason : null;
    }
    newPairCode() {
        const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
        return Array.from({ length: PAIR_CODE_LENGTH }, () => alphabet[(0, node_crypto_1.randomInt)(alphabet.length)]).join('');
    }
    async createPairCode(profileId, acting = null) {
        const profile = await this.prisma.profile.findFirst({
            where: { id: profileId, ...(0, scope_2.profileWhere)((0, scope_1.scopeOf)(acting)) },
            select: { id: true, name: true, externalId: true },
        });
        if (!profile)
            throw new common_1.NotFoundException('Profil introuvable');
        if (!profile.externalId) {
            throw new common_1.BadRequestException(`Le profil « ${profile.name} » n'a pas d'identifiant externe (externalId) : ` +
                'renseigne-le avant de l’appairer.');
        }
        const code = this.newPairCode();
        const expiresAt = new Date(Date.now() + PAIR_CODE_TTL_MINUTES * 60_000);
        await this.prisma.profileRunner.upsert({
            where: { profileId: profile.id },
            create: { profileId: profile.id, pairCode: code, pairCodeExpiresAt: expiresAt },
            update: { pairCode: code, pairCodeExpiresAt: expiresAt },
        });
        return {
            code,
            expiresAt: expiresAt.toISOString(),
            expiresInMinutes: PAIR_CODE_TTL_MINUTES,
            profileId: profile.id,
            profileName: profile.name,
        };
    }
    async pair(rawCode, apiBaseUrl, from = 'inconnu') {
        const code = String(rawCode || '').trim().toUpperCase();
        this.guardPairAttempts(from);
        const runner = code
            ? await this.prisma.profileRunner.findUnique({
                where: { pairCode: code },
                select: {
                    profileId: true,
                    pairCodeExpiresAt: true,
                    profile: {
                        select: { name: true, externalId: true, status: true, ownerId: true },
                    },
                },
            })
            : null;
        if (!runner || !runner.profile.externalId) {
            this.countPairFailure(from);
            throw new common_1.NotFoundException('Code inconnu ou déjà utilisé');
        }
        if (!runner.pairCodeExpiresAt || runner.pairCodeExpiresAt.getTime() < Date.now()) {
            await this.prisma.profileRunner.update({
                where: { profileId: runner.profileId },
                data: { pairCode: null, pairCodeExpiresAt: null },
            });
            this.countPairFailure(from);
            throw new common_1.BadRequestException(`Code expiré (il vaut ${PAIR_CODE_TTL_MINUTES} minutes). Génère-en un nouveau.`);
        }
        const apiKey = await this.keyFor(runner.profile.ownerId);
        if (!apiKey) {
            throw new common_1.BadRequestException('Aucune clé d’automatisation disponible pour ce profil : ' +
                'donne-lui un propriétaire, ou configure AUTOMATION_API_KEY.');
        }
        await this.prisma.profileRunner.update({
            where: { profileId: runner.profileId },
            data: {
                pairCode: null,
                pairCodeExpiresAt: null,
                pairedAt: new Date(),
                pairedKeyHash: (0, pairing_1.keyHash)(apiKey),
                pairedExternalId: runner.profile.externalId,
                keyRejectedAt: null,
                keyRejectReason: null,
            },
        });
        this.pairAttempts.delete(from);
        return {
            apiBaseUrl,
            apiKey,
            profileExternalId: runner.profile.externalId,
            profileName: runner.profile.name,
            profileActive: runner.profile.status === 'ACTIVE',
        };
    }
    async autoPair(rawExternalId, rawName, acting, providedKey) {
        const externalId = String(rawExternalId || '').trim();
        if (!externalId)
            throw new common_1.BadRequestException('Identifiant de profil NSTBrowser manquant');
        let profile = await this.prisma.profile.findFirst({
            where: { externalId, ...(0, scope_2.profileWhere)((0, scope_1.scopeOf)(acting)) },
            select: { id: true, name: true, externalId: true, status: true },
        });
        let created = false;
        if (!profile) {
            const elsewhere = await this.prisma.profile.findFirst({
                where: { externalId },
                select: { id: true },
            });
            if (elsewhere) {
                throw new common_1.NotFoundException('Ce profil appartient à un autre compte : la clé de cette extension ne le voit pas');
            }
            profile = await this.prisma.profile.create({
                data: {
                    externalId,
                    name: String(rawName || '').trim().slice(0, 200) || externalId,
                    ownerId: acting?.id ?? null,
                },
                select: { id: true, name: true, externalId: true, status: true },
            });
            created = true;
        }
        const pairing = {
            pairedAt: new Date(),
            pairedExternalId: externalId,
            ...(providedKey ? { pairedKeyHash: (0, pairing_1.keyHash)(providedKey) } : {}),
            keyRejectedAt: null,
            keyRejectReason: null,
            pairCode: null,
            pairCodeExpiresAt: null,
        };
        await this.prisma.profileRunner.upsert({
            where: { profileId: profile.id },
            create: { profileId: profile.id, ...pairing },
            update: pairing,
        });
        await this.prisma.activityLog
            .create({
            data: {
                profileId: profile.id,
                eventType: 'RUNNER_AUTO_PAIRED',
                message: created
                    ? `Profil « ${profile.name} » créé et appairé automatiquement par son navigateur`
                    : `Navigateur appairé automatiquement au profil « ${profile.name} »`,
                metadata: { externalId, created, by: acting?.username ?? 'clé globale' },
            },
        })
            .catch(() => undefined);
        return {
            profileExternalId: externalId,
            profileName: profile.name,
            profileActive: profile.status === 'ACTIVE',
            created,
        };
    }
    async keyFor(ownerId) {
        if (ownerId) {
            const owner = await this.prisma.user.findFirst({
                where: { id: ownerId, status: 'ACTIVE' },
                select: { automationKey: true },
            });
            if (owner?.automationKey)
                return owner.automationKey;
        }
        return this.config.get('AUTOMATION_API_KEY') || '';
    }
    pairAttempts = new Map();
    guardPairAttempts(from) {
        const seen = this.pairAttempts.get(from);
        if (!seen)
            return;
        if (seen.until < Date.now()) {
            this.pairAttempts.delete(from);
            return;
        }
        if (seen.count >= PAIR_MAX_ATTEMPTS) {
            throw new common_1.HttpException('Trop de codes refusés depuis cette adresse. Réessaie dans quelques minutes.', common_1.HttpStatus.TOO_MANY_REQUESTS);
        }
    }
    countPairFailure(from) {
        const seen = this.pairAttempts.get(from);
        const until = Date.now() + PAIR_WINDOW_MINUTES * 60_000;
        this.pairAttempts.set(from, {
            count: (seen && seen.until > Date.now() ? seen.count : 0) + 1,
            until,
        });
    }
    decide(runner, profileActive, publishingEnabled, now = new Date()) {
        const mode = runner?.mode ?? client_1.RunnerMode.OFF;
        const window = runner
            ? (0, window_1.formatWindow)(runner)
            : (0, window_1.formatWindow)({ windowStart: null, windowEnd: null, days: null });
        const stop = (reason) => ({
            run: false,
            reason,
            mode,
            pollAfterSeconds: POLL_IDLE,
            settings: runner?.settings ?? null,
            window,
        });
        if (!publishingEnabled)
            return stop('automatisation coupée globalement');
        if (!profileActive)
            return stop('profil inactif');
        if (!runner)
            return stop('profil jamais piloté (à l’arrêt)');
        if (runner.pausedUntil && runner.pausedUntil.getTime() > now.getTime()) {
            return stop(`en pause jusqu’au ${pauseEnd(runner.pausedUntil, runner.timezone)} — Facebook a limité ses publications`);
        }
        if (mode === client_1.RunnerMode.OFF)
            return stop('arrêté depuis l’admin');
        if (runner.restUntil && runner.restUntil.getTime() > now.getTime()) {
            return stop(`⏳ repos jusqu’au ${pauseEnd(runner.restUntil, runner.timezone)} — nombre de posts du cycle atteint`);
        }
        const go = (reason) => ({
            run: true,
            reason,
            mode,
            pollAfterSeconds: POLL_RUNNING,
            settings: runner.settings ?? null,
            window,
        });
        if (mode === client_1.RunnerMode.ON)
            return go('marche forcée depuis l’admin');
        const clock = (0, window_1.localClock)(now, runner.timezone);
        const inside = (0, window_1.insideWindow)(clock, runner);
        const note = clock.fallback
            ? `${inside.reason} (fuseau « ${runner.timezone} » inconnu, heure UTC)`
            : inside.reason;
        return inside.inside ? go(note) : stop(note);
    }
    async control(profileExternalId, acting = null) {
        const { profile, settings } = await this.context(profileExternalId, acting, true);
        return this.answer(this.decide(profile.runner, profile.status === 'ACTIVE', settings.publishingEnabled));
    }
    async heartbeat(profileExternalId, dto, acting = null, providedKey) {
        const { profile, settings } = await this.context(profileExternalId, acting, true);
        const reported = {
            lastSeenAt: new Date(),
            ...(providedKey ? { pairedKeyHash: (0, pairing_1.keyHash)(providedKey) } : {}),
            keyRejectedAt: null,
            keyRejectReason: null,
            running: dto.running ?? false,
            phase: dto.phase ?? null,
            message: dto.message?.slice(0, 1000) ?? null,
            published: dto.published ?? 0,
            failed: dto.failed ?? 0,
            links: dto.links ?? 0,
            agent: dto.agent?.slice(0, 200) ?? null,
            sleepUntil: sleepUntilOf(dto.sleepUntil),
        };
        const sameFacebook = dto.facebookUserId === profile.facebookUserId &&
            (!dto.facebookName?.trim() || dto.facebookName.trim().slice(0, 200) === profile.facebookName) &&
            profile.facebookSeenAt &&
            Date.now() - profile.facebookSeenAt.getTime() < 10 * 60_000;
        if (dto.facebookUserId && !sameFacebook)
            await this.noteFacebookIdentity(profile.id, dto.facebookUserId, dto.facebookName);
        const runner = await this.prisma.profileRunner.upsert({
            where: { profileId: profile.id },
            create: { profileId: profile.id, ...reported },
            update: reported,
        });
        return {
            ...this.answer(withSuspension(this.decide(runner, profile.status === 'ACTIVE', settings.publishingEnabled), profile.facebookSuspension)),
            facebookSuspension: profile.facebookSuspension ?? null,
            sleepUntil: runner.sleepUntil?.toISOString() ?? null,
        };
    }
    async noteFacebookIdentity(profileId, facebookUserId, facebookName) {
        const holder = await this.prisma.profile.findUnique({
            where: { facebookUserId },
            select: { id: true, name: true },
        });
        if (holder && holder.id !== profileId) {
            await this.prisma.activityLog.create({
                data: {
                    profileId,
                    eventType: 'PROFILE_FACEBOOK_CONFLICT',
                    level: 'WARN',
                    message: `Ce navigateur est connecté au compte Facebook ${facebookUserId}, déjà celui du profil « ${holder.name} »`,
                    metadata: { facebookUserId, holder: holder.id },
                },
            });
            return;
        }
        const current = await this.prisma.profile.findUnique({
            where: { id: profileId },
            select: { facebookUserId: true, facebookName: true },
        });
        const name = facebookName?.trim().slice(0, 200) || current?.facebookName || null;
        await this.prisma.profile.update({
            where: { id: profileId },
            data: { facebookUserId, facebookName: name, facebookSeenAt: new Date() },
        });
        if (current?.facebookUserId && current.facebookUserId !== facebookUserId) {
            await this.prisma.$transaction([
                this.prisma.profileGroup.updateMany({
                    where: { profileId },
                    data: { preApprovedAt: null, memberApprovedAt: null, memberAttempts: 0, memberClaimedUntil: null },
                }),
                this.prisma.activityLog.create({
                    data: {
                        profileId,
                        eventType: 'PROFILE_FACEBOOK_CHANGED',
                        level: 'WARN',
                        message: `Compte Facebook changé : ${current.facebookUserId} → ${facebookUserId}`,
                    },
                }),
            ]);
        }
    }
    async noteAgent(acting, info, now = new Date()) {
        const ownerKey = acting?.id ?? 'global';
        const host = String(info.host).slice(0, 80);
        await this.prisma.agentHeartbeat
            .upsert({
            where: { ownerKey_host: { ownerKey, host } },
            create: { ownerKey, ownerId: acting?.id ?? null, host, version: info.version?.slice(0, 20) ?? null, os: info.os?.slice(0, 20) ?? null, runningBrowsers: info.running, lastSeenAt: now },
            update: { version: info.version?.slice(0, 20) ?? null, os: info.os?.slice(0, 20) ?? null, runningBrowsers: info.running, lastSeenAt: now },
        })
            .catch(() => undefined);
    }
    async agents(acting, now) {
        const scope = (0, scope_1.scopeOf)(acting);
        const rows = await Promise.resolve(this.prisma.agentHeartbeat?.findMany({
            where: { lastSeenAt: { gte: new Date(now.getTime() - 7 * 86_400_000) }, ...(scope ? { ownerId: scope.ownerId } : {}) },
            orderBy: { lastSeenAt: 'desc' },
        })).catch(() => null);
        if (!rows)
            return [];
        const owners = await this.prisma.user.findMany({ where: { id: { in: rows.map((r) => r.ownerId).filter((x) => Boolean(x)) } }, select: { id: true, username: true } });
        const name = new Map(owners.map((o) => [o.id, o.username]));
        return rows.map((r) => ({
            host: r.host,
            owner: r.ownerId ? name.get(r.ownerId) ?? null : 'clé globale',
            version: r.version,
            os: r.os,
            runningBrowsers: r.runningBrowsers,
            lastSeenAt: r.lastSeenAt,
            alive: now.getTime() - r.lastSeenAt.getTime() < 6 * 60_000,
        }));
    }
    async launcherPlan(acting = null, now = new Date()) {
        const settings = await this.globalSettings();
        const profiles = await this.prisma.profile.findMany({
            where: { externalId: { not: null }, ...(0, scope_2.profileWhere)((0, scope_1.scopeOf)(acting)) },
            select: {
                id: true,
                name: true,
                externalId: true,
                status: true,
                facebookSuspension: true,
                ownerId: true,
                nstGroupId: true,
                nstGroupName: true,
                teamNstGroupId: true,
                teamNstGroupName: true,
                runner: true,
                owner: { select: { nstApiKey: true, status: true } },
            },
            orderBy: { createdAt: 'asc' },
        });
        const plan = await this.dayPlan(now);
        const stateNames = stateGroupNames(settings);
        const profilesOut = profiles
            .filter((profile) => Boolean(profile.externalId))
            .map((profile) => {
            const decision = this.decide(profile.runner, profile.status === 'ACTIVE' && !profile.facebookSuspension, settings.publishingEnabled, now);
            const busy = this.atWork(profile.runner, now);
            const asleep = sleeping(profile.runner, now);
            const rest = decision.run ? this.restOf(plan, profile) : null;
            const run = decision.run && !asleep && !rest;
            return {
                externalId: profile.externalId,
                name: profile.name,
                shouldRun: run,
                reason: rest ? `😴 ${rest}` : asleep ? `en veille jusqu'à ${clock(profile.runner.sleepUntil, profile.runner.timezone)}` : decision.reason,
                resting: Boolean(rest),
                moveTo: wantedNstGroup(profile, profile.runner?.pausedUntil ?? null, stateNames, now),
                sleepUntil: asleep ? profile.runner.sleepUntil : null,
                mayClose: !run && !busy && profile.facebookSuspension !== 'logged_out',
                forceClose: !run &&
                    !busy &&
                    (profile.status !== 'ACTIVE' ||
                        profile.facebookSuspension === 'disabled' ||
                        profile.facebookSuspension === 'checkpoint' ||
                        Boolean(profile.runner?.pausedUntil && profile.runner.pausedUntil.getTime() > now.getTime())),
                workerRunning: profile.runner?.running ?? false,
                workerSeenAt: profile.runner?.lastSeenAt ?? null,
                browserState: profile.runner?.browserState ?? client_1.BrowserState.STOPPED,
                nstApiKey: profile.owner?.status === 'ACTIVE'
                    ? (profile.owner.nstApiKey ?? null)
                    : null,
            };
        });
        return {
            nstApiKey: acting ? await this.nstKeyOf(acting.id) : null,
            pollAfterSeconds: profilesOut.some((p) => p.shouldRun)
                ? POLL_RUNNING
                : POLL_IDLE,
            serverTime: now.toISOString(),
            profiles: profilesOut,
        };
    }
    async syncProfiles(rows, acting = null) {
        const wanted = new Map();
        const groupOf = new Map();
        for (const row of rows) {
            const externalId = row.externalId.trim();
            if (externalId && !wanted.has(externalId)) {
                wanted.set(externalId, row.name.trim() || externalId);
                if (row.groupId?.trim())
                    groupOf.set(externalId, { id: row.groupId.trim(), name: (row.groupName ?? '').trim() || row.groupId.trim() });
            }
        }
        if (!wanted.size)
            return { created: [], existing: 0, received: 0 };
        const known = await this.prisma.profile.findMany({
            where: { externalId: { in: [...wanted.keys()] } },
            select: { id: true, externalId: true, name: true, ownerId: true, nstGroupId: true, nstGroupName: true, teamNstGroupId: true },
        });
        const seen = new Set(known.map((p) => p.externalId));
        const scope = (0, scope_1.scopeOf)(acting);
        const renamed = [];
        for (const p of known) {
            const to = wanted.get(p.externalId);
            if (!to || to === p.externalId || to === p.name)
                continue;
            if (scope && p.ownerId !== scope.ownerId)
                continue;
            await this.prisma.profile.update({ where: { id: p.id }, data: { name: to.slice(0, 200) } });
            renamed.push({ externalId: p.externalId, from: p.name, to });
        }
        const stateNames = groupOf.size ? new Set(Object.values(stateGroupNames(await this.globalSettings())).filter(Boolean)) : new Set();
        for (const p of known) {
            const g = groupOf.get(p.externalId);
            if (!g || (scope && p.ownerId !== scope.ownerId))
                continue;
            const isState = stateNames.has(g.name);
            if (p.nstGroupId === g.id && p.nstGroupName === g.name && (isState || p.teamNstGroupId === g.id))
                continue;
            await this.prisma.profile.update({
                where: { id: p.id },
                data: { nstGroupId: g.id, nstGroupName: g.name, ...(isState ? {} : { teamNstGroupId: g.id, teamNstGroupName: g.name }) },
            });
        }
        if (renamed.length) {
            await this.prisma.activityLog
                .create({
                data: {
                    eventType: 'PROFILES_RENAMED',
                    message: `${renamed.length} profil(s) renommé(s) depuis NSTBrowser : ${renamed.map((r) => `« ${r.from} » → « ${r.to} »`).join(', ')}`,
                    metadata: { renamed, by: acting?.username ?? 'clé globale' },
                },
            })
                .catch(() => undefined);
        }
        const missing = [...wanted].filter(([externalId]) => !seen.has(externalId));
        if (missing.length) {
            await this.prisma.activityLog
                .create({
                data: {
                    eventType: 'PROFILES_SYNCED',
                    message: `${missing.length} profil(s) NSTBrowser ajouté(s) : ${missing
                        .map(([, name]) => name)
                        .join(', ')}`,
                    metadata: {
                        created: missing.map(([externalId, name]) => ({ externalId, name })),
                        by: acting?.username ?? 'clé globale',
                    },
                },
            })
                .catch(() => undefined);
            await this.prisma.profile.createMany({
                data: missing.map(([externalId, name]) => {
                    const g = groupOf.get(externalId);
                    const team = g && !stateNames.has(g.name) ? { teamNstGroupId: g.id, teamNstGroupName: g.name } : {};
                    return { externalId, name, ownerId: acting?.id ?? null, ...(g ? { nstGroupId: g.id, nstGroupName: g.name, ...team } : {}) };
                }),
                skipDuplicates: true,
            });
        }
        return {
            created: missing.map(([externalId, name]) => ({ externalId, name })),
            renamed,
            existing: seen.size,
            received: wanted.size,
        };
    }
    async reportBrowser(profileExternalId, dto, acting = null) {
        const { profile, settings } = await this.context(profileExternalId, acting);
        const reported = {
            browserState: dto.state,
            browserSeenAt: new Date(),
            browserMessage: dto.message?.slice(0, 1000) ?? null,
        };
        const runner = await this.prisma.profileRunner.upsert({
            where: { profileId: profile.id },
            create: { profileId: profile.id, ...reported },
            update: reported,
        });
        return this.answer(withSuspension(this.decide(runner, profile.status === 'ACTIVE', settings.publishingEnabled), profile.facebookSuspension));
    }
    async list(acting = null, now = new Date()) {
        const settings = await this.globalSettings();
        const profiles = await this.prisma.profile.findMany({
            where: (0, scope_2.profileWhere)((0, scope_1.scopeOf)(acting)),
            select: {
                id: true,
                name: true,
                externalId: true,
                status: true,
                isModerator: true,
                facebookUserId: true,
                facebookName: true,
                facebookSuspension: true,
                suspendedAt: true,
                suspensionDetail: true,
                ownerId: true,
                nstGroupId: true,
                nstGroupName: true,
                teamNstGroupId: true,
                teamNstGroupName: true,
                runner: true,
                owner: { select: { id: true, username: true, automationKey: true, status: true } },
                profileGroups: { where: { status: 'ACTIVE', joinStatus: 'JOINED' }, select: { groupId: true } },
            },
            orderBy: { createdAt: 'asc' },
        });
        const currentKeys = this.currentKeyHashes(profiles);
        const plan = await this.dayPlan(now);
        return {
            agents: await this.agents(acting, now),
            publishingEnabled: settings.publishingEnabled,
            serverTime: now.toISOString(),
            profiles: profiles.map((profile) => {
                const decision = this.decide(profile.runner, profile.status === 'ACTIVE' && !profile.facebookSuspension, settings.publishingEnabled, now);
                const runner = profile.runner;
                const rest = decision.run ? this.restOf(plan, profile) : null;
                return {
                    profileId: profile.id,
                    team: profile.teamNstGroupId ? { id: profile.teamNstGroupId, name: profile.teamNstGroupName ?? profile.teamNstGroupId } : null,
                    nstGroupName: profile.nstGroupName ?? null,
                    resting: Boolean(rest),
                    restReason: rest,
                    name: profile.name,
                    externalId: profile.externalId,
                    status: profile.status,
                    isModerator: profile.isModerator,
                    facebookUserId: profile.facebookUserId,
                    facebookName: profile.facebookName,
                    facebookSuspension: profile.facebookSuspension,
                    owner: profile.owner ? { id: profile.owner.id, username: profile.owner.username } : null,
                    groupIds: (profile.profileGroups ?? []).map((g) => g.groupId),
                    suspendedAt: profile.suspendedAt,
                    suspensionDetail: profile.suspensionDetail,
                    mode: decision.mode,
                    shouldRun: decision.run && !rest,
                    reason: rest ? `😴 ${rest}` : decision.reason,
                    window: decision.window,
                    timezone: runner?.timezone ?? 'Europe/Paris',
                    windowStart: runner?.windowStart ?? null,
                    windowEnd: runner?.windowEnd ?? null,
                    days: runner?.days ?? null,
                    settings: runner?.settings ?? null,
                    atWork: this.atWork(runner, now),
                    running: runner?.running ?? false,
                    phase: runner?.phase ?? null,
                    message: runner?.message ?? null,
                    published: runner?.published ?? 0,
                    failed: runner?.failed ?? 0,
                    links: runner?.links ?? 0,
                    agent: runner?.agent ?? null,
                    lastSeenAt: runner?.lastSeenAt ?? null,
                    sleepUntil: sleeping(runner, now) ? runner.sleepUntil : null,
                    pausedUntil: runner?.pausedUntil && runner.pausedUntil > now ? runner.pausedUntil : null,
                    dailyQuota: runner?.dailyQuota ?? null,
                    pauseReason: runner?.pausedUntil && runner.pausedUntil > now ? runner.pauseReason : null,
                    restUntil: runner?.restUntil && runner.restUntil > now ? runner.restUntil : null,
                    cycleMaxPosts: runner?.cycleMaxPosts ?? null,
                    cyclePauseHours: runner?.cyclePauseHours ?? null,
                    browserState: runner?.browserState ?? client_1.BrowserState.STOPPED,
                    browserSeenAt: runner?.browserSeenAt ?? null,
                    browserMessage: runner?.browserMessage ?? null,
                    pairedAt: runner?.pairedAt ?? null,
                    pairing: (0, pairing_1.pairingHealth)(runner ?? null, profile, currentKeys.get(profile.id) ?? null, now),
                    pairCodePending: Boolean(runner?.pairCode) &&
                        (runner?.pairCodeExpiresAt?.getTime() ?? 0) > now.getTime(),
                };
            }),
        };
    }
    async update(profileId, dto, acting = null) {
        const profile = await this.prisma.profile.findFirst({
            where: { id: profileId, ...(0, scope_2.profileWhere)((0, scope_1.scopeOf)(acting)) },
            select: { id: true, status: true, isModerator: true },
        });
        if (!profile)
            throw new common_1.NotFoundException('Profil introuvable');
        (0, moderator_guard_1.assertMayManage)(profile, acting);
        const patch = {
            ...(dto.mode !== undefined ? { mode: dto.mode } : {}),
            ...(dto.windowStart !== undefined
                ? { windowStart: dto.windowStart }
                : {}),
            ...(dto.windowEnd !== undefined ? { windowEnd: dto.windowEnd } : {}),
            ...(dto.days !== undefined ? { days: dto.days || null } : {}),
            ...(dto.timezone !== undefined ? { timezone: dto.timezone } : {}),
            ...(dto.dailyQuota !== undefined ? { dailyQuota: dto.dailyQuota } : {}),
            ...(dto.cycleMaxPosts !== undefined ? { cycleMaxPosts: dto.cycleMaxPosts } : {}),
            ...(dto.cyclePauseHours !== undefined ? { cyclePauseHours: dto.cyclePauseHours } : {}),
            ...(dto.settings !== undefined
                ? { settings: (dto.settings ?? null) }
                : {}),
        };
        const runner = await this.prisma.profileRunner.upsert({
            where: { profileId: profile.id },
            create: { profileId: profile.id, ...patch },
            update: patch,
        });
        const settings = await this.globalSettings();
        return {
            ...this.answer(this.decide(runner, profile.status === 'ACTIVE', settings.publishingEnabled)),
            profileId: profile.id,
        };
    }
    async resume(profileId, acting) {
        const profile = await this.prisma.profile.findFirst({
            where: { id: profileId, ...(0, scope_2.profileWhere)((0, scope_1.scopeOf)(acting)) },
            select: { id: true, name: true, isModerator: true, status: true },
        });
        if (!profile)
            throw new common_1.NotFoundException('Profil introuvable');
        (0, moderator_guard_1.assertMayManage)(profile, acting);
        await this.prisma.profileRunner.updateMany({ where: { profileId }, data: { pausedUntil: null, pauseReason: null, restUntil: null, cycleStartedAt: new Date() } });
        await this.prisma.activityLog.create({
            data: {
                profileId,
                eventType: 'PROFILE_PAUSE_LIFTED',
                level: 'INFO',
                message: `Pause de « ${profile.name} » levée par ${acting?.username ?? 'un administrateur'}`,
            },
        });
        return { profileId, resumed: true };
    }
    async updateAll(dto, acting = null) {
        const profiles = await this.prisma.profile.findMany({
            where: { status: 'ACTIVE', ...((0, moderator_guard_1.isAdmin)(acting) ? {} : { isModerator: false }), ...(0, scope_2.profileWhere)((0, scope_1.scopeOf)(acting)) },
            select: { id: true },
        });
        for (const profile of profiles)
            await this.update(profile.id, dto, acting);
        return { updated: profiles.length };
    }
    async nstKeyOf(userId) {
        const user = await this.prisma.user.findUnique({
            where: { id: userId },
            select: { nstApiKey: true },
        });
        return user?.nstApiKey ?? null;
    }
    atWork(runner, now) {
        if (!runner?.running || !runner.lastSeenAt)
            return false;
        if (sleeping(runner, now))
            return true;
        return now.getTime() - runner.lastSeenAt.getTime() < STALE_SECONDS * 1000;
    }
    answer(decision) {
        return { ...decision, serverTime: new Date().toISOString() };
    }
    globalSettings() {
        return this.prisma.automationSetting.upsert({
            where: { id: 'global' },
            create: { id: 'global' },
            update: {},
        });
    }
    async context(profileExternalId, acting, fromBrowser = false) {
        const profile = await this.prisma.profile.findFirst({
            where: {
                externalId: profileExternalId,
                ...(0, scope_2.profileWhere)((0, scope_1.scopeOf)(acting)),
            },
            select: { id: true, status: true, runner: true, facebookSuspension: true, facebookUserId: true, facebookName: true, facebookSeenAt: true },
        });
        if (!profile) {
            if (fromBrowser) {
                await this.noteRejectedKey(profileExternalId, `clé du compte « ${acting?.username ?? 'global'} », qui ne voit pas ce profil`);
            }
            throw new common_1.NotFoundException('Profil introuvable');
        }
        return { profile, settings: await this.globalSettings() };
    }
    async noteRejectedKey(profileExternalId, reason) {
        try {
            await this.prisma.profileRunner.updateMany({
                where: { profile: { externalId: profileExternalId } },
                data: {
                    keyRejectedAt: new Date(),
                    keyRejectReason: reason.slice(0, 300),
                },
            });
        }
        catch {
        }
    }
    currentKeyHashes(profiles) {
        const global = this.config.get('AUTOMATION_API_KEY') || '';
        return new Map(profiles.map((profile) => {
            const key = profile.owner?.status === 'ACTIVE'
                ? profile.owner.automationKey
                : global;
            return [profile.id, key ? (0, pairing_1.keyHash)(key) : null];
        }));
    }
    async checkPairings(acting = null, now = new Date()) {
        const { profiles } = await this.list(acting, now);
        const paired = profiles.filter((p) => p.pairing.state !== 'never');
        const byState = {};
        for (const p of paired)
            byState[p.pairing.state] = (byState[p.pairing.state] ?? 0) + 1;
        const broken = paired.filter((p) => p.pairing.broken);
        const unconfirmed = paired.filter((p) => ['unconfirmed', 'stale'].includes(p.pairing.state));
        if (broken.length || unconfirmed.length) {
            await this.prisma.activityLog
                .create({
                data: {
                    eventType: 'RUNNER_PAIRING_CHECKED',
                    level: broken.length ? 'WARN' : 'INFO',
                    message: `Appairages vérifiés : ${paired.length - broken.length - unconfirmed.length} confirmé(s), ` +
                        `${broken.length} à refaire, ${unconfirmed.length} à confirmer`,
                    metadata: {
                        broken: broken.map((p) => ({ name: p.name, state: p.pairing.state, detail: p.pairing.detail })),
                        unconfirmed: unconfirmed.map((p) => ({ name: p.name, state: p.pairing.state })),
                        by: acting?.username ?? 'clé globale',
                    },
                },
            })
                .catch(() => undefined);
        }
        return {
            checkedAt: now.toISOString(),
            checked: paired.length,
            byState,
            broken: broken.map((p) => ({ profileId: p.profileId, name: p.name, ...p.pairing })),
            unconfirmed: unconfirmed.map((p) => ({ profileId: p.profileId, name: p.name, ...p.pairing })),
        };
    }
};
exports.RunnersService = RunnersService;
exports.RunnersService = RunnersService = __decorate([
    (0, common_1.Injectable)(),
    __param(2, (0, common_1.Optional)()),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        config_1.ConfigService,
        campaigns_service_1.CampaignsService])
], RunnersService);
function stateGroupNames(settings) {
    return {
        limited: settings?.nstGroupLimited?.trim() ?? '',
        checkpoint: settings?.nstGroupCheckpoint?.trim() ?? '',
        disabled: settings?.nstGroupDisabled?.trim() ?? '',
        loggedOut: settings?.nstGroupLoggedOut?.trim() ?? '',
    };
}
function wantedNstGroup(p, pausedUntil, names, now) {
    if (!p.nstGroupName)
        return null;
    const state = p.facebookSuspension === 'disabled'
        ? { name: names.disabled, why: 'compte désactivé par Facebook' }
        : p.facebookSuspension === 'checkpoint'
            ? { name: names.checkpoint, why: 'Facebook demande une vérification' }
            : p.facebookSuspension === 'logged_out'
                ? { name: names.loggedOut, why: 'déconnecté de Facebook' }
                : pausedUntil && pausedUntil.getTime() > now.getTime()
                    ? { name: names.limited, why: 'publications limitées par Facebook' }
                    : null;
    if (state)
        return state.name && p.nstGroupName !== state.name ? { groupId: null, groupName: state.name, why: state.why } : null;
    const inStateGroup = Object.values(names).some((n) => n && n === p.nstGroupName);
    if (inStateGroup && p.teamNstGroupId && p.nstGroupId !== p.teamNstGroupId) {
        return { groupId: p.teamNstGroupId, groupName: p.teamNstGroupName ?? p.teamNstGroupId, why: 'retour dans son équipe' };
    }
    return null;
}
function withSuspension(decision, suspension) {
    if (!suspension)
        return decision;
    const reason = suspension === 'disabled'
        ? 'compte suspendu par Facebook'
        : suspension === 'logged_out'
            ? 'déconnecté de Facebook : à reconnecter dans ce navigateur'
            : 'Facebook demande une vérification du compte';
    return { ...decision, run: false, reason };
}
//# sourceMappingURL=runners.service.js.map