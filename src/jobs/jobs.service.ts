import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JobStatus, Prisma, TargetStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ClaimJobDto } from './dto/claim-job.dto';
import { PublishJobItemDto } from './dto/publish-job-item.dto';
import { SettingsService } from '../settings/settings.service';

type LockedTarget = { id: string; postId: string };

@Injectable()
export class JobsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly settings: SettingsService,
  ) {}

  async claim(dto: ClaimJobDto) {
    const profile = await this.prisma.profile.findFirst({
      where: { id: dto.profileId, status: 'ACTIVE' },
    });
    if (!profile) throw new NotFoundException('Profil introuvable');

    const group = await this.prisma.group.findFirst({
      where: {
        id: dto.groupId,
        status: 'ACTIVE',
        profiles: {
          some: { profileId: dto.profileId, status: 'ACTIVE' },
        },
      },
    });
    if (!group)
      throw new NotFoundException('Groupe introuvable pour ce profil');

    const count = this.randomInt(
      profile.minPostsPerJob,
      profile.maxPostsPerJob,
    );
    const ttlMinutes = this.config.get<number>('CLAIM_TTL_MINUTES', 30);
    const claimExpiresAt = new Date(Date.now() + ttlMinutes * 60_000);

    const job = await this.prisma.$transaction(async (tx) => {
      const now = new Date();
      await tx.publicationJob.updateMany({
        where: {
          status: JobStatus.CLAIMED,
          claimExpiresAt: { lt: now },
        },
        data: { status: JobStatus.EXPIRED },
      });
      await tx.postTarget.updateMany({
        where: {
          status: TargetStatus.CLAIMED,
          claimExpiresAt: { lt: now },
        },
        data: {
          status: TargetStatus.AVAILABLE,
          claimedAt: null,
          claimExpiresAt: null,
        },
      });

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
      posts: job.items.map(({ post }) => ({
        id: post.id,
        title: post.title,
        description: post.description,
        url: post.url,
        image: post.imageUrl ?? job.profile.defaultImageUrl,
        delay: post.delay,
      })),
    };
  }

  async claimByProfileExternalId(
    profileExternalId: string,
    groupExternalId?: string,
  ) {
    const profile = await this.prisma.profile.findFirst({
      where: { externalId: profileExternalId, status: 'ACTIVE' },
    });
    if (!profile) {
      throw new NotFoundException(
        `Profil introuvable pour externalId=${profileExternalId}`,
      );
    }

    await this.settings.replenishProfile(profile.id);

    const groups = await this.prisma.group.findMany({
      where: {
        status: 'ACTIVE',
        externalId: groupExternalId || undefined,
        profiles: { some: { profileId: profile.id, status: 'ACTIVE' } },
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
          ? 'Aucun post disponible pour ce profil et ce groupe'
          : 'Aucun post disponible pour ce profil',
      };
    }

    const shuffled = groups.sort(() => Math.random() - 0.5);
    for (const group of shuffled) {
      const result = await this.claim({
        profileId: profile.id,
        groupId: group.id,
      });
      if (result.posts.length) return result;
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

  async complete(jobId: string) {
    const job = await this.prisma.publicationJob.findUnique({
      where: { id: jobId },
      include: { items: true },
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
    const allFailed = job.items.every(
      (item) => item.status === TargetStatus.FAILED,
    );
    const someFailed = job.items.some(
      (item) => item.status === TargetStatus.FAILED,
    );
    const status = allFailed
      ? JobStatus.FAILED
      : someFailed
        ? JobStatus.PARTIALLY_COMPLETED
        : JobStatus.COMPLETED;
    return this.prisma.publicationJob.update({
      where: { id: jobId },
      data: { status, completedAt: new Date() },
    });
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
