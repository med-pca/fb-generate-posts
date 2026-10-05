import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JobStatus, JoinStatus, Prisma, TargetStatus } from '@prisma/client';
import { normalizeFacebookUrl, trace } from '../trace/trace';
import { PrismaService } from '../prisma/prisma.service';
import { ClaimJobDto } from './dto/claim-job.dto';
import { ClaimBatchDto } from './dto/claim-batch.dto';
import { CommentJobItemDto } from './dto/comment-job-item.dto';
import { LinkUpdatedJobItemDto } from './dto/link-updated-job-item.dto';
import { PublishJobItemDto } from './dto/publish-job-item.dto';
import type { CurrentUser } from '../auth/current-user';
import { jobWhere, profileWhere, scopeOf } from '../auth/scope';

type LockedTarget = { id: string; postId: string; delay: number };

/** Ce qu'un automate reçoit pour publier : image et description, jamais
 * l'URL. Le commentaire l'accompagne, il recevra le lien plus tard. */
type ClaimedPost = {
  id: string;
  title: string;
  description: string;
  image: string | null;
  delay: number;
  comment: { text: string; willReceiveLink: boolean };
};

type ClaimedJob = {
  jobId: string;
  claimExpiresAt: Date;
  profile: { id: string; externalId: string | null; name: string };
  group: {
    id: string;
    externalId: string | null;
    name: string;
    url: string;
  };
  posts: ClaimedPost[];
};

/** Rien à réserver : le groupe est vide, ou le profil tient déjà un job. */
type EmptyClaim = {
  job: null;
  posts: ClaimedPost[];
  message?: string;
  activeJobId?: string;
  /** Pourquoi rien : de quoi agir, au lieu d'un « aucun post » muet. */
  reason?: EmptyReason;
  diagnosis?: Record<string, unknown>;
};

export type EmptyReason =
  | 'no_group' // lié à aucun groupe actif
  | 'not_joined' // n'a rejoint aucun de ses groupes
  | 'no_post' // rien en attente dans ses groupes rejoints
  | 'not_allowed' // des posts attendent, mais aucun ne lui est permis
  | 'taken'; // pris entre-temps par d'autres profils

/** Une entrée de réservation par lot : soit un job à confier à un thread,
 * soit la raison pour laquelle ce profil n'en reçoit pas. */
type BatchSkip = {
  status: 'busy' | 'empty' | 'error';
  profileExternalId: string;
  profileName: string;
  message?: string;
};
type BatchClaim = { status: 'claimed' } & ClaimedJob;
type BatchEntry = BatchClaim | BatchSkip;

/** Un élément de job vu sous l'angle de la phase « commentaire puis URL ». */
type LinkPhaseItem = {
  postId: string;
  status: TargetStatus;
  commentedAt: Date | null;
  linkUpdatedAt: Date | null;
  post: { url: string | null };
};

/** Les posts qu'un profil peut publier : les siens, et les posts ouverts de
 * son compte (ceux sans propriétaire servent tout le monde). Même règle que
 * la requête SQL de `claim`. */
export function claimablePostWhere(profile: {
  id: string;
  ownerId: string | null;
}): Prisma.PostWhereInput {
  return {
    OR: [
      { profileId: profile.id },
      {
        profileId: null,
        OR: [
          // Sans propriétaire, ou créé par un ADMIN : pour tous les profils.
          // Un post créé à la main dans l'admin appartient au compte admin,
          // alors que les profils ajoutés par la synchronisation NSTBrowser
          // n'ont pas de propriétaire : exiger le même compte les excluait.
          { ownerId: null },
          { owner: { role: 'ADMIN' } },
          // Créé par un gestionnaire : pour ses profils seulement.
          ...(profile.ownerId ? [{ ownerId: profile.ownerId }] : []),
        ],
      },
    ],
  };
}

/** Les cibles qu'un profil peut prendre : celles qui ne sont pas forcées
 * vers un AUTRE profil. */
export function notForcedElsewhere(
  profileId: string,
): Prisma.PostTargetWhereInput {
  return {
    AND: [
      { OR: [{ forcedProfileId: null }, { forcedProfileId: profileId }] },
      // Une republication écarte le profil qui avait laissé le post incomplet.
      { OR: [{ avoidProfileId: null }, { avoidProfileId: { not: profileId } }] },
    ],
  };
}

/** Un post qui n'est jamais parti repart seul dans la file au plus ce
 * nombre de fois (tentatives comptées à la réservation). */
const MAX_AUTO_REQUEUE = 3;

/** Écart voulu entre deux profils qui publient dans le même groupe. */
const GROUP_GAP_MINUTES = 3;

@Injectable()
export class JobsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  /** Les profils qu'un automate peut traiter, sans droits admin. */
  listAutomationProfiles(acting: CurrentUser | null = null) {
    return this.prisma.profile.findMany({
      where: {
        status: 'ACTIVE',
        externalId: { not: null },
        ...profileWhere(scopeOf(acting)),
      },
      select: { id: true, name: true, externalId: true },
      orderBy: { createdAt: 'asc' },
    });
  }

  /** Le lot doit appartenir à l'appelant. Sans ce contrôle, une clé de
   * compte piloterait le lot d'un autre en devinant son identifiant : les
   * routes du parcours ne prennent qu'un `jobId`. */
  private async reachableJob(jobId: string, acting: CurrentUser | null) {
    const job = await this.prisma.publicationJob.findFirst({
      where: { id: jobId, ...jobWhere(scopeOf(acting)) },
      select: { id: true },
    });
    if (!job) throw new NotFoundException('Job introuvable');
    return job;
  }

  async claim(
    dto: ClaimJobDto,
    acting: CurrentUser | null = null,
  ): Promise<ClaimedJob | EmptyClaim> {
    // La clé d'un compte ne réserve que sur ses profils : sans cela, un
    // automate atteindrait la file de publication d'un autre.
    const profile = await this.prisma.profile.findFirst({
      where: {
        id: dto.profileId,
        status: 'ACTIVE',
        ...profileWhere(scopeOf(acting)),
      },
    });
    if (!profile) throw new NotFoundException('Profil introuvable');

    const group = await this.prisma.group.findFirst({
      where: {
        id: dto.groupId,
        status: 'ACTIVE',
        // Le compte ne peut publier que dans un groupe qu'il a déjà rejoint.
        profiles: {
          some: {
            profileId: dto.profileId,
            status: 'ACTIVE',
            joinStatus: JoinStatus.JOINED,
          },
        },
      },
    });
    if (!group)
      throw new NotFoundException(
        'Groupe introuvable ou pas encore rejoint par ce profil',
      );

    const count = this.randomInt(
      profile.minPostsPerJob,
      profile.maxPostsPerJob,
    );
    const ttlMinutes = Number(this.config.get<number>('CLAIM_TTL_MINUTES', 30));
    // Fixée une fois les posts choisis : la réservation doit couvrir le lot
    // ENTIER, délais compris. Avec 30 min fixes, un lot de trois posts
    // espacés de 40 min expirait en route — le profil restait « occupé »
    // par un lot qui ne pouvait plus aboutir.
    let claimExpiresAt = new Date(Date.now() + ttlMinutes * 60_000);

    const job = await this.prisma.$transaction(async (tx) => {
      await this.releaseExpiredClaims(tx);

      const targets = await tx.$queryRaw<LockedTarget[]>(Prisma.sql`
        SELECT pt.id, pt.post_id AS "postId", p.delay
        FROM post_targets pt
        INNER JOIN posts p ON p.id = pt.post_id
        LEFT JOIN users u ON u.id = p.owner_id
        INNER JOIN profiles pr ON pr.id = ${dto.profileId}
        INNER JOIN groups g ON g.id = pt.group_id
        LEFT JOIN articles a ON a.id = p.article_id
        WHERE pt.group_id = ${dto.groupId}
          AND pt.status = 'AVAILABLE'::"TargetStatus"
          -- Une cible forcée vers un autre profil lui est réservée.
          AND (pt.forced_profile_id IS NULL OR pt.forced_profile_id = ${dto.profileId})
          -- Republication d'un post incomplet : pas par le profil qui l'avait raté
          -- (sauf envoi forcé vers lui par l'admin).
          AND (pt.avoid_profile_id IS NULL OR pt.avoid_profile_id <> ${dto.profileId} OR pt.forced_profile_id = ${dto.profileId})
          -- Ses propres posts, ou un post ouvert de son compte (sans
          -- propriétaire : de tous). Chaque cible ne part qu'une fois : le
          -- premier profil qui la réserve publie dans ce groupe.
          AND (
            p.profile_id = ${dto.profileId}
            OR (
              p.profile_id IS NULL
              AND (
                p.owner_id IS NULL
                OR u.role = 'ADMIN'::"Role"
                OR p.owner_id = pr.owner_id
              )
            )
          )
          AND p.status = 'AVAILABLE'::"PostStatus"
          AND pr.status = 'ACTIVE'::"RecordStatus"
          AND g.status = 'ACTIVE'::"RecordStatus"
          AND (p.article_id IS NULL OR a.status = 'ACTIVE'::"RecordStatus")
        -- La file : priorité d'abord, puis le plus ancien. C'est l'ordre que
        -- la page « File d'attente » affiche ; le hasard le rendait
        -- impossible à prévoir comme à piloter.
        ORDER BY (pt.forced_profile_id IS NOT NULL) DESC,
          p.priority DESC, p.created_at ASC, pt.created_at ASC
        FOR UPDATE OF pt SKIP LOCKED
        LIMIT ${count}
      `);

      if (targets.length === 0) return null;
      const pacing = targets.reduce((sum, target) => sum + Number(target.delay || 0), 0);
      claimExpiresAt = new Date(Date.now() + (ttlMinutes + pacing) * 60_000);
      const targetIds = targets.map((target) => target.id);
      await tx.postTarget.updateMany({
        where: { id: { in: targetIds }, status: TargetStatus.AVAILABLE },
        data: {
          status: TargetStatus.CLAIMED,
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

    if (!job) return { job: null, posts: [] };
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
      // `url` est volontairement absent : la publication part avec l'image et
      // la description seules. Le lien n'est délivré qu'après la clôture du
      // job, par `GET /jobs/:id/link-updates`, pour être posé dans le
      // commentaire déjà en place.
      posts: job.items.map(({ post }) => ({
        id: post.id,
        title: post.title,
        description: post.description,
        image: post.imageUrl ?? job.profile.defaultImageUrl,
        delay: post.delay,
        comment: { text: post.description, willReceiveLink: Boolean(post.url) },
      })),
    };
  }

  /** Réserve un job par profil, pour autant de threads que de profils rendus.
   * Un profil déjà occupé est écarté : deux threads ne doivent jamais piloter
   * le même compte en même temps. */
  async claimBatch(
    { profileExternalIds, limit }: ClaimBatchDto,
    acting: CurrentUser | null = null,
  ) {
    const requested = [...new Set(profileExternalIds ?? [])];
    const profiles = await this.prisma.profile.findMany({
      where: {
        status: 'ACTIVE',
        externalId: requested.length ? { in: requested } : { not: null },
        ...profileWhere(scopeOf(acting)),
      },
      select: { id: true, name: true, externalId: true },
      orderBy: { createdAt: 'asc' },
      take: limit,
    });
    if (!profiles.length) {
      return { requested: limit, claimed: 0, jobs: [], skipped: [] };
    }

    const results = await Promise.all(
      profiles.map(async (profile): Promise<BatchEntry> => {
        const externalId = profile.externalId ?? '';
        try {
          const claim = await this.claimByProfileExternalId(
            externalId,
            undefined,
            acting,
          );
          if ('jobId' in claim) return { status: 'claimed', ...claim };
          return {
            status: claim.activeJobId ? 'busy' : 'empty',
            profileExternalId: externalId,
            profileName: profile.name,
            message: claim.message,
          };
        } catch (error) {
          const message =
            error instanceof Error ? error.message : 'Erreur inconnue';
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
      }),
    );

    const jobs: BatchClaim[] = [];
    const skipped: BatchSkip[] = [];
    for (const result of results) {
      if (result.status === 'claimed') jobs.push(result);
      else skipped.push(result);
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

  /** Rendre au pool les posts des réservations expirées.
   *
   * Ce balayage ne vivait qu'à l'intérieur de la transaction de claim. Or
   * claimByProfileExternalId cherche des cibles AVAILABLE AVANT d'appeler
   * claim, et sort aussitôt s'il n'en trouve aucune : quand toutes les cibles
   * sont tenues par des réservations expirées, le balayage n'était jamais
   * atteint et plus rien ne pouvait être réservé. Il doit donc tourner avant
   * que quoi que ce soit ne regarde la disponibilité.
   */
  async releaseExpiredClaims(tx: Prisma.TransactionClient = this.prisma) {
    const now = new Date();
    await tx.publicationJob.updateMany({
      where: { status: JobStatus.CLAIMED, claimExpiresAt: { lt: now } },
      data: { status: JobStatus.EXPIRED },
    });
    const released = await tx.postTarget.updateMany({
      where: { status: TargetStatus.CLAIMED, claimExpiresAt: { lt: now } },
      data: {
        status: TargetStatus.AVAILABLE,
        claimedAt: null,
        claimExpiresAt: null,
      },
    });
    return released.count;
  }

  async claimByProfileExternalId(
    profileExternalId: string,
    groupExternalId?: string,
    acting: CurrentUser | null = null,
  ): Promise<ClaimedJob | EmptyClaim> {
    const profile = await this.prisma.profile.findFirst({
      where: {
        externalId: profileExternalId,
        status: 'ACTIVE',
        ...profileWhere(scopeOf(acting)),
      },
    });
    if (!profile) {
      throw new NotFoundException(
        `Profil introuvable pour externalId=${profileExternalId}`,
      );
    }

    // Un profil correspond à un compte : lui confier un second job pendant
    // qu'il en traite un ferait publier deux threads sur le même compte.
    const active = await this.prisma.publicationJob.findFirst({
      where: {
        profileId: profile.id,
        status: JobStatus.CLAIMED,
        claimExpiresAt: { gt: new Date() },
      },
      select: { id: true, claimExpiresAt: true },
    });
    // Un lot dont tous les posts sont terminés (publiés ou en échec) n'occupe
    // plus rien : l'extension n'a simplement pas pu le clore. On le clôt ici
    // plutôt que de bloquer le profil jusqu'à son expiration.
    if (active && (await this.isFinished(active.id))) {
      await this.complete(active.id).catch(() => undefined);
      await this.log({
        profileId: profile.id,
        jobId: active.id,
        eventType: 'JOB_AUTO_COMPLETED',
        message: `Lot ${active.id} clos automatiquement : tous ses posts étaient terminés`,
      });
    } else if (active) {
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

    // Avant de regarder ce qui est disponible : une réservation expirée tient
    // encore ses posts tant qu'elle n'a pas été balayée.
    await this.releaseExpiredClaims();

    const groups = await this.prisma.group.findMany({
      where: {
        status: 'ACTIVE',
        externalId: groupExternalId || undefined,
        profiles: {
          some: {
            profileId: profile.id,
            status: 'ACTIVE',
            joinStatus: JoinStatus.JOINED,
          },
        },
        targets: {
          some: {
            status: TargetStatus.AVAILABLE,
            post: { status: 'AVAILABLE', ...claimablePostWhere(profile) },
            ...notForcedElsewhere(profile.id),
          },
        },
      },
      select: { id: true },
    });

    if (!groups.length) {
      return {
        job: null,
        posts: [],
        ...(await this.explainNothingToClaim(profile, groupExternalId)),
      };
    }

    for (const group of await this.byTopPriority(groups, profile)) {
      const result = await this.claim(
        { profileId: profile.id, groupId: group.id },
        acting,
      );
      // `jobId` distingue une réservation aboutie d'un groupe déjà vidé.
      if ('jobId' in result) return result;
    }
    return {
      job: null,
      posts: [],
      reason: 'taken',
      message:
        'Les posts disponibles viennent d’être réservés par d’autres profils : réessayer au prochain passage',
    };
  }

  /** Pourquoi un profil ne trouve rien à publier — avec les chiffres et les
   * noms qui disent quoi faire. Sans cela, le journal ne disait que « aucun
   * post », que le profil n'ait rejoint aucun groupe, que ses posts attendent
   * ailleurs, ou qu'ils soient réservés à un autre compte. */
  async explainNothingToClaim(
    profile: { id: string; ownerId: string | null },
    groupExternalId?: string,
  ): Promise<{ reason: EmptyReason; message: string; diagnosis: Record<string, unknown> }> {
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
    // En attente, quel que soit le profil : ce qui est publiable en général.
    const waiting: Prisma.PostTargetWhereInput = {
      status: TargetStatus.AVAILABLE,
      post: {
        status: 'AVAILABLE',
        OR: [{ articleId: null }, { article: { status: 'ACTIVE' } }],
      },
    };
    const joined = links.filter((l) => l.joinStatus === JoinStatus.JOINED);
    const notJoined = links.filter((l) => l.joinStatus !== JoinStatus.JOINED);
    const pending = notJoined.filter(
      (l) => l.joinStatus === JoinStatus.REQUESTED || l.joinStatus === JoinStatus.QUESTIONS,
    );
    const ids = (list: typeof links) => list.map((l) => l.group.id);
    const names = (list: typeof links) =>
      list.slice(0, 3).map((l) => l.group.name).join(', ') + (list.length > 3 ? '…' : '');
    const [inJoined, allowedInJoined, inNotJoined] = await Promise.all([
      joined.length
        ? this.prisma.postTarget.count({ where: { ...waiting, groupId: { in: ids(joined) } } })
        : 0,
      joined.length
        ? this.prisma.postTarget.count({
            where: {
              ...waiting,
              groupId: { in: ids(joined) },
              post: { AND: [waiting.post as Prisma.PostWhereInput, claimablePostWhere(profile)] },
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
        message:
          `Ce profil n’a rejoint aucun de ses ${links.length} groupe(s)${scope}` +
          (pending.length ? ` (${pending.length} demande(s) en attente)` : '') +
          '.' +
          elsewhere,
        diagnosis,
      };
    }
    if (!inJoined) {
      return {
        reason: 'no_post',
        message:
          `Aucun post en attente dans ses ${joined.length} groupe(s) rejoint(s)${scope}.` + elsewhere,
        diagnosis,
      };
    }
    if (!allowedInJoined) {
      return {
        reason: 'not_allowed',
        message:
          `${inJoined} post(s) attendent dans ses groupes, mais aucun ne lui est permis : ` +
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

  /** Le groupe qui porte le post le plus prioritaire passe d'abord : sans
   * cela, un post mis en tête attendrait que le hasard tombe sur son groupe.
   * À égalité, le hasard répartit toujours la charge entre les groupes. */
  private async byTopPriority(
    groups: Array<{ id: string }>,
    profile: { id: string; ownerId: string | null },
  ) {
    // Les groupes où un AUTRE profil publie en ce moment, ou vient de publier :
    // deux comptes qui postent ensemble dans un groupe se gênent (Facebook
    // freine, la vérification du post dans le fil confond les deux). Ils
    // passent en dernier — jamais exclus : l'objectif du jour passe avant.
    const now = Date.now();
    const crowded = new Set(
      (
        await this.prisma.publicationJobItem.findMany({
          where: {
            job: { groupId: { in: groups.map((g) => g.id) }, profileId: { not: profile.id } },
            OR: [
              { status: TargetStatus.CONSUMED, updatedAt: { gt: new Date(now - 10 * 60_000) } },
              { status: TargetStatus.PUBLISHED, publishedAt: { gt: new Date(now - GROUP_GAP_MINUTES * 60_000) } },
            ],
          },
          select: { job: { select: { groupId: true } } },
        })
      ).map((item) => item.job.groupId),
    );
    // Les groupes où CE profil est pré-approuvé (par le modérateur ou marqué
    // à la main) : ses posts y paraissent sans validation — à priorité égale,
    // il commence par là.
    const preApproved = new Set(
      (
        await this.prisma.profileGroup.findMany({
          where: { profileId: profile.id, groupId: { in: groups.map((g) => g.id) }, preApprovedAt: { not: null } },
          select: { groupId: true },
        })
      ).map((link) => link.groupId),
    );
    const tops = await Promise.all(
      groups.map(async (group) => {
        const top = await this.prisma.postTarget.findFirst({
          where: {
            groupId: group.id,
            status: TargetStatus.AVAILABLE,
            post: { status: 'AVAILABLE', ...claimablePostWhere(profile) },
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
          // Un envoi forcé passe avant toute priorité.
          forced: top?.forcedProfileId === profile.id ? 1 : 0,
          priority: top?.post.priority ?? 0,
          free: crowded.has(group.id) ? 0 : 1,
          preApproved: preApproved.has(group.id) ? 1 : 0,
          tie: Math.random(),
        };
      }),
    );
    return tops
      .sort(
        (a, b) =>
          b.forced - a.forced ||
          b.free - a.free ||
          b.priority - a.priority ||
          b.preApproved - a.preApproved ||
          a.tie - b.tie,
      )
      .map(({ group }) => group);
  }

  /** Plus aucun post du lot n'attend ni n'est en cours. */
  private async isFinished(jobId: string) {
    const open = await this.prisma.publicationJobItem.count({
      where: {
        jobId,
        status: { in: [TargetStatus.CLAIMED, TargetStatus.CONSUMED] },
      },
    });
    return open === 0;
  }

  /** Libérer un lot que plus personne ne traite : ses posts pas encore
   * commencés retournent dans la file, et le profil peut en réserver un
   * autre.
   *
   * C'est ce que fait l'extension quand elle retrouve un lot qu'elle a
   * oublié (réinstallée, ou relancée en plein lot), et ce que fait l'admin
   * depuis la file. Un post « en cours de publication » (CONSUMED) n'est
   * pas remis en file : il est peut-être déjà sur Facebook, le republier
   * ferait un doublon. */
  async release(
    jobId: string,
    acting: CurrentUser | null = null,
    reason = 'lot libéré',
  ) {
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
    if (!job) throw new NotFoundException('Job introuvable');
    if (job.status !== JobStatus.CLAIMED) {
      return { jobId, released: 0, inProgress: 0, alreadyClosed: true };
    }
    const waiting = job.items.filter((item) => item.status === TargetStatus.CLAIMED);
    const inProgress = job.items.filter((item) => item.status === TargetStatus.CONSUMED).length;
    await this.prisma.$transaction([
      this.prisma.postTarget.updateMany({
        where: {
          id: { in: waiting.map((item) => item.postTargetId) },
          status: TargetStatus.CLAIMED,
        },
        data: { status: TargetStatus.AVAILABLE, claimedAt: null, claimExpiresAt: null },
      }),
      this.prisma.publicationJobItem.updateMany({
        where: { id: { in: waiting.map((item) => item.id) } },
        data: { status: TargetStatus.FAILED, error: `Rendu à la file : ${reason}` },
      }),
      this.prisma.publicationJob.update({
        where: { id: jobId },
        data: { status: JobStatus.EXPIRED, completedAt: new Date() },
      }),
      this.prisma.activityLog.create({
        data: {
          jobId,
          profileId: job.profileId,
          groupId: job.groupId,
          eventType: 'JOB_RELEASED',
          level: 'WARN',
          message:
            `Lot libéré (${reason}) : ${waiting.length} post(s) rendu(s) à la file` +
            (inProgress ? `, ${inProgress} en cours de publication laissé(s) tel(s) quel(s)` : ''),
          metadata: { by: acting?.username ?? 'clé globale', reason },
        },
      }),
    ]);
    return { jobId, released: waiting.length, inProgress, alreadyClosed: false };
  }

  async markConsumed(
    jobId: string,
    postId: string,
    acting: CurrentUser | null = null,
  ) {
    await this.reachableJob(jobId, acting);
    return this.updateItem(jobId, postId, TargetStatus.CONSUMED, {});
  }

  async markPublished(
    jobId: string,
    postId: string,
    dto: PublishJobItemDto,
    acting: CurrentUser | null = null,
  ) {
    await this.reachableJob(jobId, acting);
    const publishedAt = dto.publishedAt
      ? new Date(dto.publishedAt)
      : new Date();
    const result = await this.updateItem(
      jobId,
      postId,
      TargetStatus.PUBLISHED,
      { publishedAt, externalPostUrl: dto.externalPostUrl },
    );
    await this.archiveArticleOf(postId, publishedAt);
    return result;
  }

  /** Le premier post publié d'un article l'archive : il a servi, on n'en
   * tirera plus d'autre post. Son post continue sa tournée des groupes
   * (chacun ne le reçoit qu'une fois). Sans effet sur un article déjà
   * archivé, ni sur un post qui ne vient d'aucun article. */
  private async archiveArticleOf(postId: string, publishedAt: Date) {
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

  async markFailed(
    jobId: string,
    postId: string,
    error: string,
    acting: CurrentUser | null = null,
    requeue = false,
  ) {
    await this.reachableJob(jobId, acting);
    const item = await this.updateItem(jobId, postId, TargetStatus.FAILED, { error });
    if (requeue) await this.requeueUnpublished(jobId, postId, error);
    return item;
  }

  /** Un échec AVANT la publication (composeur absent, page muette, navigateur
   * interrompu avant le clic « Publier ») : rien n'est parti sur Facebook.
   * Laisser le post en échec coûtait une publication à chaque gêne passagère
   * — plusieurs profils sur une machine, une page lente. Il repart dans la
   * file, de préférence vers un AUTRE profil du groupe, au plus 3 tentatives ;
   * ensuite il reste en échec, à regarder. */
  private async requeueUnpublished(jobId: string, postId: string, error: string) {
    const item = await this.prisma.publicationJobItem.findUnique({
      where: { jobId_postId: { jobId, postId } },
      select: {
        postTargetId: true,
        postTarget: { select: { status: true, attemptsCount: true, groupId: true, facebookUrl: true } },
        job: { select: { profileId: true, profile: { select: { name: true } } } },
        post: { select: { title: true } },
      },
    });
    if (!item || item.postTarget.status !== TargetStatus.FAILED) return;
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
        joinStatus: JoinStatus.JOINED,
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
          status: TargetStatus.AVAILABLE,
          claimedAt: null,
          claimExpiresAt: null,
          consumedAt: null,
          lastError: error,
          avoidProfileId: others ? item.job.profileId : null,
        },
      }),
      trace(this.prisma, { postTargetId: item.postTargetId, kind: 'RETRIED', actor: 'Remise en file automatique', jobId, detail }),
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

  /** Clôture le lot. C'est ici que s'ouvre la seconde phase : une fois tout
   * validé, les commentaires déjà posés peuvent recevoir l'URL. */
  async complete(jobId: string, acting: CurrentUser | null = null) {
    await this.reachableJob(jobId, acting);
    const job = await this.prisma.publicationJob.findUnique({
      where: { id: jobId },
      include: { items: { include: { post: { select: { url: true } } } } },
    });
    if (!job) throw new NotFoundException('Job introuvable');
    const unfinished = job.items.some(
      (item) =>
        item.status === TargetStatus.CLAIMED ||
        item.status === TargetStatus.CONSUMED,
    );
    if (unfinished) {
      throw new BadRequestException('Tous les posts doivent être finalisés');
    }

    const awaiting = job.items.filter((item) => this.awaitsLink(item));
    // Un post publié sans commentaire ne recevra jamais son URL. On ne bloque
    // pas la clôture — le post est en ligne — mais ça doit rester visible.
    const missingComments = job.items.filter(
      (item) =>
        item.status === TargetStatus.PUBLISHED &&
        item.post.url &&
        !item.commentedAt,
    );
    const outcome = this.outcomeFor(job.items);
    const status = awaiting.length ? JobStatus.AWAITING_LINK : outcome;

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

  /** Étape 2 : le commentaire est posé sous le post, avec la description
   * seule. Son identifiant est indispensable — c'est lui qu'on modifie pour y
   * placer l'URL, que la réponse transmet aussitôt. Le lot réservé, lui, ne
   * porte jamais l'URL : le post sort sans lien. */
  async markCommented(
    jobId: string,
    postId: string,
    dto: CommentJobItemDto,
    acting: CurrentUser | null = null,
  ) {
    await this.reachableJob(jobId, acting);
    const item = await this.prisma.publicationJobItem.findUnique({
      where: { jobId_postId: { jobId, postId } },
      include: {
        job: true,
        postTarget: true,
        post: { select: { url: true } },
      },
    });
    if (!item) throw new NotFoundException('Post introuvable dans ce job');
    if (item.status !== TargetStatus.PUBLISHED) {
      throw new BadRequestException(
        'Le post doit être confirmé publié avant d’enregistrer son commentaire',
      );
    }
    if (item.commentedAt) {
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
    if (!this.stillOwnsTarget(item.job, item.postTarget)) {
      await this.logLostClaim(jobId, postId, item.postTargetId, item.status);
      throw new ConflictException(
        'La réservation de ce post a expiré et a été reprise. ' +
          'Ne republiez pas ce post : signalez-le à un administrateur.',
      );
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
      await trace(tx, {
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
          eventType: 'POST_COMMENTED',
          message: 'Commentaire posé, en attente de l’URL',
          metadata: { commentExternalId: dto.commentExternalId },
        },
      });
      // L'URL part avec la réponse : le post est en ligne et son commentaire
      // existe, le worker peut l'y placer tout de suite, post par post.
      return { ...updated, url: item.post.url };
    });
  }

  /** Étape 3 : les URL à poser, une fois le lot validé. Tant que le job est
   * réservé, rien n'est rendu — c'est la règle « après la validation de
   * tous ». */
  async linkUpdates(jobId: string, acting: CurrentUser | null = null) {
    await this.reachableJob(jobId, acting);
    const job = await this.prisma.publicationJob.findUnique({
      where: { id: jobId },
      include: {
        profile: { select: { id: true, name: true, externalId: true } },
        group: { select: { id: true, name: true, externalId: true } },
        items: { include: { post: { select: { url: true, title: true } } } },
      },
    });
    if (!job) throw new NotFoundException('Job introuvable');
    if (job.status === JobStatus.CLAIMED) {
      throw new BadRequestException(
        'Clôturez le job (complete) avant de basculer les commentaires sur l’URL',
      );
    }
    return {
      jobId: job.id,
      status: job.status,
      completedAt: job.completedAt,
      profile: job.profile,
      group: job.group,
      updates: job.items
        .filter((item) => this.awaitsLink(item))
        .map((item) => ({
          postId: item.postId,
          title: item.post.title,
          commentExternalId: item.commentExternalId,
          url: item.post.url,
          externalPostUrl: item.externalPostUrl,
        })),
    };
  }

  /** Les commentaires en attente d'URL, tous jobs confondus : c'est la file
   * qu'un worker consomme après avoir traité ses lots. */
  async pendingLinkUpdates(
    profileExternalId: string | undefined,
    limit: number,
    acting: CurrentUser | null = null,
  ) {
    const jobs = await this.prisma.publicationJob.findMany({
      // Pas seulement AWAITING_LINK : un job publié et commenté puis expiré
      // faute de `complete` laisse lui aussi des commentaires sans URL.
      where: {
        status: { not: JobStatus.CLAIMED },
        ...jobWhere(scopeOf(acting)),
        ...(profileExternalId
          ? { profile: { externalId: profileExternalId } }
          : {}),
      },
      include: {
        profile: { select: { id: true, name: true, externalId: true } },
        group: { select: { id: true, name: true, externalId: true } },
        items: { include: { post: { select: { url: true, title: true } } } },
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
          .filter((item) => this.awaitsLink(item))
          .map((item) => ({
            postId: item.postId,
            title: item.post.title,
            commentExternalId: item.commentExternalId,
            url: item.post.url,
          })),
      }))
      .filter((job) => job.updates.length > 0);
  }

  /** Étape 4 : le commentaire porte désormais l'URL. Accepté avant comme
   * après la clôture : le worker modifie chaque commentaire juste après son
   * post. Aucun contrôle de réservation — la cible est publiée, elle ne repart
   * plus dans le pool. */
  async markLinkUpdated(
    jobId: string,
    postId: string,
    dto: LinkUpdatedJobItemDto,
    acting: CurrentUser | null = null,
  ) {
    await this.reachableJob(jobId, acting);
    const item = await this.prisma.publicationJobItem.findUnique({
      where: { jobId_postId: { jobId, postId } },
      include: { job: true, post: { select: { url: true } } },
    });
    if (!item) throw new NotFoundException('Post introuvable dans ce job');
    if (!item.commentExternalId) {
      throw new BadRequestException(
        'Aucun commentaire enregistré pour ce post : rien à modifier',
      );
    }
    if (!item.post.url) {
      throw new BadRequestException('Ce post n’a pas d’URL à placer');
    }
    if (item.linkUpdatedAt) return { ...item, remaining: 0 };

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
      await trace(tx, {
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
      const remaining = siblings.filter((sibling) =>
        this.awaitsLink(sibling),
      ).length;
      if (!remaining && item.job.status === JobStatus.AWAITING_LINK) {
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

  /** Publié, commenté, doté d'une URL, mais le commentaire ne la porte pas
   * encore. */
  private awaitsLink(item: LinkPhaseItem) {
    return (
      item.status === TargetStatus.PUBLISHED &&
      Boolean(item.post.url) &&
      item.commentedAt !== null &&
      item.linkUpdatedAt === null
    );
  }

  private outcomeFor(items: Array<{ status: TargetStatus }>) {
    if (items.every((item) => item.status === TargetStatus.FAILED)) {
      return JobStatus.FAILED;
    }
    return items.some((item) => item.status === TargetStatus.FAILED)
      ? JobStatus.PARTIALLY_COMPLETED
      : JobStatus.COMPLETED;
  }

  private log(data: Prisma.ActivityLogUncheckedCreateInput) {
    return this.prisma.activityLog.create({ data });
  }

  private async updateItem(
    jobId: string,
    postId: string,
    status: TargetStatus,
    data: { publishedAt?: Date; externalPostUrl?: string; error?: string },
  ) {
    const item = await this.prisma.publicationJobItem.findUnique({
      where: { jobId_postId: { jobId, postId } },
      include: {
        job: { include: { profile: { select: { name: true } } } },
        postTarget: true,
      },
    });
    if (!item) throw new NotFoundException('Post introuvable dans ce job');
    if (item.status === status) return item;
    if (!this.canTransition(item.status, status)) {
      throw new BadRequestException(
        `Le post est déjà finalisé avec le statut ${item.status}`,
      );
    }
    // Un claim expiré peut avoir été repris par un autre automate. Confirmer
    // ici écraserait le travail du nouveau propriétaire, et le post finirait
    // publié deux fois.
    if (!this.stillOwnsTarget(item.job, item.postTarget)) {
      await this.logLostClaim(jobId, postId, item.postTargetId, status);
      throw new ConflictException(
        'La réservation de ce post a expiré et a été reprise. ' +
          'Ne republiez pas ce post : signalez-le à un administrateur.',
      );
    }

    // L'adresse du post : gardée telle que Facebook l'a donnée, ramenée à sa
    // forme stable (sans paramètres de suivi).
    const facebookUrl =
      status === TargetStatus.PUBLISHED
        ? (normalizeFacebookUrl(data.externalPostUrl) ?? data.externalPostUrl ?? null)
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
          consumedAt: status === TargetStatus.CONSUMED ? new Date() : undefined,
          publishedAt: data.publishedAt,
          lastError: data.error,
          facebookUrl,
        },
      });
      if (status === TargetStatus.PUBLISHED || status === TargetStatus.FAILED) {
        await trace(tx, {
          postTargetId: item.postTargetId,
          kind:
            status === TargetStatus.FAILED
              ? 'FAILED'
              : facebookUrl
                ? 'PUBLISHED'
                : 'URL_MISSING',
          facebookUrl,
          actor: item.job.profile?.name ?? null,
          profileId: item.job.profileId,
          jobId,
          detail:
            status === TargetStatus.FAILED
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
          level: status === TargetStatus.FAILED ? 'ERROR' : status === TargetStatus.PUBLISHED && !facebookUrl ? 'WARN' : 'INFO',
          message:
            data.error ??
            (status === TargetStatus.PUBLISHED
              ? facebookUrl
                ? `Publié par ${item.job.profile?.name ?? 'le profil'} : ${facebookUrl}`
                : `Publié par ${item.job.profile?.name ?? 'le profil'}, SANS adresse Facebook : le vérificateur la cherchera dans le groupe`
              : `Post marqué ${status}`),
        },
      });
      return updated;
    });
  }

  /** `consumed` est une étape intermédiaire : elle doit pouvoir être suivie
   * d'un `published` ou d'un `failed`, sinon le job ne peut jamais être
   * finalisé (complete() compte CONSUMED comme non terminé). */
  private canTransition(from: TargetStatus, to: TargetStatus) {
    if (from === TargetStatus.CLAIMED) return true;
    if (from === TargetStatus.CONSUMED) {
      return to === TargetStatus.PUBLISHED || to === TargetStatus.FAILED;
    }
    return false;
  }

  /** À la réservation, chaque cible reçoit exactement l'échéance de son job.
   * Si elle ne la porte plus, elle est repartie en AVAILABLE (expiration) ou
   * a déjà été reprise par un autre job. */
  private stillOwnsTarget(
    job: { claimExpiresAt: Date },
    target: { claimExpiresAt: Date | null },
  ) {
    return (
      target.claimExpiresAt !== null &&
      target.claimExpiresAt.getTime() === job.claimExpiresAt.getTime()
    );
  }

  /** Une confirmation refusée signifie souvent qu'un post est bel et bien en
   * ligne sans que la base puisse l'enregistrer : ça doit rester visible. */
  private logLostClaim(
    jobId: string,
    postId: string,
    postTargetId: string,
    status: TargetStatus,
  ) {
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

  private randomInt(min: number, max: number) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }
}
