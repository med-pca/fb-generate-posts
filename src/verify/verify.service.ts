import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, TargetStatus, VerifyStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { CurrentUser } from '../auth/current-user';
import { postWhere, profileWhere, scopeOf } from '../auth/scope';
import { normalizeFacebookUrl, trace } from '../trace/trace';
import { assertMayManage, isAdmin } from '../auth/moderator-guard';
import type { TraceKind } from '../trace/trace';

/** Délai avant de vérifier un post publié : le temps que son commentaire
 * reçoive l'URL. Vérifier trop tôt verrait un « . » et le supprimerait. */
const DEFAULT_VERIFY_AFTER_MINUTES = 30;
/** Une vérification réservée l'est pour ce temps ; au-delà, un autre passage
 * la reprend. */
const CLAIM_MINUTES = 20;
/** En attente de modération : on revient plus tard. */
const PENDING_RETRY_HOURS = 2;
/** Page injoignable (Facebook a coupé, profil déconnecté…) : on réessaie. */
const UNREACHABLE_RETRY_MINUTES = 30;
const MAX_UNREACHABLE = 5;
/** Au-delà, on arrête de republier dans ce groupe : quelque chose cloche. */
const MAX_REPUBLISH = 2;

export const VERIFY_OUTCOMES = [
  'ok', // en ligne, avec le commentaire et l'URL
  'missing_post', // le post n'existe plus (supprimé, refusé, introuvable)
  'missing_link', // le post est là, mais pas le commentaire avec l'URL
  'pending', // en attente de validation par un modérateur du groupe
  'unreachable', // page illisible : déconnecté, mur de connexion, erreur
] as const;
export type VerifyOutcome = (typeof VERIFY_OUTCOMES)[number];

/** La vérification des publications par un profil « vérificateur ».
 *
 * L'extension de publication peut se croire victorieuse à tort : permission
 * refusée, profil déconnecté, commentaire jamais posé… Un autre compte, qui
 * n'a rien publié, rouvre chaque post et dit ce qu'il voit :
 *
 *   - en ligne avec son URL      → vérifié ;
 *   - introuvable                → remis dans la file, il sera republié ;
 *   - en ligne SANS URL          → le vérificateur le supprime (il doit être
 *                                  admin du groupe), puis il est republié ;
 *                                  s'il n'a pas pu le supprimer, rien n'est
 *                                  republié (ce serait un doublon) : à traiter ;
 *   - en attente de modération   → on revient plus tard ;
 *   - page injoignable           → on revient plus tard, puis à traiter.
 */
@Injectable()
export class VerifyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  private verifyAfterMinutes() {
    const raw = Number(this.config.get<string>('VERIFY_AFTER_MINUTES'));
    return Number.isFinite(raw) && raw >= 0 ? raw : DEFAULT_VERIFY_AFTER_MINUTES;
  }

  /** Le profil qui vérifie : il doit être désigné « vérificateur », et
   * visible de la clé qui l'appelle. */
  async moderator(profileExternalId: string, acting: CurrentUser | null) {
    const profile = await this.prisma.profile.findFirst({
      where: { externalId: profileExternalId, ...profileWhere(scopeOf(acting)) },
      select: {
        id: true,
        name: true,
        isModerator: true,
        status: true,
        moderatorPaused: true,
        moderatorBatch: true,
        moderatorMembers: true,
      },
    });
    if (!profile) throw new NotFoundException('Profil vérificateur introuvable');
    if (!profile.isModerator || profile.status !== 'ACTIVE') {
      throw new ForbiddenException(
        `« ${profile.name} » n’est pas désigné vérificateur (Pilotage → Vérificateur)`,
      );
    }
    return profile;
  }

  /** Ce qui attend une vérification : publié depuis assez longtemps, avec
   * l'adresse de sa publication, pas encore vérifié (ou republié depuis). */
  private dueWhere(acting: CurrentUser | null, now: Date): Prisma.PostTargetWhereInput {
    return {
      status: TargetStatus.PUBLISHED,
      OR: [{ verifyStatus: null }, { verifyStatus: VerifyStatus.REPUBLISHED }],
      publishedAt: { lte: new Date(now.getTime() - this.verifyAfterMinutes() * 60_000) },
      AND: [
        { OR: [{ verifyClaimedUntil: null }, { verifyClaimedUntil: { lt: now } }] },
        { post: postWhere(scopeOf(acting)) },
      ],
      // Sans adresse Facebook aussi : le vérificateur cherche alors le post
      // dans le groupe, et rapporte l'adresse trouvée.
    };
  }

  /** Réserver un lot de vérifications pour ce vérificateur. */
  async claim(
    profileExternalId: string,
    limit: number,
    acting: CurrentUser | null,
    now = new Date(),
  ) {
    const moderator = await this.moderator(profileExternalId, acting);
    // Suspendu par l'administrateur : rien à faire.
    if (moderator.moderatorPaused) {
      return { tasks: [], paused: true, verifyAfterMinutes: this.verifyAfterMinutes() };
    }
    const due = await this.prisma.postTarget.findMany({
      where: this.dueWhere(acting, now),
      orderBy: { publishedAt: 'asc' },
      take: Math.max(1, Math.min(20, moderator.moderatorBatch || limit || 5)),
      select: {
        id: true,
        publishedAt: true,
        republishCount: true,
        facebookUrl: true,
        post: { select: { id: true, title: true, description: true, url: true } },
        group: { select: { id: true, name: true, url: true, externalId: true } },
        jobItems: {
          where: { status: TargetStatus.PUBLISHED },
          orderBy: { publishedAt: 'desc' },
          take: 1,
          select: {
            externalPostUrl: true,
            job: { select: { profile: { select: { name: true, externalId: true } } } },
          },
        },
      },
    });
    if (!due.length) {
      return { tasks: [], verifyAfterMinutes: this.verifyAfterMinutes() };
    }
    await this.prisma.postTarget.updateMany({
      where: { id: { in: due.map((t) => t.id) } },
      data: { verifyClaimedUntil: new Date(now.getTime() + CLAIM_MINUTES * 60_000) },
    });
    return {
      verifyAfterMinutes: this.verifyAfterMinutes(),
      tasks: due.map((t) => ({
        targetId: t.id,
        // null : publié sans adresse connue, à chercher dans le groupe.
        postUrl: t.facebookUrl ?? t.jobItems[0]?.externalPostUrl ?? null,
        // Ce qui permet de reconnaître le post et son lien sur la page.
        postText: t.post.description,
        postTitle: t.post.title,
        linkUrl: t.post.url,
        author: t.jobItems[0]?.job.profile.name ?? null,
        group: { name: t.group.name, url: t.group.url },
        publishedAt: t.publishedAt,
        republishCount: t.republishCount,
      })),
    };
  }

  /** Le résultat d'une vérification, et ce qu'il entraîne. */
  async report(
    targetId: string,
    input: {
      profileExternalId: string;
      outcome: VerifyOutcome;
      detail?: string;
      deleted?: boolean;
      /** L'adresse du post, quand le vérificateur l'a trouvée dans le groupe. */
      postUrl?: string;
    },
    acting: CurrentUser | null,
    now = new Date(),
  ) {
    if (!VERIFY_OUTCOMES.includes(input.outcome)) {
      throw new BadRequestException('Résultat de vérification inconnu');
    }
    const moderator = await this.moderator(input.profileExternalId, acting);
    const target = await this.target(targetId, acting);
    const detail = String(input.detail || '').slice(0, 1000);
    const by = `vérifié par ${moderator.name}`;
    const who = { actor: moderator.name, profileId: moderator.id };

    // Une adresse retrouvée dans le groupe : on la garde, c'est elle qu'on
    // ouvrira la prochaine fois et qu'on montrera dans la file.
    const found = normalizeFacebookUrl(input.postUrl);
    if (found && found !== target.facebookUrl) {
      await this.prisma.$transaction([
        this.prisma.postTarget.update({ where: { id: target.id }, data: { facebookUrl: found } }),
        trace(this.prisma, { postTargetId: target.id, kind: 'URL_FOUND', facebookUrl: found, ...who }),
        this.prisma.activityLog.create({
          data: {
            postId: target.postId,
            groupId: target.groupId,
            postTargetId: target.id,
            profileId: moderator.id,
            facebookUrl: found,
            eventType: 'VERIFY_URL_FOUND',
            message: `Adresse de « ${target.post.title} » retrouvée dans « ${target.group.name} » : ${found}`,
            metadata: { by },
          },
        }),
      ]);
      target.facebookUrl = found;
    }
    const url = target.facebookUrl;
    // Chaque constat va dans l'historique de la publication ET dans le
    // journal, avec le lien du post et l'URL d'article attendue : de quoi
    // filtrer, ouvrir et décider sans chercher.
    const EVENTS: Partial<Record<TraceKind, { event: string; level: 'INFO' | 'WARN' | 'ERROR'; label: string }>> = {
      VERIFIED_OK: { event: 'VERIFY_OK', level: 'INFO', label: 'vérifié en ligne avec son lien' },
      VERIFY_PENDING: { event: 'VERIFY_PENDING', level: 'INFO', label: 'en attente de validation' },
      VERIFY_UNREACHABLE: { event: 'VERIFY_UNREACHABLE', level: 'WARN', label: 'vérification impossible' },
      VERIFY_MISSING_POST: { event: 'VERIFY_MISSING_POST', level: 'ERROR', label: 'introuvable' },
      VERIFY_MISSING_LINK: { event: 'VERIFY_MISSING_LINK', level: 'ERROR', label: 'en ligne SANS le lien de l’article' },
      DELETED: { event: 'VERIFY_DELETED', level: 'WARN', label: 'supprimé par le vérificateur' },
      DELETE_FAILED: { event: 'VERIFY_DELETE_FAILED', level: 'ERROR', label: 'suppression impossible' },
    };
    const note = (kind: TraceKind, text: string) => {
      const e = EVENTS[kind];
      return this.prisma.$transaction([
        trace(this.prisma, { postTargetId: target.id, kind, facebookUrl: url, detail: text, ...who }),
        ...(e
          ? [
              this.prisma.activityLog.create({
                data: {
                  postId: target.postId,
                  groupId: target.groupId,
                  postTargetId: target.id,
                  profileId: moderator.id,
                  facebookUrl: url,
                  eventType: e.event,
                  level: e.level,
                  message: `« ${target.post.title} » dans « ${target.group.name} » : ${e.label}${text ? ` — ${text}` : ''}`,
                  metadata: { by, expectedLink: target.post.url ?? null },
                },
              }),
            ]
          : []),
      ]);
    };

    switch (input.outcome) {
      case 'ok':
        await note('VERIFIED_OK', detail || 'en ligne, avec son lien');
        await this.prisma.postTarget.update({
          where: { id: target.id },
          data: {
            verifyStatus: VerifyStatus.OK,
            verifiedAt: now,
            verifyDetail: detail || 'en ligne, avec son lien',
            verifyClaimedUntil: null,
          },
        });
        return { targetId, result: 'verified' };

      case 'pending':
        await note('VERIFY_PENDING', detail || 'en attente de modération');
        await this.retryLater(target, now, PENDING_RETRY_HOURS * 60, detail || 'en attente de modération');
        return { targetId, result: 'retry_later' };

      case 'unreachable':
        await note('VERIFY_UNREACHABLE', detail || 'page injoignable');
        if (target.verifyAttempts + 1 >= MAX_UNREACHABLE) {
          await this.needsAction(target, `page injoignable ${MAX_UNREACHABLE} fois : ${detail}`, by);
          return { targetId, result: 'needs_action' };
        }
        await this.retryLater(target, now, UNREACHABLE_RETRY_MINUTES, detail || 'page injoignable');
        return { targetId, result: 'retry_later' };

      case 'missing_post':
        await note('VERIFY_MISSING_POST', detail || 'absent du groupe');
        return this.republish(target, `post introuvable : ${detail || 'absent du groupe'}`, by, now);

      case 'missing_link':
        await note('VERIFY_MISSING_LINK', detail);
        await note(input.deleted ? 'DELETED' : 'DELETE_FAILED', detail);
        if (!input.deleted) {
          // Republier sans avoir supprimé = le même post deux fois dans le
          // groupe. On s'arrête là : à régler à la main.
          await this.needsAction(
            target,
            `en ligne sans son lien, et le vérificateur n’a pas pu le supprimer (est-il administrateur du groupe ?) : ${detail}`,
            by,
          );
          return { targetId, result: 'needs_action' };
        }
        return this.republish(target, `sans son lien, supprimé par le vérificateur : ${detail}`, by, now);
    }
  }

  private async target(targetId: string, acting: CurrentUser | null) {
    const target = await this.prisma.postTarget.findFirst({
      where: { id: targetId, post: postWhere(scopeOf(acting)) },
      select: {
        id: true,
        status: true,
        postId: true,
        groupId: true,
        verifyAttempts: true,
        republishCount: true,
        facebookUrl: true,
        post: { select: { title: true, url: true } },
        group: { select: { name: true } },
      },
    });
    if (!target) throw new NotFoundException('Publication introuvable');
    return target;
  }

  private async retryLater(
    target: { id: string },
    now: Date,
    minutes: number,
    detail: string,
  ) {
    await this.prisma.postTarget.update({
      where: { id: target.id },
      data: {
        verifyClaimedUntil: new Date(now.getTime() + minutes * 60_000),
        verifyAttempts: { increment: 1 },
        verifyDetail: detail,
      },
    });
  }

  private async needsAction(
    target: {
      id: string;
      postId: string;
      groupId: string;
      facebookUrl?: string | null;
      post: { title: string };
      group: { name: string };
    },
    detail: string,
    by: string,
  ) {
    await this.prisma.$transaction([
      this.prisma.postTarget.update({
        where: { id: target.id },
        data: { verifyStatus: VerifyStatus.NEEDS_ACTION, verifyDetail: detail, verifyClaimedUntil: null },
      }),
      trace(this.prisma, { postTargetId: target.id, kind: 'NEEDS_ACTION', detail, actor: by }),
      this.prisma.activityLog.create({
        data: {
          postId: target.postId,
          groupId: target.groupId,
          postTargetId: target.id,
          facebookUrl: target.facebookUrl ?? null,
          eventType: 'VERIFY_NEEDS_ACTION',
          level: 'WARN',
          message: `« ${target.post.title} » dans « ${target.group.name} » : ${detail}`,
          metadata: { by },
        },
      }),
    ]);
  }

  /** Remettre la publication dans la file : elle sera republiée dans ce
   * groupe par le premier profil qui passe. Plafonné. */
  private async republish(
    target: {
      id: string;
      postId: string;
      groupId: string;
      republishCount: number;
      facebookUrl?: string | null;
      post: { title: string };
      group: { name: string };
    },
    detail: string,
    by: string,
    now: Date,
  ) {
    if (target.republishCount >= MAX_REPUBLISH) {
      await this.needsAction(target, `déjà republié ${MAX_REPUBLISH} fois, toujours en défaut — ${detail}`, by);
      return { targetId: target.id, result: 'needs_action' };
    }
    await this.prisma.$transaction([
      this.prisma.postTarget.update({
        where: { id: target.id },
        data: {
          status: TargetStatus.AVAILABLE,
          claimedAt: null,
          claimExpiresAt: null,
          consumedAt: null,
          publishedAt: null,
          commentExternalId: null,
          commentedAt: null,
          linkUpdatedAt: null,
          // L'ancienne adresse reste dans l'historique ; la nouvelle viendra
          // avec la republication.
          facebookUrl: null,
          lastError: detail,
          verifyStatus: VerifyStatus.REPUBLISHED,
          verifiedAt: now,
          verifyDetail: detail,
          verifyClaimedUntil: null,
          republishCount: { increment: 1 },
        },
      }),
      trace(this.prisma, {
        postTargetId: target.id,
        kind: 'REQUEUED',
        facebookUrl: target.facebookUrl,
        detail,
        actor: by,
      }),
      this.prisma.activityLog.create({
        data: {
          postId: target.postId,
          groupId: target.groupId,
          postTargetId: target.id,
          facebookUrl: target.facebookUrl ?? null,
          eventType: 'VERIFY_REPUBLISH',
          level: 'WARN',
          message: `« ${target.post.title} » remis dans la file pour « ${target.group.name} » : ${detail}`,
          metadata: { by, republishCount: target.republishCount + 1 },
        },
      }),
    ]);
    return { targetId: target.id, result: 'requeued' };
  }

  /* ── Gestes de l'admin ─────────────────────────────────────────────── */

  /** Ce qui attend une décision humaine. */
  async review(acting: CurrentUser | null) {
    const rows = await this.prisma.postTarget.findMany({
      where: { verifyStatus: VerifyStatus.NEEDS_ACTION, post: postWhere(scopeOf(acting)) },
      orderBy: { updatedAt: 'desc' },
      take: 50,
      select: {
        id: true,
        verifyDetail: true,
        updatedAt: true,
        republishCount: true,
        facebookUrl: true,
        post: { select: { id: true, title: true, imageUrl: true, description: true, priority: true } },
        group: { select: { id: true, name: true, url: true, category: { select: { id: true, name: true } } } },
        jobItems: {
          where: { externalPostUrl: { not: null } },
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: { externalPostUrl: true },
        },
      },
    });
    return rows.map((r) => ({
      targetId: r.id,
      detail: r.verifyDetail,
      since: r.updatedAt,
      republishCount: r.republishCount,
      post: r.post,
      group: r.group,
      facebookUrl: r.facebookUrl ?? r.jobItems[0]?.externalPostUrl ?? null,
    }));
  }

  /** L'admin a regardé : c'est bon (laisser tel quel), ou à republier. */
  async resolve(targetId: string, action: 'ok' | 'republish', acting: CurrentUser | null, now = new Date()) {
    const target = await this.target(targetId, acting);
    const by = acting?.username ?? 'clé globale';
    if (action === 'ok') {
      await this.prisma.$transaction([
        this.prisma.postTarget.update({
          where: { id: target.id },
          data: { verifyStatus: VerifyStatus.OK, verifiedAt: now, verifyDetail: `validé à la main par ${by}` },
        }),
        trace(this.prisma, { postTargetId: target.id, kind: 'RESOLVED_OK', facebookUrl: target.facebookUrl, actor: by }),
      ]);
      return { targetId, result: 'verified' };
    }
    if (target.status !== TargetStatus.PUBLISHED) {
      throw new ConflictException('Seule une publication publiée se republie');
    }
    // Décision humaine : le plafond ne s'applique pas.
    return this.republish(
      { ...target, republishCount: 0 },
      `republié à la main par ${by}`,
      by,
      now,
    );
  }

  /** Désigner (ou non) un profil vérificateur. */
  async setModerator(
    profileId: string,
    patch: { isModerator?: boolean; facebookUserId?: string },
    acting: CurrentUser | null,
  ) {
    const profile = await this.prisma.profile.findFirst({
      where: { id: profileId, ...profileWhere(scopeOf(acting)) },
      select: { id: true, isModerator: true },
    });
    if (!profile) throw new NotFoundException('Profil introuvable');
    // Désigner ou retirer un modérateur, ou toucher à l'un d'eux : ADMIN.
    if (patch.isModerator !== undefined && !isAdmin(acting)) {
      throw new ForbiddenException('Seul un administrateur de la plateforme désigne les modérateurs');
    }
    assertMayManage(profile, acting);
    const data: Prisma.ProfileUpdateInput = {};
    if (patch.isModerator !== undefined) data.isModerator = patch.isModerator;
    if (patch.facebookUserId !== undefined) {
      const id = patch.facebookUserId || null;
      if (id) {
        const holder = await this.prisma.profile.findUnique({ where: { facebookUserId: id }, select: { id: true, name: true } });
        if (holder && holder.id !== profileId) {
          throw new ConflictException(`Ce compte Facebook est déjà celui du profil « ${holder.name} »`);
        }
      }
      data.facebookUserId = id;
    }
    return this.prisma.profile.update({
      where: { id: profileId },
      data,
      select: { id: true, name: true, isModerator: true, facebookUserId: true },
    });
  }

  /** Le bilan, pour l'admin. */
  async stats(acting: CurrentUser | null, now = new Date()) {
    const post = postWhere(scopeOf(acting));
    const [due, verified, republished, needsAction] = await Promise.all([
      this.prisma.postTarget.count({ where: this.dueWhere(acting, now) }),
      this.prisma.postTarget.count({ where: { verifyStatus: VerifyStatus.OK, post } }),
      this.prisma.postTarget.count({ where: { verifyStatus: VerifyStatus.REPUBLISHED, post } }),
      this.prisma.postTarget.count({ where: { verifyStatus: VerifyStatus.NEEDS_ACTION, post } }),
    ]);
    return { due, verified, republished, needsAction, verifyAfterMinutes: this.verifyAfterMinutes() };
  }
}
