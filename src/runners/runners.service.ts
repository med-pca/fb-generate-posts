import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomInt } from 'node:crypto';
import { BrowserState, Prisma, RunnerMode } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { scopeOf } from '../auth/scope';
import { profileWhere } from '../auth/scope';
import type { CurrentUser } from '../auth/current-user';
import { UpdateRunnerDto } from './dto/update-runner.dto';
import { HeartbeatDto } from './dto/heartbeat.dto';
import { BrowserReportDto } from './dto/browser-report.dto';
import { NstProfileDto } from './dto/sync-profiles.dto';
import { formatWindow, insideWindow, localClock } from './window';

/** Au-delà de ce délai sans battement, le navigateur n'est plus considéré
 * comme au travail. Trois battements manqués : assez pour absorber une page
 * lente, assez court pour que l'agent local puisse refermer le navigateur. */
const STALE_SECONDS = 180;

/** À quelle fréquence l'extension et l'agent reviennent demander. Court quand
 * ils travaillent (un ordre d'arrêt doit arriver vite), plus long au repos. */
const POLL_RUNNING = 60;
const POLL_IDLE = 120;

/** Le code d'appairage : assez court pour être recopié sans erreur, assez long
 * pour ne pas être devinable une fois les tentatives comptées (32^8). */
const PAIR_CODE_LENGTH = 8;
const PAIR_CODE_TTL_MINUTES = 15;
const PAIR_MAX_ATTEMPTS = 10;
const PAIR_WINDOW_MINUTES = 10;

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
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  /* ── L'appairage d'un navigateur ──────────────────────────────────────
   *
   * Ce qu'un navigateur doit savoir pour travailler : l'adresse de l'API, une
   * clé, et lequel des profils il est. Les trois étaient saisis à la main dans
   * chaque navigateur -- deux recopiés à l'identique partout, le troisième
   * choisi dans une liste, donc trois occasions de se tromper, et une clé de
   * 64 caractères qui traînait dans le presse-papiers.
   *
   * Un code court les remplace : il porte l'identité du profil, donc
   * l'opérateur n'a même plus à le choisir -- il prend le code de la ligne
   * qu'il veut.
   */

  /** Un code lisible : pas de 0/O ni de 1/I, qu'on recopie de travers. */
  private newPairCode() {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    return Array.from({ length: PAIR_CODE_LENGTH }, () =>
      alphabet[randomInt(alphabet.length)],
    ).join('');
  }

  /** Émettre un code pour ce profil. Le précédent est remplacé : deux codes
   * valides pour un même profil, c'est un de trop à révoquer. */
  async createPairCode(profileId: string, acting: CurrentUser | null = null) {
    const profile = await this.prisma.profile.findFirst({
      where: { id: profileId, ...profileWhere(scopeOf(acting)) },
      select: { id: true, name: true, externalId: true },
    });
    if (!profile) throw new NotFoundException('Profil introuvable');
    if (!profile.externalId) {
      // Sans externalId, le navigateur n'aurait pas de quoi se nommer auprès
      // de l'API : l'appairage marcherait et rien ne fonctionnerait ensuite.
      throw new BadRequestException(
        `Le profil « ${profile.name} » n'a pas d'identifiant externe (externalId) : ` +
          'renseigne-le avant de l’appairer.',
      );
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

  /** Échanger le code contre ce qu'il faut pour travailler.
   *
   * Sans clé d'API : le code EST le laissez-passer, ce qui est tout l'intérêt.
   * Il est donc court de vie, à usage unique, et les tentatives sont comptées
   * par adresse -- sinon on le devinerait en le forçant.
   */
  async pair(rawCode: string, apiBaseUrl: string, from = 'inconnu') {
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
      throw new NotFoundException('Code inconnu ou déjà utilisé');
    }
    if (!runner.pairCodeExpiresAt || runner.pairCodeExpiresAt.getTime() < Date.now()) {
      // Périmé : on le retire, pour qu'un code mort ne reste pas à essayer.
      await this.prisma.profileRunner.update({
        where: { profileId: runner.profileId },
        data: { pairCode: null, pairCodeExpiresAt: null },
      });
      this.countPairFailure(from);
      throw new BadRequestException(
        `Code expiré (il vaut ${PAIR_CODE_TTL_MINUTES} minutes). Génère-en un nouveau.`,
      );
    }

    const apiKey = await this.keyFor(runner.profile.ownerId);
    if (!apiKey) {
      throw new BadRequestException(
        'Aucune clé d’automatisation disponible pour ce profil : ' +
          'donne-lui un propriétaire, ou configure AUTOMATION_API_KEY.',
      );
    }

    // À usage unique : le code disparaît avec l'échange.
    await this.prisma.profileRunner.update({
      where: { profileId: runner.profileId },
      data: { pairCode: null, pairCodeExpiresAt: null, pairedAt: new Date() },
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

  /** La clé que ce navigateur utilisera : celle du propriétaire du profil, à
   * défaut la clé globale. Celle du propriétaire est préférable -- elle ne voit
   * que son périmètre, et se révoque sans couper les autres. */
  private async keyFor(ownerId: string | null) {
    if (ownerId) {
      const owner = await this.prisma.user.findFirst({
        where: { id: ownerId, status: 'ACTIVE' },
        select: { automationKey: true },
      });
      if (owner?.automationKey) return owner.automationKey;
    }
    return this.config.get<string>('AUTOMATION_API_KEY') || '';
  }

  /* Le comptage des tentatives. En mémoire : un redémarrage remet les
   * compteurs à zéro, ce qui est acceptable pour un code qui ne vit que
   * quelques minutes, et évite une table pour ça. */
  private readonly pairAttempts = new Map<string, { count: number; until: number }>();

  private guardPairAttempts(from: string) {
    const seen = this.pairAttempts.get(from);
    if (!seen) return;
    if (seen.until < Date.now()) {
      this.pairAttempts.delete(from);
      return;
    }
    if (seen.count >= PAIR_MAX_ATTEMPTS) {
      throw new HttpException(
        'Trop de codes refusés depuis cette adresse. Réessaie dans quelques minutes.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  private countPairFailure(from: string) {
    const seen = this.pairAttempts.get(from);
    const until = Date.now() + PAIR_WINDOW_MINUTES * 60_000;
    this.pairAttempts.set(from, {
      count: (seen && seen.until > Date.now() ? seen.count : 0) + 1,
      until,
    });
  }

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
        owner: { select: { nstApiKey: true, status: true } },
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
          // La clé NSTBrowser du propriétaire : chaque compte ouvre ses
          // profils avec son propre abonnement. Par profil et non une fois
          // pour tout le plan, parce que la clé globale voit les profils de
          // plusieurs comptes. `null` = l'agent garde son `NST_API_KEY`.
          nstApiKey:
            profile.owner?.status === 'ACTIVE'
              ? (profile.owner.nstApiKey ?? null)
              : null,
        };
      });
    return {
      // La clé NSTBrowser du compte de la clé d'API : celle avec laquelle
      // l'agent liste NSTBrowser pour synchroniser les profils de ce compte.
      nstApiKey: acting ? await this.nstKeyOf(acting.id) : null,
      pollAfterSeconds: profilesOut.some((p) => p.shouldRun)
        ? POLL_RUNNING
        : POLL_IDLE,
      serverTime: now.toISOString(),
      profiles: profilesOut,
    };
  }

  /** Les profils de NSTBrowser que la plateforme ne connaît pas encore.
   *
   * Seul l'agent local peut lister NSTBrowser, donc c'est lui qui envoie la
   * liste. Un profil absent est créé au nom du compte de la clé : sa clé
   * NSTBrowser est celle qui l'a listé. Avec la clé globale, il naît sans
   * propriétaire -- visible des seuls ADMIN, qui le réattribuent.
   *
   * On ne fait qu'ajouter : un profil déjà présent n'est ni renommé ni
   * déplacé, même s'il appartient à un autre compte (l'externalId est unique
   * sur toute la plateforme), et rien n'est supprimé -- un profil absent de
   * NSTBrowser peut simplement vivre sur une autre machine. */
  async syncProfiles(
    rows: NstProfileDto[],
    acting: CurrentUser | null = null,
  ) {
    // Une même liste peut répéter un profil : le premier nom l'emporte.
    const wanted = new Map<string, string>();
    for (const row of rows) {
      const externalId = row.externalId.trim();
      if (externalId && !wanted.has(externalId)) {
        wanted.set(externalId, row.name.trim() || externalId);
      }
    }
    if (!wanted.size) return { created: [], existing: 0, received: 0 };

    const known = await this.prisma.profile.findMany({
      where: { externalId: { in: [...wanted.keys()] } },
      select: { externalId: true },
    });
    const seen = new Set(known.map((p) => p.externalId));
    const missing = [...wanted].filter(([externalId]) => !seen.has(externalId));

    // `skipDuplicates` : deux agents qui synchronisent en même temps ne
    // doivent pas faire échouer l'un des deux sur la contrainte d'unicité.
    if (missing.length) {
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
          // L'appairage : un navigateur jamais appairé ne parlera jamais, quel
          // que soit son mode -- c'est la première chose à voir sur la ligne.
          pairedAt: runner?.pairedAt ?? null,
          pairCodePending:
            Boolean(runner?.pairCode) &&
            (runner?.pairCodeExpiresAt?.getTime() ?? 0) > now.getTime(),
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

  private async nstKeyOf(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { nstApiKey: true },
    });
    return user?.nstApiKey ?? null;
  }

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
