import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JobStatus, JoinStatus, Prisma, TargetStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ClaimJobDto } from './dto/claim-job.dto';
import { ClaimBatchDto } from './dto/claim-batch.dto';
import { CommentJobItemDto } from './dto/comment-job-item.dto';
import { LinkUpdatedJobItemDto } from './dto/link-updated-job-item.dto';
import { PublishJobItemDto } from './dto/publish-job-item.dto';
import { SettingsService } from '../settings/settings.service';

type LockedTarget = { id: string; postId: string };

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
};

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

@Injectable()
export class JobsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly settings: SettingsService,
  ) {}

  /** Les profils qu'un automate peut traiter, sans droits admin. */
  listAutomationProfiles() {
    return this.prisma.profile.findMany({
      where: { status: 'ACTIVE', externalId: { not: null } },
      select: { id: true, name: true, externalId: true },
      orderBy: { createdAt: 'asc' },
    });
  }

  async claim(dto: ClaimJobDto): Promise<ClaimedJob | EmptyClaim> {
    const profile = await this.prisma.profile.findFirst({
      where: { id: dto.profileId, status: 'ACTIVE' },
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
    const ttlMinutes = this.config.get<number>('CLAIM_TTL_MINUTES', 30);
    const claimExpiresAt = new Date(Date.now() + ttlMinutes * 60_000);

    const job = await this.prisma.$transaction(async (tx) => {
      await this.releaseExpiredClaims(tx);

      const targets = await tx.$queryRaw<LockedTarget[]>(Prisma.sql`
        SELECT pt.id, pt.post_id AS "postId"
        FROM post_targets pt
        INNER JOIN posts p ON p.id = pt.post_id
        INNER JOIN profiles pr ON pr.id = p.profile_id
        INNER JOIN groups g ON g.id = pt.group_id
        LEFT JOIN articles a ON a.id = p.article_id
        WHERE pt.group_id = ${dto.groupId}
          AND pt.status = 'AVAILABLE'::"TargetStatus"
          AND p.profile_id = ${dto.profileId}
          AND p.status = 'AVAILABLE'::"PostStatus"
          AND pr.status = 'ACTIVE'::"RecordStatus"
          AND g.status = 'ACTIVE'::"RecordStatus"
          AND (p.article_id IS NULL OR a.status = 'ACTIVE'::"RecordStatus")
        ORDER BY RANDOM()
        FOR UPDATE OF pt SKIP LOCKED
        LIMIT ${count}
      `);

      if (targets.length === 0) return null;
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
  async claimBatch({ profileExternalIds, limit }: ClaimBatchDto) {
    const requested = [...new Set(profileExternalIds ?? [])];
    const profiles = await this.prisma.profile.findMany({
      where: {
        status: 'ACTIVE',
        externalId: requested.length ? { in: requested } : { not: null },
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
          const claim = await this.claimByProfileExternalId(externalId);
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
  ): Promise<ClaimedJob | EmptyClaim> {
    const profile = await this.prisma.profile.findFirst({
      where: { externalId: profileExternalId, status: 'ACTIVE' },
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
    if (active) {
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
    await this.settings.replenishProfile(profile.id);

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
            post: { profileId: profile.id, status: 'AVAILABLE' },
          },
        },
      },
      select: { id: true },
    });

    if (!groups.length) {
      return {
        job: null,
        posts: [],
        message: groupExternalId
          ? 'Aucun post disponible pour ce profil et ce groupe (ou groupe pas encore rejoint)'
          : 'Aucun post disponible dans les groupes rejoints par ce profil',
      };
    }

    const shuffled = groups.sort(() => Math.random() - 0.5);
    for (const group of shuffled) {
      const result = await this.claim({
        profileId: profile.id,
        groupId: group.id,
      });
      // `jobId` distingue une réservation aboutie d'un groupe déjà vidé.
      if ('jobId' in result) return result;
    }
    return { job: null, posts: [], message: 'Aucun post disponible' };
  }

  markConsumed(jobId: string, postId: string) {
    return this.updateItem(jobId, postId, TargetStatus.CONSUMED, {});
  }

  markPublished(jobId: string, postId: string, dto: PublishJobItemDto) {
    const publishedAt = dto.publishedAt
      ? new Date(dto.publishedAt)
      : new Date();
    return this.updateItem(jobId, postId, TargetStatus.PUBLISHED, {
      publishedAt,
      externalPostUrl: dto.externalPostUrl,
    });
  }

  markFailed(jobId: string, postId: string, error: string) {
    return this.updateItem(jobId, postId, TargetStatus.FAILED, { error });
  }

  /** Clôture le lot. C'est ici que s'ouvre la seconde phase : une fois tout
   * validé, les commentaires déjà posés peuvent recevoir l'URL. */
  async complete(jobId: string) {
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
   * seule. Son identifiant est indispensable — c'est lui qu'on modifiera pour
   * y placer l'URL une fois le lot validé. */
  async markCommented(jobId: string, postId: string, dto: CommentJobItemDto) {
    const item = await this.prisma.publicationJobItem.findUnique({
      where: { jobId_postId: { jobId, postId } },
      include: { job: true, postTarget: true },
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
      return item;
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
      await tx.activityLog.create({
        data: {
          jobId,
          postId,
          postTargetId: item.postTargetId,
          eventType: 'POST_COMMENTED',
          message: 'Commentaire posé, en attente de l’URL',
          metadata: { commentExternalId: dto.commentExternalId },
        },
      });
      return updated;
    });
  }

  /** Étape 3 : les URL à poser, une fois le lot validé. Tant que le job est
   * réservé, rien n'est rendu — c'est la règle « après la validation de
   * tous ». */
  async linkUpdates(jobId: string) {
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
  ) {
    const jobs = await this.prisma.publicationJob.findMany({
      // Pas seulement AWAITING_LINK : un job publié et commenté puis expiré
      // faute de `complete` laisse lui aussi des commentaires sans URL.
      where: {
        status: { not: JobStatus.CLAIMED },
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

  /** Étape 4 : le commentaire porte désormais l'URL. Aucun contrôle de
   * réservation ici — la cible est publiée, elle ne repart plus dans le pool,
   * et le claim a légitimement expiré depuis la clôture du lot. */
  async markLinkUpdated(
    jobId: string,
    postId: string,
    dto: LinkUpdatedJobItemDto,
  ) {
    const item = await this.prisma.publicationJobItem.findUnique({
      where: { jobId_postId: { jobId, postId } },
      include: { job: true, post: { select: { url: true } } },
    });
    if (!item) throw new NotFoundException('Post introuvable dans ce job');
    if (item.job.status === JobStatus.CLAIMED) {
      throw new BadRequestException(
        'Clôturez le job (complete) avant de basculer les commentaires sur l’URL',
      );
    }
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
      await tx.activityLog.create({
        data: {
          jobId,
          postId,
          postTargetId: item.postTargetId,
          eventType: 'COMMENT_LINK_UPDATED',
          message: 'Commentaire modifié avec l’URL',
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
      include: { job: true, postTarget: true },
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

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.publicationJobItem.update({
        where: { id: item.id },
        data: { status, ...data },
      });
      await tx.postTarget.update({
        where: { id: item.postTargetId },
        data: {
          status,
          consumedAt: status === TargetStatus.CONSUMED ? new Date() : undefined,
          publishedAt: data.publishedAt,
          lastError: data.error,
        },
      });
      await tx.activityLog.create({
        data: {
          jobId,
          postId,
          postTargetId: item.postTargetId,
          eventType: `POST_${status}`,
          level: status === TargetStatus.FAILED ? 'ERROR' : 'INFO',
          message: data.error ?? `Post marqué ${status}`,
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
