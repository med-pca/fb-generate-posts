import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { JobStatus, TargetStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { CurrentUser } from '../auth/current-user';

/** Le mot à taper pour confirmer : un clic seul ne doit pas tout effacer. */
export const RESET_CONFIRMATION = 'EFFACER';

/** Repartir de zéro : tous les posts, tous les articles, et les lots de
 * publication qui les portaient. Réservé aux ADMIN, sur tous les comptes.
 *
 * Ce qui reste : profils, groupes, catégories, sites, comptes, réglages et
 * journaux (l'historique de ce qui s'est passé). Les reprises restent aussi,
 * détachées de leur article.
 *
 * Un automate en train de publier verrait son lot disparaître sous lui : la
 * remise à zéro est refusée tant qu'un lot est en cours, sauf `force`. */
@Injectable()
export class ResetService {
  constructor(private readonly prisma: PrismaService) {}

  private async counts(now: Date) {
    const [posts, targets, published, articles, jobs, activeJobs, ingests] =
      await Promise.all([
        this.prisma.post.count(),
        this.prisma.postTarget.count(),
        this.prisma.postTarget.count({ where: { status: TargetStatus.PUBLISHED } }),
        this.prisma.article.count(),
        this.prisma.publicationJob.count(),
        this.prisma.publicationJob.count({
          where: { status: JobStatus.CLAIMED, claimExpiresAt: { gt: now } },
        }),
        this.prisma.sourceIngest.count({ where: { articleId: { not: null } } }),
      ]);
    return { posts, targets, published, articles, jobs, activeJobs, ingests };
  }

  async reset(
    input: { confirm?: string; dryRun?: boolean; force?: boolean },
    acting: CurrentUser | null,
    now = new Date(),
  ) {
    const before = await this.counts(now);
    if (input.dryRun) return { dryRun: true, ...before };
    if (input.confirm !== RESET_CONFIRMATION) {
      throw new BadRequestException(
        `Tapez ${RESET_CONFIRMATION} pour confirmer la suppression`,
      );
    }
    if (before.activeJobs && !input.force) {
      throw new ConflictException(
        `${before.activeJobs} lot(s) en cours de publication : coupez la publication ` +
          '(Pilotage) et attendez qu’ils finissent, ou forcez.',
      );
    }
    // Les lots d'abord (leurs éléments suivent en cascade), puis les posts
    // (leurs cibles suivent), puis les articles.
    await this.prisma.$transaction([
      this.prisma.publicationJob.deleteMany(),
      this.prisma.post.deleteMany(),
      this.prisma.article.deleteMany(),
      this.prisma.activityLog.create({
        data: {
          eventType: 'ADMIN_RESET',
          level: 'WARN',
          message: `Remise à zéro : ${before.posts} post(s), ${before.articles} article(s), ${before.jobs} lot(s) supprimés`,
          metadata: { ...before, by: acting?.username ?? 'inconnu', forced: Boolean(input.force) },
        },
      }),
    ]);
    return { dryRun: false, deleted: before };
  }
}
