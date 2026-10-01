import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, TargetStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { CurrentUser } from '../auth/current-user';
import { postWhere, profileWhere, scopeOf } from '../auth/scope';
import { claimablePostWhere } from '../jobs/jobs.service';
import { PriorityDto, QueueQueryDto } from './dto/queue.dto';

const POST_FIELDS = {
  id: true,
  title: true,
  description: true,
  imageUrl: true,
  priority: true,
  createdAt: true,
  article: { select: { id: true, title: true } },
} as const;

const GROUP_FIELDS = {
  id: true,
  name: true,
  url: true,
  category: { select: { id: true, name: true } },
} as const;

const PROFILE_FIELDS = { id: true, name: true, externalId: true } as const;

/** Les profils qui peuvent publier dans un groupe : ceux qui l'ont rejoint. */
const GROUP_WITH_CANDIDATES = {
  select: {
    ...GROUP_FIELDS,
    profiles: {
      where: { status: 'ACTIVE' as const, joinStatus: 'JOINED' as const },
      select: { profile: { select: PROFILE_FIELDS } },
    },
    // Les demandes d'adhésion en attente : souvent acceptées depuis, sans que
    // rien ne l'ait remonté. C'est ce qui explique un groupe « sans profil ».
    _count: {
      select: {
        profiles: {
          where: {
            status: 'ACTIVE' as const,
            joinStatus: { in: ['REQUESTED' as const, 'QUESTIONS' as const] },
          },
        },
      },
    },
  },
};

const by = (acting: CurrentUser | null) => acting?.username ?? 'clé globale';

/** La file de publication, vue cible par cible (un post × un groupe) : c'est
 * l'unité que les automates consomment — un post qui vise trois groupes
 * part trois fois, chaque fois par un profil qui a rejoint ce groupe.
 *
 *   - en cours   : réservées par un automate, ou en train d'être publiées
 *   - à venir    : dans l'ordre exact où elles seront réservées
 *   - en échec   : avec leur raison, à relancer
 *   - publiées   : quand, dans quel groupe, par quel profil, et le lien
 */
@Injectable()
export class QueueService {
  constructor(private readonly prisma: PrismaService) {}

  async queue(query: QueueQueryDto, acting: CurrentUser | null) {
    const now = new Date();
    const scope = postWhere(scopeOf(acting));
    const group: Prisma.GroupWhereInput = query.categoryId
      ? { categoryId: query.categoryId }
      : {};
    const base: Prisma.PostTargetWhereInput = {
      ...(query.groupId ? { groupId: query.groupId } : {}),
      post: scope,
      group,
    };

    const running: Prisma.PostTargetWhereInput = {
      ...base,
      OR: [
        { status: TargetStatus.CLAIMED, claimExpiresAt: { gt: now } },
        { status: TargetStatus.CONSUMED },
      ],
    };
    // Exactement ce que la réservation prendra : un post disponible, d'un
    // article actif, dans un groupe actif.
    const upcoming: Prisma.PostTargetWhereInput = {
      ...base,
      status: TargetStatus.AVAILABLE,
      group: { ...group, status: 'ACTIVE' },
      post: {
        AND: [
          scope,
          { status: 'AVAILABLE' },
          { OR: [{ articleId: null }, { article: { status: 'ACTIVE' } }] },
        ],
      },
    };
    const published: Prisma.PostTargetWhereInput = {
      ...base,
      status: TargetStatus.PUBLISHED,
    };
    const failed: Prisma.PostTargetWhereInput = {
      ...base,
      status: TargetStatus.FAILED,
    };

    const [runningRows, upcomingRows, failedRows, publishedRows, counts] =
      await Promise.all([
        this.prisma.postTarget.findMany({
          where: running,
          orderBy: { claimedAt: 'asc' },
          take: 50,
          select: {
            id: true,
            status: true,
            claimedAt: true,
            claimExpiresAt: true,
            post: { select: POST_FIELDS },
            group: { select: GROUP_FIELDS },
            jobItems: {
              where: {
                status: { in: [TargetStatus.CLAIMED, TargetStatus.CONSUMED] },
              },
              orderBy: { createdAt: 'desc' },
              take: 1,
              select: {
                job: {
                  select: { id: true, profile: { select: PROFILE_FIELDS } },
                },
              },
            },
          },
        }),
        this.prisma.postTarget.findMany({
          where: upcoming,
          // Un envoi forcé passe devant : son profil le prendra au prochain
          // passage. Puis l'ordre de la réservation : priorité, ancienneté.
          orderBy: [
            { forcedProfileId: { sort: 'asc', nulls: 'last' } },
            { post: { priority: 'desc' } },
            { post: { createdAt: 'asc' } },
            { createdAt: 'asc' },
          ],
          take: query.limit,
          select: {
            id: true,
            forcedAt: true,
            forcedProfile: { select: PROFILE_FIELDS },
            post: { select: POST_FIELDS },
            group: GROUP_WITH_CANDIDATES,
          },
        }),
        this.prisma.postTarget.findMany({
          where: failed,
          orderBy: { updatedAt: 'desc' },
          take: 50,
          select: {
            id: true,
            lastError: true,
            attemptsCount: true,
            updatedAt: true,
            post: { select: POST_FIELDS },
            group: GROUP_WITH_CANDIDATES,
            jobItems: {
              where: { status: TargetStatus.FAILED },
              orderBy: { updatedAt: 'desc' },
              take: 1,
              select: {
                error: true,
                job: { select: { profile: { select: PROFILE_FIELDS } } },
              },
            },
          },
        }),
        this.prisma.postTarget.findMany({
          where: published,
          orderBy: { publishedAt: 'desc' },
          take: query.publishedLimit,
          select: {
            id: true,
            publishedAt: true,
            commentedAt: true,
            linkUpdatedAt: true,
            post: { select: { ...POST_FIELDS, url: true } },
            group: { select: GROUP_FIELDS },
            jobItems: {
              where: { status: TargetStatus.PUBLISHED },
              orderBy: { publishedAt: 'desc' },
              take: 1,
              select: {
                externalPostUrl: true,
                publishedAt: true,
                job: { select: { profile: { select: PROFILE_FIELDS } } },
              },
            },
          },
        }),
        Promise.all([
          this.prisma.postTarget.count({ where: running }),
          this.prisma.postTarget.count({ where: upcoming }),
          this.prisma.postTarget.count({ where: published }),
          this.prisma.postTarget.count({ where: failed }),
        ]),
      ]);

    const withoutCandidates = <
      T extends { profiles: unknown; _count: { profiles: number } },
    >(
      g: T,
    ) => {
      const { profiles, _count, ...rest } = g;
      void profiles;
      return { ...rest, pendingJoins: _count.profiles };
    };

    return {
      counts: {
        running: counts[0],
        upcoming: counts[1],
        published: counts[2],
        failed: counts[3],
      },
      running: runningRows.map((row) => ({
        targetId: row.id,
        state: row.status === TargetStatus.CONSUMED ? 'publishing' : 'claimed',
        since: row.claimedAt,
        expiresAt: row.claimExpiresAt,
        post: row.post,
        group: row.group,
        profile: row.jobItems[0]?.job.profile ?? null,
        jobId: row.jobItems[0]?.job.id ?? null,
      })),
      upcoming: upcomingRows.map((row, index) => ({
        rank: index + 1,
        targetId: row.id,
        post: row.post,
        group: withoutCandidates(row.group),
        candidates: row.group.profiles.map(({ profile }) => profile),
        forcedProfile: row.forcedProfile,
        forcedAt: row.forcedAt,
      })),
      failed: failedRows.map((row) => ({
        targetId: row.id,
        failedAt: row.updatedAt,
        attempts: row.attemptsCount,
        error: row.lastError ?? row.jobItems[0]?.error ?? 'Échec sans message',
        post: row.post,
        group: withoutCandidates(row.group),
        profile: row.jobItems[0]?.job.profile ?? null,
        candidates: row.group.profiles.map(({ profile }) => profile),
      })),
      published: publishedRows.map((row) => {
        const item = row.jobItems[0];
        return {
          targetId: row.id,
          publishedAt: row.publishedAt ?? item?.publishedAt ?? null,
          post: row.post,
          group: row.group,
          profile: item?.job.profile ?? null,
          facebookUrl: item?.externalPostUrl ?? null,
          // Le lien de l'article, posé en commentaire après la publication.
          link: row.linkUpdatedAt
            ? 'placed'
            : row.commentedAt
              ? 'waiting'
              : row.post.url
                ? 'missing'
                : 'none',
        };
      }),
    };
  }

  /** La cible (un post × un groupe), si l'appelant voit son post. */
  private async target(targetId: string, acting: CurrentUser | null) {
    const target = await this.prisma.postTarget.findFirst({
      where: { id: targetId, post: postWhere(scopeOf(acting)) },
      select: {
        id: true,
        status: true,
        claimExpiresAt: true,
        groupId: true,
        postId: true,
        post: { select: { title: true } },
        group: { select: { name: true } },
      },
    });
    if (!target) throw new NotFoundException('Publication introuvable');
    return target;
  }

  /** Faite, ou en train de partir : ni retirable, ni forçable. */
  private locked(target: {
    status: TargetStatus;
    claimExpiresAt: Date | null;
  }) {
    return (
      target.status === TargetStatus.PUBLISHED ||
      target.status === TargetStatus.CONSUMED ||
      (target.status === TargetStatus.CLAIMED &&
        (target.claimExpiresAt?.getTime() ?? 0) > Date.now())
    );
  }

  /** Remettre dans la file une publication qui a échoué : elle repart en
   * attente, sa raison d'échec effacée. Le compteur de tentatives reste,
   * pour repérer ce qui échoue en boucle. */
  async retry(targetId: string, acting: CurrentUser | null) {
    const target = await this.target(targetId, acting);
    if (target.status !== TargetStatus.FAILED) {
      throw new ConflictException('Seule une publication en échec se relance');
    }
    await this.prisma.$transaction([
      this.prisma.postTarget.update({
        where: { id: target.id },
        data: {
          status: TargetStatus.AVAILABLE,
          lastError: null,
          claimedAt: null,
          claimExpiresAt: null,
        },
      }),
      this.prisma.activityLog.create({
        data: {
          postId: target.postId,
          groupId: target.groupId,
          postTargetId: target.id,
          eventType: 'TARGET_RETRIED',
          message: `« ${target.post.title} » relancé dans « ${target.group.name} »`,
          metadata: { by: by(acting) },
        },
      }),
    ]);
    return { targetId: target.id, status: TargetStatus.AVAILABLE };
  }

  /** Un échec qui n'en est pas un : le post est bien en ligne sur Facebook
   * (l'extension ne l'a simplement pas retrouvé dans le fil). L'enregistrer
   * comme publié évite qu'une relance le publie une seconde fois. */
  async markPublished(targetId: string, acting: CurrentUser | null) {
    const target = await this.target(targetId, acting);
    if (target.status !== TargetStatus.FAILED) {
      throw new ConflictException('Seule une publication en échec se marque « déjà en ligne »');
    }
    const now = new Date();
    await this.prisma.$transaction([
      this.prisma.postTarget.update({
        where: { id: target.id },
        data: { status: TargetStatus.PUBLISHED, publishedAt: now, lastError: null },
      }),
      this.prisma.activityLog.create({
        data: {
          postId: target.postId,
          groupId: target.groupId,
          postTargetId: target.id,
          eventType: 'TARGET_MARKED_PUBLISHED',
          message: `« ${target.post.title} » marqué déjà en ligne dans « ${target.group.name} » (sans republier)`,
          metadata: { by: acting?.username ?? 'clé globale' },
        },
      }),
    ]);
    return { targetId: target.id, status: TargetStatus.PUBLISHED };
  }

  /** Retirer un post d'UN groupe. S'il ne vise plus aucun groupe, il
   * disparaît. Une publication faite ou en cours ne se retire pas : c'est
   * l'historique, ou un post en train de partir. */
  async removeTarget(targetId: string, acting: CurrentUser | null) {
    const target = await this.target(targetId, acting);
    if (this.locked(target)) {
      throw new ConflictException(
        'Cette publication est faite ou en cours : elle ne se retire pas',
      );
    }
    const remaining = await this.prisma.postTarget.count({
      where: { postId: target.postId, id: { not: target.id } },
    });
    await this.prisma.$transaction([
      remaining
        ? this.prisma.postTarget.delete({ where: { id: target.id } })
        : this.prisma.post.delete({ where: { id: target.postId } }),
      this.prisma.activityLog.create({
        data: {
          groupId: target.groupId,
          eventType: 'TARGET_REMOVED',
          level: 'WARN',
          message: remaining
            ? `« ${target.post.title} » retiré de « ${target.group.name} »`
            : `« ${target.post.title} » supprimé : il ne visait que « ${target.group.name} »`,
          metadata: { postId: target.postId, by: by(acting) },
        },
      }),
    ]);
    return { removed: true, postDeleted: !remaining };
  }

  /** Faire publier cette cible par un profil précis, au plus tôt : il la
   * prend en premier à son prochain passage, et aucun autre profil ne la
   * prend entre-temps. Une cible en échec est relancée au passage.
   *
   * Le profil doit avoir rejoint le groupe et pouvoir publier ce post (le
   * sien, ou un post ouvert de son compte). `null` rend la cible à la file
   * normale. La réponse prévient si le profil ne passera pas : à l'arrêt
   * dans le Pilotage, il ne viendra pas la chercher. */
  async force(
    targetId: string,
    profileId: string | null,
    acting: CurrentUser | null,
  ) {
    const target = await this.target(targetId, acting);
    if (this.locked(target)) {
      throw new ConflictException(
        'Cette publication est faite ou déjà en cours',
      );
    }
    if (!profileId) {
      await this.prisma.postTarget.update({
        where: { id: target.id },
        data: { forcedProfileId: null, forcedAt: null },
      });
      return { targetId: target.id, forcedProfile: null, warning: null };
    }
    const profile = await this.prisma.profile.findFirst({
      where: {
        id: profileId,
        status: 'ACTIVE',
        ...profileWhere(scopeOf(acting)),
      },
      select: {
        id: true,
        name: true,
        ownerId: true,
        runner: { select: { mode: true } },
        profileGroups: {
          where: {
            groupId: target.groupId,
            status: 'ACTIVE',
            joinStatus: 'JOINED',
          },
          select: { id: true },
        },
      },
    });
    if (!profile) throw new NotFoundException('Profil introuvable ou inactif');
    if (!profile.profileGroups.length) {
      throw new BadRequestException(
        `${profile.name} n'a pas rejoint « ${target.group.name} »`,
      );
    }
    const allowed = await this.prisma.post.count({
      where: { id: target.postId, ...claimablePostWhere(profile) },
    });
    if (!allowed) {
      throw new BadRequestException(
        `${profile.name} ne peut pas publier ce post`,
      );
    }
    await this.prisma.$transaction([
      this.prisma.postTarget.update({
        where: { id: target.id },
        data: {
          forcedProfileId: profile.id,
          forcedAt: new Date(),
          // Une cible en échec est relancée : c'est ce qu'on demande.
          status: TargetStatus.AVAILABLE,
          lastError: null,
          claimedAt: null,
          claimExpiresAt: null,
        },
      }),
      this.prisma.activityLog.create({
        data: {
          profileId: profile.id,
          groupId: target.groupId,
          postTargetId: target.id,
          eventType: 'TARGET_FORCED',
          message: `« ${target.post.title} » sera publié par ${profile.name} dans « ${target.group.name} » à son prochain passage`,
          metadata: { by: by(acting) },
        },
      }),
    ]);
    const mode = profile.runner?.mode ?? 'OFF';
    return {
      targetId: target.id,
      forcedProfile: { id: profile.id, name: profile.name },
      runnerMode: mode,
      // Sans cela, l'admin attendrait un profil qui ne viendra pas.
      warning:
        mode === 'OFF'
          ? `${profile.name} est à l'arrêt dans le Pilotage : il ne passera pas tant qu'il n'est pas allumé.`
          : null,
    };
  }

  /** Déplacer un post dans la file. La priorité porte sur le post : il passe
   * en tête dans TOUS ses groupes. */
  async setPriority(id: string, dto: PriorityDto, acting: CurrentUser | null) {
    const scope = postWhere(scopeOf(acting));
    const post = await this.prisma.post.findFirst({
      where: { id, ...scope },
      select: { id: true, priority: true },
    });
    if (!post) throw new NotFoundException('Post introuvable');

    let priority: number;
    if (dto.priority !== undefined) priority = dto.priority;
    else if (dto.move === 'top') {
      const top = await this.prisma.post.aggregate({
        where: { ...scope, status: 'AVAILABLE', id: { not: id } },
        _max: { priority: true },
      });
      priority = Math.max(post.priority, (top._max.priority ?? 0) + 1);
    } else if (dto.move === 'up') priority = post.priority + 1;
    else if (dto.move === 'down') priority = post.priority - 1;
    else if (dto.move === 'reset') priority = 0;
    else throw new BadRequestException('Indiquer move ou priority');

    priority = Math.max(-1000, Math.min(1000, priority));
    return this.prisma.post.update({
      where: { id },
      data: { priority },
      select: { id: true, priority: true },
    });
  }
}
