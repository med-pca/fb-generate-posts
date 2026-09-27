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
const client_1 = require("@prisma/client");
const prisma_service_1 = require("../prisma/prisma.service");
const scope_1 = require("../auth/scope");
const scope_2 = require("../auth/scope");
const window_1 = require("./window");
const STALE_SECONDS = 180;
const POLL_RUNNING = 60;
const POLL_IDLE = 120;
let RunnersService = class RunnersService {
    prisma;
    constructor(prisma) {
        this.prisma = prisma;
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
        const { profile, settings } = await this.context(profileExternalId, acting);
        return this.answer(this.decide(profile.runner, profile.status === 'ACTIVE', settings.publishingEnabled));
    }
    async heartbeat(profileExternalId, dto, acting = null) {
        const { profile, settings } = await this.context(profileExternalId, acting);
        const reported = {
            lastSeenAt: new Date(),
            running: dto.running ?? false,
            phase: dto.phase ?? null,
            message: dto.message?.slice(0, 1000) ?? null,
            published: dto.published ?? 0,
            failed: dto.failed ?? 0,
            links: dto.links ?? 0,
            agent: dto.agent?.slice(0, 200) ?? null,
        };
        const runner = await this.prisma.profileRunner.upsert({
            where: { profileId: profile.id },
            create: { profileId: profile.id, ...reported },
            update: reported,
        });
        return this.answer(this.decide(runner, profile.status === 'ACTIVE', settings.publishingEnabled));
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
            };
        });
        return {
            pollAfterSeconds: profilesOut.some((p) => p.shouldRun)
                ? POLL_RUNNING
                : POLL_IDLE,
            serverTime: now.toISOString(),
            profiles: profilesOut,
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
                runner: true,
            },
            orderBy: { createdAt: 'asc' },
        });
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
    async context(profileExternalId, acting) {
        const profile = await this.prisma.profile.findFirst({
            where: {
                externalId: profileExternalId,
                ...(0, scope_2.profileWhere)((0, scope_1.scopeOf)(acting)),
            },
            select: { id: true, status: true, runner: true },
        });
        if (!profile)
            throw new common_1.NotFoundException('Profil introuvable');
        return { profile, settings: await this.globalSettings() };
    }
};
exports.RunnersService = RunnersService;
exports.RunnersService = RunnersService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], RunnersService);
//# sourceMappingURL=runners.service.js.map