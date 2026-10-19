import { Injectable, NotFoundException } from '@nestjs/common';
import { JobStatus, JoinStatus, Prisma, TargetStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { CurrentUser } from '../auth/current-user';
import { postWhere, profileWhere, scopeOf } from '../auth/scope';
import { trace } from '../trace/trace';
import { claimablePostWhere, profilesForPostWhere, type ClaimPost } from './claimable';

/** Deux profils sauveteurs au plus par post : au-delà, le vérificateur reprend
 * la main (supprimer et republier, comme avant). */
export const MAX_RESCUES = 2;
/** Un sauvetage réservé et jamais rapporté se libère après ce délai. */
const CLAIM_MINUTES = 20;
/** L'auteur a fini son lot depuis au moins ce délai : il ne reviendra plus. */
const AFTER_JOB_MINUTES = 5;
/** Sans sauveteur passé dans ce délai, le vérificateur reprend la main. */
const GIVE_UP_HOURS = 6;
/** Le balayage des posts à sauver : au plus une fois par minute. */
const SWEEP_EVERY_MS = 60_000;

/** 🛟 Le profil sauveteur.
 *
 * Un post est publié, mais son auteur n'a pas réussi à mettre le lien dans le
 * premier commentaire (commentaire introuvable, modification refusée…). Au
 * lieu de laisser le vérificateur le supprimer et le republier, un AUTRE de
 * nos profils, membre du même groupe, ouvre le post et y pose le lien dans SON
 * commentaire (Facebook ne laisse modifier un commentaire qu'à son auteur).
 * Le lien est alors sous le post : le vérificateur le voit, tout est en ordre.
 *
 *   publié sans lien → pending → claimed (un sauveteur) → done
 *                                       ↘ failed → un autre sauveteur (2 au plus)
 *                                                → sinon : le vérificateur reprend */
@Injectable()
export class RescueService {
  constructor(private readonly prisma: PrismaService) {}

  /** Les profils qui peuvent sauver ce post : membres du groupe, actifs,
   * pas suspendus, pas modérateurs, ni l'auteur, ni ceux qui ont essayé —
   * et du compte à qui est le post (chaque compte garde ses publications). */
  private rescuersWhere(groupId: string, exclude: string[], post: ClaimPost): Prisma.ProfileGroupWhereInput {
    return {
      groupId,
      status: 'ACTIVE',
      joinStatus: JoinStatus.JOINED,
      profileId: { notIn: exclude },
      profile: { status: 'ACTIVE', isModerator: false, facebookSuspension: null, ...profilesForPostWhere(post) },
    };
  }

  /** L'auteur du post publié (le profil de son lot). */
  private async authorOf(targetId: string) {
    const item = await this.prisma.publicationJobItem.findFirst({
      where: { postTargetId: targetId, status: TargetStatus.PUBLISHED },
      orderBy: { publishedAt: 'desc' },
      select: { job: { select: { profileId: true, status: true, completedAt: true } } },
    });
    return item?.job ?? null;
  }

  /** Repérer les posts publiés sans leur lien, dont l'auteur a fini son lot,
   * et les mettre « à sauver » s'il existe un autre profil dans le groupe.
   * Appelé quand un sauveteur ou le vérificateur demande du travail. */
  private sweptAt = 0;
  async sweep(now = new Date(), force = false) {
    if (!force && now.getTime() - this.sweptAt < SWEEP_EVERY_MS) return { requested: 0, gaveUp: 0 };
    this.sweptAt = now.getTime();
    // Sans sauveteur depuis trop longtemps : on rend la main au vérificateur.
    const gaveUp = await this.prisma.postTarget.updateMany({
      where: {
        rescueStatus: 'pending',
        rescueRequestedAt: { lt: new Date(now.getTime() - GIVE_UP_HOURS * 3_600_000) },
      },
      data: { rescueStatus: 'failed', rescueDetail: `aucun profil sauveteur passé en ${GIVE_UP_HOURS} h` },
    });
    const candidates = await this.prisma.postTarget.findMany({
      where: {
        status: TargetStatus.PUBLISHED,
        rescueStatus: null,
        linkUpdatedAt: null,
        approvalPendingSince: null,
        facebookUrl: { not: null },
        post: { url: { not: null }, noComment: false },
        jobItems: {
          some: {
            status: TargetStatus.PUBLISHED,
            // Son lot est clos (ou expiré) depuis un moment : l'auteur a fait
            // ses 3 essais, il ne reviendra plus de lui-même.
            job: {
              status: { not: JobStatus.CLAIMED },
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
      if (await this.request(t.id, 'le lien n’a pas été mis dans le premier commentaire par son auteur', now)) requested += 1;
    }
    return { requested, gaveUp: gaveUp.count };
  }

  /** Mettre un post « à sauver », s'il reste un sauveteur possible. */
  async request(targetId: string, reason: string, now = new Date()) {
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
    if (!target || target.rescueStatus === 'done' || target.rescueAttempts >= MAX_RESCUES || !target.facebookUrl) return false;
    const author = await this.authorOf(targetId);
    const exclude = [...target.rescueTriedBy, ...(author ? [author.profileId] : [])];
    const rescuers = await this.prisma.profileGroup.count({ where: this.rescuersWhere(target.groupId, exclude, target.post) });
    if (!rescuers) {
      // Personne pour le sauver : noté, le vérificateur fera comme avant.
      await this.prisma.postTarget.update({ where: { id: targetId }, data: { rescueStatus: 'failed', rescueDetail: 'aucun autre de nos profils dans ce groupe' } });
      return false;
    }
    await this.prisma.$transaction([
      this.prisma.postTarget.update({
        where: { id: targetId },
        data: { rescueStatus: 'pending', rescueRequestedAt: now, rescueClaimedUntil: null, rescueProfileId: null, rescueDetail: reason },
      }),
      trace(this.prisma, { postTargetId: targetId, kind: 'RESCUE_REQUESTED', actor: 'Plateforme', detail: `${reason} — ${rescuers} profil(s) sauveteur(s) possible(s)` }),
    ]);
    return true;
  }

  /** Les posts à sauver pour CE profil (après son lot, avant d'en prendre un
   * autre) : dans ses groupes, dont il n'est pas l'auteur. Réservés pour lui. */
  async due(profileExternalId: string, acting: CurrentUser | null, limit = 2, now = new Date()) {
    const profile = await this.prisma.profile.findFirst({
      where: { externalId: profileExternalId, status: 'ACTIVE', ...profileWhere(scopeOf(acting)) },
      select: { id: true, ownerId: true, owner: { select: { role: true } }, isModerator: true, facebookSuspension: true },
    });
    if (!profile) throw new NotFoundException(`Profil introuvable pour externalId=${profileExternalId}`);
    if (profile.isModerator || profile.facebookSuspension) return [];
    await this.sweep(now);
    const rows = await this.prisma.postTarget.findMany({
      where: {
        status: TargetStatus.PUBLISHED,
        linkUpdatedAt: null,
        NOT: { rescueTriedBy: { has: profile.id } },
        OR: [{ rescueStatus: 'pending' }, { rescueStatus: 'claimed', rescueClaimedUntil: { lt: now } }],
        group: { profiles: { some: { profileId: profile.id, status: 'ACTIVE', joinStatus: JoinStatus.JOINED } } },
        // Les posts de son compte seulement.
        post: { AND: [postWhere(scopeOf(acting)), claimablePostWhere(profile)] },
        jobItems: { none: { status: TargetStatus.PUBLISHED, job: { profileId: profile.id } } },
      },
      orderBy: { rescueRequestedAt: 'asc' },
      take: limit,
      select: { id: true, facebookUrl: true, post: { select: { id: true, url: true, title: true } }, group: { select: { name: true, url: true } } },
    });
    const claimed: Array<{ targetId: string; postId: string; postUrl: string; url: string; title: string; group: string }> = [];
    for (const r of rows) {
      // Réservé pour lui seul : un autre sauveteur ne le prend pas en même temps.
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

  /** Ce que le sauveteur a fait. `done` : il a posé le lien ; `already` : le
   * lien était déjà sous le post ; `failed` : rien pu faire (au suivant). */
  async report(
    targetId: string,
    profileExternalId: string,
    input: { outcome: 'done' | 'already' | 'failed'; detail?: string; commentExternalId?: string },
    acting: CurrentUser | null,
    now = new Date(),
  ) {
    const profile = await this.prisma.profile.findFirst({
      where: { externalId: profileExternalId, ...profileWhere(scopeOf(acting)) },
      select: { id: true, name: true },
    });
    if (!profile) throw new NotFoundException(`Profil introuvable pour externalId=${profileExternalId}`);
    const target = await this.prisma.postTarget.findFirst({
      where: { id: targetId, rescueProfileId: profile.id, post: postWhere(scopeOf(acting)) },
      select: { id: true, rescueAttempts: true, rescueTriedBy: true, facebookUrl: true, post: { select: { title: true } }, group: { select: { name: true } } },
    });
    if (!target) throw new NotFoundException('Sauvetage introuvable (ou réservé par un autre profil)');
    const detail = input.detail?.slice(0, 500) || '';
    const where = `« ${target.post.title} » dans « ${target.group.name} »`;

    if (input.outcome === 'done' || input.outcome === 'already') {
      const message = input.outcome === 'done' ? `🛟 lien posé par « ${profile.name} » (profil sauveteur)` : `🛟 lien déjà présent sous le post (vu par « ${profile.name} »)`;
      // Le lot de l'auteur : son post n'attend plus de lien (il ne le reposera
      // pas une seconde fois), et le lot se clôt s'il n'attendait que lui.
      const items = await this.prisma.publicationJobItem.findMany({
        where: { postTargetId: targetId, status: TargetStatus.PUBLISHED, linkUpdatedAt: null },
        select: { id: true, jobId: true },
      });
      await this.prisma.publicationJobItem.updateMany({ where: { id: { in: items.map((i) => i.id) } }, data: { linkUpdatedAt: now } });
      for (const jobId of new Set(items.map((i) => i.jobId))) {
        const job = await this.prisma.publicationJob.findUnique({
          where: { id: jobId },
          select: { status: true, items: { select: { status: true, commentedAt: true, linkUpdatedAt: true, post: { select: { url: true } } } } },
        });
        if (!job || job.status !== JobStatus.AWAITING_LINK) continue;
        const waiting = job.items.some((i) => i.status === TargetStatus.PUBLISHED && i.post.url && i.commentedAt && !i.linkUpdatedAt);
        if (waiting) continue;
        const status = job.items.every((i) => i.status === TargetStatus.FAILED)
          ? JobStatus.FAILED
          : job.items.some((i) => i.status === TargetStatus.FAILED)
            ? JobStatus.PARTIALLY_COMPLETED
            : JobStatus.COMPLETED;
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
        trace(this.prisma, { postTargetId: targetId, kind: 'RESCUED', actor: profile.name, profileId: profile.id, facebookUrl: target.facebookUrl, detail: message }),
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
    // Un autre sauveteur ? Sinon le vérificateur reprend la main.
    const again = await this.request(targetId, `nouvel essai après l’échec de « ${profile.name} »`, now);
    if (!again) {
      await trace(this.prisma, { postTargetId: targetId, kind: 'RESCUE_FAILED', actor: profile.name, profileId: profile.id, detail: `sauvetage abandonné après ${attempts} essai(s) : le vérificateur reprend la main` });
    }
    return { targetId, result: again ? 'next_rescuer' : 'gave_up' };
  }
}
