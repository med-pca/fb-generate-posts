import { Injectable, NotFoundException } from '@nestjs/common';
import { BrowserState, Prisma, RunnerMode } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { scopeOf } from '../auth/scope';
import { profileWhere } from '../auth/scope';
import type { CurrentUser } from '../auth/current-user';
import { UpdateRunnerDto } from './dto/update-runner.dto';
import { HeartbeatDto } from './dto/heartbeat.dto';
import { BrowserReportDto } from './dto/browser-report.dto';
import { formatWindow, insideWindow, localClock } from './window';

/** Au-delà de ce délai sans battement, le navigateur n'est plus considéré
 * comme au travail. Trois battements manqués : assez pour absorber une page
 * lente, assez court pour que l'agent local puisse refermer le navigateur. */
const STALE_SECONDS = 180;

/** À quelle fréquence l'extension et l'agent reviennent demander. Court quand
 * ils travaillent (un ordre d'arrêt doit arriver vite), plus long au repos. */
const POLL_RUNNING = 60;
const POLL_IDLE = 120;

export type Decision = {
  run: boolean;
  reason: string;
  mode: RunnerMode;
  pollAfterSeconds: number;
  settings: Prisma.JsonValue | null;
  serverTime: string;
  window: string;
};

type RunnerRow = {
  mode: RunnerMode;
  windowStart: number | null;
  windowEnd: number | null;
  days: string | null;
  timezone: string;
  settings: Prisma.JsonValue | null;
  running: boolean;
  lastSeenAt: Date | null;
};

/** Le pilotage des profils : l'admin dit ce qu'il veut, le terrain dit où il
 * en est, et ce service tranche.
 *
 * Rien ici n'ouvre un navigateur. L'API de NSTBrowser n'écoute que sur la
 * machine où elle tourne, donc l'ordre voyage dans l'autre sens : l'agent
 * local et l'extension viennent demander « est-ce mon tour ? ».
 */
@Injectable()
export class RunnersService {
  constructor(private readonly prisma: PrismaService) {}

  /** Décider, pour un profil, s'il doit publier maintenant.
   *
   * L'ordre des refus est celui de leur portée : le coupe-circuit global passe
   * avant le profil, qui passe avant sa fenêtre horaire. C'est ce qui rend la
   * raison affichée dans l'admin utile — elle nomme la vraie cause. */
  decide(
    runner: RunnerRow | null,
    profileActive: boolean,
    publishingEnabled: boolean,
    now = new Date(),
  ): Omit<Decision, 'serverTime'> {
    const mode = runner?.mode ?? RunnerMode.OFF;
    const window = runner
      ? formatWindow(runner)
      : formatWindow({ windowStart: null, windowEnd: null, days: null });
    const stop = (reason: string) => ({
      run: false,
      reason,
      mode,
      pollAfterSeconds: POLL_IDLE,
      settings: runner?.settings ?? null,
      window,
    });

    if (!publishingEnabled) return stop('automatisation coupée globalement');
    if (!profileActive) return stop('profil inactif');
    if (!runner) return stop('profil jamais piloté (à l’arrêt)');
    if (mode === RunnerMode.OFF) return stop('arrêté depuis l’admin');

    const go = (reason: string) => ({
      run: true,
      reason,
      mode,
      pollAfterSeconds: POLL_RUNNING,
      settings: runner.settings ?? null,
      window,
    });

    if (mode === RunnerMode.ON) return go('marche forcée depuis l’admin');

    const clock = localClock(now, runner.timezone);
    const inside = insideWindow(clock, runner);
    const note = clock.fallback
      ? `${inside.reason} (fuseau « ${runner.timezone} » inconnu, heure UTC)`
      : inside.reason;
    return inside.inside ? go(note) : stop(note);
  }

  // ── Ce que l'extension demande ────────────────────────────────────────

  async control(profileExternalId: string, acting: CurrentUser | null = null) {
    const { profile, settings } = await this.context(profileExternalId, acting);
    return this.answer(
      this.decide(
        profile.runner,
        profile.status === 'ACTIVE',
        settings.publishingEnabled,
      ),
    );
  }

  /** Le battement de l'extension : il rapporte et reçoit l'ordre en retour.
   *
   * Un seul aller-retour par minute, parce que les deux vont toujours
   * ensemble : un état sans ordre obligerait à un second appel, et un ordre
   * sans état laisserait l'admin aveugle. */
  async heartbeat(
    profileExternalId: string,
    dto: HeartbeatDto,
    acting: CurrentUser | null = null,
  ) {
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
      // Premier contact d'un profil qu'on n'a jamais piloté : il reste à
      // l'arrêt, mais il apparaît dans l'admin, prêt à être allumé.
      create: { profileId: profile.id, ...reported },
      update: reported,
    });
    return this.answer(
      this.decide(
        runner,
        profile.status === 'ACTIVE',
        settings.publishingEnabled,
      ),
    );
  }

  // ── Ce que l'agent local demande ──────────────────────────────────────

  /** Quels navigateurs ouvrir, lesquels refermer.
   *
   * `mayClose` est séparé de `shouldRun` exprès : une extension en train de
   * publier ne doit pas voir son navigateur se fermer sous elle, même quand
   * l'ordre vient de passer à l'arrêt. Le profil se referme au battement
   * suivant, une fois son post fini. */
  async launcherPlan(acting: CurrentUser | null = null, now = new Date()) {
    const settings = await this.globalSettings();
    const profiles = await this.prisma.profile.findMany({
      where: { externalId: { not: null }, ...profileWhere(scopeOf(acting)) },
      select: {
        id: true,
        name: true,
        externalId: true,
        status: true,
        runner: true,
      },
      orderBy: { createdAt: 'asc' },
    });

    // La requête les écarte déjà, mais l'agent local ne peut rien faire d'une
    // ligne sans identifiant NSTBrowser : le filtre est refait ici pour que
    // changer la requête ne puisse pas lui en envoyer une.
    const profilesOut = profiles
      .filter((profile): profile is typeof profile & { externalId: string } =>
        Boolean(profile.externalId),
      )
      .map((profile) => {
        const decision = this.decide(
          profile.runner,
          profile.status === 'ACTIVE',
          settings.publishingEnabled,
          now,
        );
        const busy = this.atWork(profile.runner, now);
        return {
          externalId: profile.externalId,
          name: profile.name,
          shouldRun: decision.run,
          reason: decision.reason,
          mayClose: !decision.run && !busy,
          workerRunning: profile.runner?.running ?? false,
          workerSeenAt: profile.runner?.lastSeenAt ?? null,
          browserState: profile.runner?.browserState ?? BrowserState.STOPPED,
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

  /** L'agent local dit ce qu'il a fait du navigateur. */
  async reportBrowser(
    profileExternalId: string,
    dto: BrowserReportDto,
    acting: CurrentUser | null = null,
  ) {
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
    return this.answer(
      this.decide(
        runner,
        profile.status === 'ACTIVE',
        settings.publishingEnabled,
      ),
    );
  }

  // ── Ce que l'admin voit et règle ──────────────────────────────────────

  async list(acting: CurrentUser | null = null, now = new Date()) {
    const settings = await this.globalSettings();
    const profiles = await this.prisma.profile.findMany({
      where: profileWhere(scopeOf(acting)),
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
        const decision = this.decide(
          profile.runner,
          profile.status === 'ACTIVE',
          settings.publishingEnabled,
          now,
        );
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
          // Le terrain : « vu il y a 20 s, en train de commenter » vaut mieux
          // qu'un booléen, parce qu'un worker mort reste `running: true`.
          atWork: this.atWork(runner, now),
          running: runner?.running ?? false,
          phase: runner?.phase ?? null,
          message: runner?.message ?? null,
          published: runner?.published ?? 0,
          failed: runner?.failed ?? 0,
          links: runner?.links ?? 0,
          agent: runner?.agent ?? null,
          lastSeenAt: runner?.lastSeenAt ?? null,
          browserState: runner?.browserState ?? BrowserState.STOPPED,
          browserSeenAt: runner?.browserSeenAt ?? null,
          browserMessage: runner?.browserMessage ?? null,
        };
      }),
    };
  }

  async update(
    profileId: string,
    dto: UpdateRunnerDto,
    acting: CurrentUser | null = null,
  ) {
    const profile = await this.prisma.profile.findFirst({
      where: { id: profileId, ...profileWhere(scopeOf(acting)) },
      select: { id: true, status: true },
    });
    if (!profile) throw new NotFoundException('Profil introuvable');

    const patch = {
      ...(dto.mode !== undefined ? { mode: dto.mode } : {}),
      ...(dto.windowStart !== undefined
        ? { windowStart: dto.windowStart }
        : {}),
      ...(dto.windowEnd !== undefined ? { windowEnd: dto.windowEnd } : {}),
      ...(dto.days !== undefined ? { days: dto.days || null } : {}),
      ...(dto.timezone !== undefined ? { timezone: dto.timezone } : {}),
      ...(dto.settings !== undefined
        ? { settings: (dto.settings ?? null) as Prisma.InputJsonValue }
        : {}),
    };
    const runner = await this.prisma.profileRunner.upsert({
      where: { profileId: profile.id },
      create: { profileId: profile.id, ...patch },
      update: patch,
    });
    const settings = await this.globalSettings();
    return {
      ...this.answer(
        this.decide(
          runner,
          profile.status === 'ACTIVE',
          settings.publishingEnabled,
        ),
      ),
      profileId: profile.id,
    };
  }

  /** Tout allumer ou tout éteindre d'un coup : ce qu'on cherche quand quelque
   * chose va mal, et qu'ouvrir vingt interrupteurs n'est pas une option. */
  async updateAll(dto: UpdateRunnerDto, acting: CurrentUser | null = null) {
    const profiles = await this.prisma.profile.findMany({
      where: { status: 'ACTIVE', ...profileWhere(scopeOf(acting)) },
      select: { id: true },
    });
    for (const profile of profiles) await this.update(profile.id, dto, acting);
    return { updated: profiles.length };
  }

  // ── internes ──────────────────────────────────────────────────────────

  /** Un worker au travail : il l'a dit, et il l'a dit récemment. */
  private atWork(runner: RunnerRow | null, now: Date) {
    if (!runner?.running || !runner.lastSeenAt) return false;
    return now.getTime() - runner.lastSeenAt.getTime() < STALE_SECONDS * 1000;
  }

  private answer(decision: Omit<Decision, 'serverTime'>): Decision {
    return { ...decision, serverTime: new Date().toISOString() };
  }

  private globalSettings() {
    return this.prisma.automationSetting.upsert({
      where: { id: 'global' },
      create: { id: 'global' },
      update: {},
    });
  }

  /** Le profil désigné par son externalId, borné à ce que l'appelant voit.
   *
   * Sans cette borne, une clé de compte piloterait le profil d'un autre en
   * devinant son identifiant — les routes du pilotage ne prennent que cela. */
  private async context(profileExternalId: string, acting: CurrentUser | null) {
    const profile = await this.prisma.profile.findFirst({
      where: {
        externalId: profileExternalId,
        ...profileWhere(scopeOf(acting)),
      },
      select: { id: true, status: true, runner: true },
    });
    if (!profile) throw new NotFoundException('Profil introuvable');
    return { profile, settings: await this.globalSettings() };
  }
}
