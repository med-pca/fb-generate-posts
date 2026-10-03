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
exports.RunnersService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const node_crypto_1 = require("node:crypto");
const client_1 = require("@prisma/client");
const prisma_service_1 = require("../prisma/prisma.service");
const scope_1 = require("../auth/scope");
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
let RunnersService = class RunnersService {
    prisma;
    config;
    constructor(prisma, config) {
        this.prisma = prisma;
        this.config = config;
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
        if (mode === client_1.RunnerMode.OFF)
            return stop('arrêté depuis l’admin');
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
        };
        if (dto.facebookUserId)
            await this.noteFacebookIdentity(profile.id, dto.facebookUserId, dto.facebookName);
        const runner = await this.prisma.profileRunner.upsert({
            where: { profileId: profile.id },
            create: { profileId: profile.id, ...reported },
            update: reported,
        });
        return this.answer(this.decide(runner, profile.status === 'ACTIVE', settings.publishingEnabled));
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
    async launcherPlan(acting = null, now = new Date()) {
        const settings = await this.globalSettings();
        const profiles = await this.prisma.profile.findMany({
            where: { externalId: { not: null }, ...(0, scope_2.profileWhere)((0, scope_1.scopeOf)(acting)) },
            select: {
                id: true,
                name: true,
                externalId: true,
                status: true,
                runner: true,
                owner: { select: { nstApiKey: true, status: true } },
            },
            orderBy: { createdAt: 'asc' },
        });
        const profilesOut = profiles
            .filter((profile) => Boolean(profile.externalId))
            .map((profile) => {
            const decision = this.decide(profile.runner, profile.status === 'ACTIVE', settings.publishingEnabled, now);
            const busy = this.atWork(profile.runner, now);
            return {
                externalId: profile.externalId,
                name: profile.name,
                shouldRun: decision.run,
                reason: decision.reason,
                mayClose: !decision.run && !busy,
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
        for (const row of rows) {
            const externalId = row.externalId.trim();
            if (externalId && !wanted.has(externalId)) {
                wanted.set(externalId, row.name.trim() || externalId);
            }
        }
        if (!wanted.size)
            return { created: [], existing: 0, received: 0 };
        const known = await this.prisma.profile.findMany({
            where: { externalId: { in: [...wanted.keys()] } },
            select: { externalId: true },
        });
        const seen = new Set(known.map((p) => p.externalId));
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
                data: missing.map(([externalId, name]) => ({
                    externalId,
                    name,
                    ownerId: acting?.id ?? null,
                })),
                skipDuplicates: true,
            });
        }
        return {
            created: missing.map(([externalId, name]) => ({ externalId, name })),
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
        return this.answer(this.decide(runner, profile.status === 'ACTIVE', settings.publishingEnabled));
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
                runner: true,
                owner: { select: { automationKey: true, status: true } },
            },
            orderBy: { createdAt: 'asc' },
        });
        const currentKeys = this.currentKeyHashes(profiles);
        return {
            publishingEnabled: settings.publishingEnabled,
            serverTime: now.toISOString(),
            profiles: profiles.map((profile) => {
                const decision = this.decide(profile.runner, profile.status === 'ACTIVE', settings.publishingEnabled, now);
                const runner = profile.runner;
                return {
                    profileId: profile.id,
                    name: profile.name,
                    externalId: profile.externalId,
                    status: profile.status,
                    isModerator: profile.isModerator,
                    facebookUserId: profile.facebookUserId,
                    facebookName: profile.facebookName,
                    mode: decision.mode,
                    shouldRun: decision.run,
                    reason: decision.reason,
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
            select: { id: true, status: true },
        });
        if (!profile)
            throw new common_1.NotFoundException('Profil introuvable');
        const patch = {
            ...(dto.mode !== undefined ? { mode: dto.mode } : {}),
            ...(dto.windowStart !== undefined
                ? { windowStart: dto.windowStart }
                : {}),
            ...(dto.windowEnd !== undefined ? { windowEnd: dto.windowEnd } : {}),
            ...(dto.days !== undefined ? { days: dto.days || null } : {}),
            ...(dto.timezone !== undefined ? { timezone: dto.timezone } : {}),
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
    async updateAll(dto, acting = null) {
        const profiles = await this.prisma.profile.findMany({
            where: { status: 'ACTIVE', ...(0, scope_2.profileWhere)((0, scope_1.scopeOf)(acting)) },
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
            select: { id: true, status: true, runner: true },
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
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        config_1.ConfigService])
], RunnersService);
//# sourceMappingURL=runners.service.js.map