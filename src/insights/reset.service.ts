import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { JobStatus, Prisma, TargetStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { CurrentUser } from '../auth/current-user';

/** Le mot à taper pour confirmer : un clic seul ne doit rien effacer. */
export const RESET_CONFIRMATION = 'EFFACER';

export type ResetInput = {
  /** Supprimer tous les posts (et leurs publications par groupe). */
  posts?: boolean;
  /** Supprimer tous les articles. */
  articles?: boolean;
  /** Articles supprimés seuls : que faire des posts qui en viennent ?
   * `delete` les supprime aussi ; `keep` les garde, détachés de l'article. */
  articlePosts?: 'delete' | 'keep';
  /** Posts supprimés seuls : rendre les articles réutilisables. Un article
   * dont un post a été publié est archivé et ne donne plus de post. */
  unarchive?: boolean;
  confirm?: string;
  dryRun?: boolean;
  force?: boolean;
};

/** Effacer ce qu'on choisit : les posts, les articles, ou les deux.
 * Réservé aux ADMIN, sur tous les comptes.
 *
 * Jamais touchés : profils, groupes, catégories, sites, comptes, réglages,
 * journaux. Les lots de publication vidés de leurs posts partent avec eux.
 *
 * Un automate en train de publier verrait son post disparaître sous lui :
 * dès que des posts sont supprimés, c'est refusé tant qu'un lot est en
 * cours, sauf `force`. */
@Injectable()
export class ResetService {
  constructor(private readonly prisma: PrismaService) {}

  /** Ce qui existe, pour que l'écran montre les chiffres avant de choisir. */
  async counts(now = new Date()) {
    const [
      posts,
      published,
      postsFromArticles,
      articles,
      archivedArticles,
      jobs,
      activeJobs,
    ] = await Promise.all([
      this.prisma.post.count(),
      this.prisma.postTarget.count({ where: { status: TargetStatus.PUBLISHED } }),
      this.prisma.post.count({ where: { articleId: { not: null } } }),
      this.prisma.article.count(),
      this.prisma.article.count({ where: { archivedAt: { not: null } } }),
      this.prisma.publicationJob.count(),
      this.prisma.publicationJob.count({
        where: { status: JobStatus.CLAIMED, claimExpiresAt: { gt: now } },
      }),
    ]);
    return {
      posts,
      published,
      postsFromArticles,
      standalonePosts: posts - postsFromArticles,
      articles,
      archivedArticles,
      jobs,
      activeJobs,
    };
  }

  /** Ce que la demande supprimera réellement, dit avant de le faire. */
  private plan(input: ResetInput, c: Awaited<ReturnType<ResetService['counts']>>) {
    const deletePosts = Boolean(input.posts);
    const deleteArticles = Boolean(input.articles);
    const linkedPosts =
      deleteArticles && !deletePosts && input.articlePosts === 'delete';
    return {
      posts: deletePosts ? c.posts : linkedPosts ? c.postsFromArticles : 0,
      articles: deleteArticles ? c.articles : 0,
      // Gardés, détachés de leur article supprimé.
      postsDetached:
        deleteArticles && !deletePosts && input.articlePosts === 'keep'
          ? c.postsFromArticles
          : 0,
      articlesUnarchived:
        deletePosts && !deleteArticles && input.unarchive ? c.archivedArticles : 0,
    };
  }

  async reset(input: ResetInput, acting: CurrentUser | null, now = new Date()) {
    const c = await this.counts(now);
    if (input.dryRun) {
      return { dryRun: true, ...c, plan: this.plan(input, c) };
    }
    if (!input.posts && !input.articles) {
      throw new BadRequestException('Choisissez ce qu’il faut supprimer : posts, articles, ou les deux');
    }
    if (input.articles && !input.posts && c.postsFromArticles && !input.articlePosts) {
      throw new BadRequestException(
        `${c.postsFromArticles} post(s) viennent de ces articles : dites s’il faut les supprimer aussi ou les garder`,
      );
    }
    if (input.confirm !== RESET_CONFIRMATION) {
      throw new BadRequestException(
        `Tapez ${RESET_CONFIRMATION} pour confirmer la suppression`,
      );
    }
    const plan = this.plan(input, c);
    if (plan.posts && c.activeJobs && !input.force) {
      throw new ConflictException(
        `${c.activeJobs} lot(s) en cours de publication : coupez la publication ` +
          '(Pilotage) et attendez qu’ils finissent, ou forcez.',
      );
    }

    const steps: Prisma.PrismaPromise<unknown>[] = [];
    if (input.posts) {
      // Tous les posts ; leurs publications par groupe et leurs lignes de
      // lot suivent en cascade. Les lots, vidés, partent ensuite.
      steps.push(this.prisma.post.deleteMany());
    } else if (input.articles && input.articlePosts === 'delete') {
      steps.push(this.prisma.post.deleteMany({ where: { articleId: { not: null } } }));
    }
    if (plan.posts) {
      steps.push(this.prisma.publicationJob.deleteMany({ where: { items: { none: {} } } }));
    }
    if (input.articles) {
      // `keep` : la base détache les posts restants (articleId → NULL).
      steps.push(this.prisma.article.deleteMany());
    } else if (input.unarchive) {
      steps.push(
        this.prisma.article.updateMany({
          where: { archivedAt: { not: null } },
          data: { archivedAt: null },
        }),
      );
    }
    const what = [
      plan.posts && `${plan.posts} post(s)`,
      plan.articles && `${plan.articles} article(s)`,
    ]
      .filter(Boolean)
      .join(' et ');
    steps.push(
      this.prisma.activityLog.create({
        data: {
          eventType: 'ADMIN_RESET',
          level: 'WARN',
          message:
            `Suppression : ${what || 'rien'}` +
            (plan.postsDetached ? `, ${plan.postsDetached} post(s) gardés sans article` : '') +
            (plan.articlesUnarchived ? `, ${plan.articlesUnarchived} article(s) désarchivés` : ''),
          metadata: {
            choice: {
              posts: Boolean(input.posts),
              articles: Boolean(input.articles),
              articlePosts: input.articlePosts ?? null,
              unarchive: Boolean(input.unarchive),
            },
            before: c,
            ...plan,
            by: acting?.username ?? 'inconnu',
            forced: Boolean(input.force),
          },
        },
      }),
    );
    await this.prisma.$transaction(steps);
    return { dryRun: false, deleted: plan };
  }
}
