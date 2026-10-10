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
import { assertMayManage, isAdmin } from '../auth/moderator-guard';
import { profileWhere } from '../auth/scope';
import type { CurrentUser } from '../auth/current-user';
import { UpdateRunnerDto } from './dto/update-runner.dto';
import { HeartbeatDto } from './dto/heartbeat.dto';
import { BrowserReportDto } from './dto/browser-report.dto';
import { NstProfileDto } from './dto/sync-profiles.dto';
import { formatWindow, insideWindow, localClock } from './window';
import { keyHash, pairingHealth } from './pairing';

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
  sleepUntil?: Date | null;
  pausedUntil?: Date | null;
};

/** Une veille ne dure pas plus d'un jour : une heure aberrante (horloge
 * déréglée) ne doit pas laisser un profil fermé indéfiniment. */
const MAX_SLEEP_MS = 24 * 3600 * 1000;
export function sleepUntilOf(raw: string | undefined, now = new Date()): Date | null {
  if (!raw) return null;
  const at = new Date(raw);
  if (Number.isNaN(at.getTime()) || at <= now) return null;
  return at.getTime() - now.getTime() > MAX_SLEEP_MS ? new Date(now.getTime() + MAX_SLEEP_MS) : at;
}
function sleeping(runner: { sleepUntil?: Date | null } | null | undefined, now: Date) {
  return Boolean(runner?.sleepUntil && runner.sleepUntil.getTime() > now.getTime());
}
/** « 11/10 14:05 », à l'heure du profil. */
function pauseEnd(at: Date, timezone: string) {
  try {
    return at.toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: timezone });
  } catch {
    return at.toISOString().slice(0, 16).replace('T', ' ');
  }
}

/** « 14:05 », à l'heure du profil. */
function clock(at: Date, timezone: string) {
  try {
    return at.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: timezone });
  } catch {
    return at.toISOString().slice(11, 16);
  }
}

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
      data: {
        pairCode: null,
        pairCodeExpiresAt: null,
        pairedAt: new Date(),
        // Ce que le navigateur détient désormais : c'est à cela qu'on
        // reconnaîtra plus tard un appairage que des changements ont cassé.
        pairedKeyHash: keyHash(apiKey),
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

  /** L'appairage automatique : un navigateur qui a déjà une clé (extension
   * préconfigurée) et qui a détecté seul son profil NSTBrowser se déclare.
   *
   * Plus de code par profil à copier : on installe la même extension dans
   * tous les profils, et chacun s'appaire au démarrage. Un profil encore
   * absent de la plateforme est créé (comme la synchronisation de l'agent
   * local), au nom du compte de la clé. Un profil d'un autre compte est
   * refusé : la clé ne le voit pas. */
  async autoPair(
    rawExternalId: string,
    rawName: string | undefined,
    acting: CurrentUser | null,
    providedKey?: string,
  ) {
    const externalId = String(rawExternalId || '').trim();
    if (!externalId) throw new BadRequestException('Identifiant de profil NSTBrowser manquant');
    let profile = await this.prisma.profile.findFirst({
      where: { externalId, ...profileWhere(scopeOf(acting)) },
      select: { id: true, name: true, externalId: true, status: true },
    });
    let created = false;
    if (!profile) {
      const elsewhere = await this.prisma.profile.findFirst({
        where: { externalId },
        select: { id: true },
      });
      if (elsewhere) {
        throw new NotFoundException(
          'Ce profil appartient à un autre compte : la clé de cette extension ne le voit pas',
        );
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
      ...(providedKey ? { pairedKeyHash: keyHash(providedKey) } : {}),
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
    // Limité par Facebook : en pause jusqu'à l'échéance, quel que soit le mode.
    if (runner.pausedUntil && runner.pausedUntil.getTime() > now.getTime()) {
      return stop(`en pause jusqu’au ${pauseEnd(runner.pausedUntil, runner.timezone)} — Facebook a limité ses publications`);
    }
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
    const { profile, settings } = await this.context(
      profileExternalId,
      acting,
      true,
    );
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
    providedKey?: string,
  ) {
    const { profile, settings } = await this.context(
      profileExternalId,
      acting,
      true,
    );
    const reported = {
      lastSeenAt: new Date(),
      // Un battement réussi dit quelle clé le navigateur détient vraiment, et
      // efface un refus antérieur : c'est la preuve que l'appairage marche.
      ...(providedKey ? { pairedKeyHash: keyHash(providedKey) } : {}),
      keyRejectedAt: null,
      keyRejectReason: null,
      running: dto.running ?? false,
      phase: dto.phase ?? null,
      message: dto.message?.slice(0, 1000) ?? null,
      published: dto.published ?? 0,
      failed: dto.failed ?? 0,
      links: dto.links ?? 0,
      agent: dto.agent?.slice(0, 200) ?? null,
      // Chaque battement redit s'il dort : un navigateur rouvert (ou une
      // ancienne extension) n'envoie rien, et la veille s'efface.
      sleepUntil: sleepUntilOf(dto.sleepUntil),
    };
    if (dto.facebookUserId) await this.noteFacebookIdentity(profile.id, dto.facebookUserId, dto.facebookName);
    const runner = await this.prisma.profileRunner.upsert({
      where: { profileId: profile.id },
      // Premier contact d'un profil qu'on n'a jamais piloté : il reste à
      // l'arrêt, mais il apparaît dans l'admin, prêt à être allumé.
      create: { profileId: profile.id, ...reported },
      update: reported,
    });
    return {
      ...this.answer(
        this.decide(
          runner,
          profile.status === 'ACTIVE',
          settings.publishingEnabled,
        ),
      ),
      // L'accusé de réception de la veille : l'extension ne ferme son
      // navigateur que si le serveur a bien noté quand le rouvrir.
      sleepUntil: runner.sleepUntil?.toISOString() ?? null,
    };
  }

  /** Le compte Facebook connecté dans ce navigateur. Un même compte ne peut
   * désigner qu'UN profil : si un autre l'a déjà, on ne l'écrase pas (deux
   * navigateurs sur un même compte Facebook est une erreur à corriger, pas à
   * deviner), on le signale. */
  private async noteFacebookIdentity(profileId: string, facebookUserId: string, facebookName?: string) {
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
      // Un autre compte Facebook dans ce navigateur : ses autorisations dans
      // les groupes ne valent plus, le vérificateur repassera.
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
        facebookSuspension: true,
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
        // Suspendu par Facebook : jamais rouvert, quoi que dise son mode.
        const decision = this.decide(
          profile.runner,
          profile.status === 'ACTIVE' && !profile.facebookSuspension,
          settings.publishingEnabled,
          now,
        );
        const busy = this.atWork(profile.runner, now);
        // En veille : l'extension a fermé son navigateur entre deux lots ;
        // l'agent ne le rouvre qu'à l'heure dite.
        const asleep = sleeping(profile.runner, now);
        const run = decision.run && !asleep;
        return {
          externalId: profile.externalId,
          name: profile.name,
          shouldRun: run,
          reason: asleep ? `en veille jusqu'à ${clock(profile.runner!.sleepUntil!, profile.runner!.timezone)}` : decision.reason,
          sleepUntil: asleep ? profile.runner!.sleepUntil : null,
          mayClose: !run && !busy,
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
   * Un profil déjà présent prend le NOM qu'il a dans NSTBrowser (si cette
   * clé a le droit de le gérer) ; il n'est jamais déplacé vers un autre
   * compte (l'externalId est unique sur toute la plateforme), et rien n'est
   * supprimé -- un profil absent de
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
      select: { id: true, externalId: true, name: true, ownerId: true },
    });
    const seen = new Set(known.map((p) => p.externalId));

    // Le nom suit NSTBrowser : renommé là-bas, renommé ici. Seulement les
    // profils que cette clé a le droit de gérer (les siens, ou tous pour un
    // admin / la clé globale), et jamais vers un nom vide ou l'identifiant.
    const scope = scopeOf(acting);
    const renamed: Array<{ externalId: string; from: string; to: string }> = [];
    for (const p of known) {
      const to = wanted.get(p.externalId as string);
      if (!to || to === p.externalId || to === p.name) continue;
      if (scope && p.ownerId !== scope.ownerId) continue;
      await this.prisma.profile.update({ where: { id: p.id }, data: { name: to.slice(0, 200) } });
      renamed.push({ externalId: p.externalId as string, from: p.name, to });
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

    // `skipDuplicates` : deux agents qui synchronisent en même temps ne
    // doivent pas faire échouer l'un des deux sur la contrainte d'unicité.
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
      renamed,
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
        isModerator: true,
        facebookUserId: true,
        facebookName: true,
        facebookSuspension: true,
        suspendedAt: true,
        suspensionDetail: true,
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
        const decision = this.decide(
          profile.runner,
          profile.status === 'ACTIVE' && !profile.facebookSuspension,
          settings.publishingEnabled,
          now,
        );
        const runner = profile.runner;
        return {
          profileId: profile.id,
          name: profile.name,
          externalId: profile.externalId,
          status: profile.status,
          // Le vérificateur contrôle les publications des autres (extension
          // « FB Post Checker »).
          isModerator: profile.isModerator,
          facebookUserId: profile.facebookUserId,
          facebookName: profile.facebookName,
          // Suspendu par Facebook (« disabled ») ou vérification demandée.
          facebookSuspension: profile.facebookSuspension,
          suspendedAt: profile.suspendedAt,
          suspensionDetail: profile.suspensionDetail,
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
          sleepUntil: sleeping(runner, now) ? runner!.sleepUntil : null,
          // En pause après une limitation Facebook (et pourquoi).
          pausedUntil: runner?.pausedUntil && runner.pausedUntil > now ? runner.pausedUntil : null,
          dailyQuota: runner?.dailyQuota ?? null,
          pauseReason: runner?.pausedUntil && runner.pausedUntil > now ? runner.pauseReason : null,
          browserState: runner?.browserState ?? BrowserState.STOPPED,
          browserSeenAt: runner?.browserSeenAt ?? null,
          browserMessage: runner?.browserMessage ?? null,
          // L'appairage : un navigateur jamais appairé ne parlera jamais, quel
          // que soit son mode -- c'est la première chose à voir sur la ligne.
          pairedAt: runner?.pairedAt ?? null,
          // L'état RÉEL de l'appairage — pas seulement « un code a été
          // échangé un jour ».
          pairing: pairingHealth(
            runner ?? null,
            profile,
            currentKeys.get(profile.id) ?? null,
            now,
          ),
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
      select: { id: true, status: true, isModerator: true },
    });
    if (!profile) throw new NotFoundException('Profil introuvable');
    assertMayManage(profile, acting);

    const patch = {
      ...(dto.mode !== undefined ? { mode: dto.mode } : {}),
      ...(dto.windowStart !== undefined
        ? { windowStart: dto.windowStart }
        : {}),
      ...(dto.windowEnd !== undefined ? { windowEnd: dto.windowEnd } : {}),
      ...(dto.days !== undefined ? { days: dto.days || null } : {}),
      ...(dto.timezone !== undefined ? { timezone: dto.timezone } : {}),
      ...(dto.dailyQuota !== undefined ? { dailyQuota: dto.dailyQuota } : {}),
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

  /** Lever la pause d'un profil limité par Facebook, avant l'échéance. */
  async resume(profileId: string, acting: CurrentUser) {
    const profile = await this.prisma.profile.findFirst({
      where: { id: profileId, ...profileWhere(scopeOf(acting)) },
      select: { id: true, name: true, isModerator: true, status: true },
    });
    if (!profile) throw new NotFoundException('Profil introuvable');
    assertMayManage(profile, acting);
    await this.prisma.profileRunner.updateMany({ where: { profileId }, data: { pausedUntil: null, pauseReason: null } });
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

  /** Tout allumer ou tout éteindre d'un coup : ce qu'on cherche quand quelque
   * chose va mal, et qu'ouvrir vingt interrupteurs n'est pas une option. */
  async updateAll(dto: UpdateRunnerDto, acting: CurrentUser | null = null) {
    // « Tout en auto / tout arrêter » ne touche pas aux modérateurs, sauf
    // pour un administrateur.
    const profiles = await this.prisma.profile.findMany({
      where: { status: 'ACTIVE', ...(isAdmin(acting) ? {} : { isModerator: false }), ...profileWhere(scopeOf(acting)) },
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

  /** Un worker au travail : il l'a dit, et il l'a dit récemment. Un
   * navigateur en veille compte comme au travail : il s'est tu exprès. */
  private atWork(runner: RunnerRow | null, now: Date) {
    if (!runner?.running || !runner.lastSeenAt) return false;
    if (sleeping(runner, now)) return true;
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
  private async context(
    profileExternalId: string,
    acting: CurrentUser | null,
    fromBrowser = false,
  ) {
    const profile = await this.prisma.profile.findFirst({
      where: {
        externalId: profileExternalId,
        ...profileWhere(scopeOf(acting)),
      },
      select: { id: true, status: true, runner: true },
    });
    if (!profile) {
      // La clé est valide, mais c'est celle d'un autre compte : le
      // navigateur a été appairé avant un changement de propriétaire.
      if (fromBrowser) {
        await this.noteRejectedKey(
          profileExternalId,
          `clé du compte « ${acting?.username ?? 'global'} », qui ne voit pas ce profil`,
        );
      }
      throw new NotFoundException('Profil introuvable');
    }
    return { profile, settings: await this.globalSettings() };
  }

  /** Un battement refusé : le navigateur parle, mais n'est plus reconnu. Noté
   * sur le profil qu'il prétend être, pour que le Pilotage le montre. */
  async noteRejectedKey(profileExternalId: string, reason: string) {
    try {
      await this.prisma.profileRunner.updateMany({
        where: { profile: { externalId: profileExternalId } },
        data: {
          keyRejectedAt: new Date(),
          keyRejectReason: reason.slice(0, 300),
        },
      });
    } catch {
      // Une trace manquée ne doit pas masquer le refus lui-même.
    }
  }

  /** La clé que détient un navigateur bien appairé, par profil : celle du
   * propriétaire actif, sinon la clé globale — comme à l'appairage. */
  private currentKeyHashes(
    profiles: Array<{
      id: string;
      owner: { automationKey: string; status: string } | null;
    }>,
  ) {
    const global = this.config.get<string>('AUTOMATION_API_KEY') || '';
    return new Map(
      profiles.map((profile) => {
        const key =
          profile.owner?.status === 'ACTIVE'
            ? profile.owner.automationKey
            : global;
        return [profile.id, key ? keyHash(key) : null];
      }),
    );
  }

  /** Vérifier l'état réel de tous les appairages, d'un coup. Rend le compte
   * par état et la liste de ce qui est à refaire ; trace un journal quand
   * quelque chose ne va pas. */
  async checkPairings(acting: CurrentUser | null = null, now = new Date()) {
    const { profiles } = await this.list(acting, now);
    const paired = profiles.filter((p) => p.pairing.state !== 'never');
    const byState: Record<string, number> = {};
    for (const p of paired) byState[p.pairing.state] = (byState[p.pairing.state] ?? 0) + 1;
    const broken = paired.filter((p) => p.pairing.broken);
    const unconfirmed = paired.filter((p) =>
      ['unconfirmed', 'stale'].includes(p.pairing.state),
    );
    if (broken.length || unconfirmed.length) {
      await this.prisma.activityLog
        .create({
          data: {
            eventType: 'RUNNER_PAIRING_CHECKED',
            level: broken.length ? 'WARN' : 'INFO',
            message:
              `Appairages vérifiés : ${paired.length - broken.length - unconfirmed.length} confirmé(s), ` +
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
}
