import {
  BadRequestException,
  NotFoundException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { CurrentUser } from '../auth/current-user';
import { postWhere, scopeOf } from '../auth/scope';
import { postGroupIds } from './post-groups';
import { CreatePostDto } from './dto/create-post.dto';
import { UpdatePostDto } from './dto/update-post.dto';
import { QueryPostsDto } from './dto/query-posts.dto';
import { BulkDeletePostsDto } from './dto/bulk-delete-posts.dto';
import { paginated } from '../common/paginated';

type PostFilters = Omit<QueryPostsDto, 'page' | 'limit'> & { ids?: string[] };

@Injectable()
export class PostsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Un post n'est lié qu'à ses groupes : le profil qui publie dans l'un
   * d'eux vient l'y chercher, et chaque groupe ne le reçoit qu'une fois. */
  async create(dto: CreatePostDto, acting: CurrentUser | null = null) {
    const { groupIds, ...postData } = dto;
    const uniqueGroupIds = await postGroupIds(this.prisma, groupIds, acting);

    return this.prisma.post.create({
      data: {
        ...postData,
        ownerId: acting?.id ?? null,
        targets: {
          create: uniqueGroupIds.map((groupId) => ({ groupId })),
        },
      },
      include: { targets: true },
    });
  }

  async findAll(
    { page, limit, ...filters }: QueryPostsDto,
    acting: CurrentUser | null,
  ) {
    const where = this.buildWhere(filters, acting);
    const [data, total] = await this.prisma.$transaction([
      this.prisma.post.findMany({
        where,
        include: { targets: { include: { group: true } } },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.post.count({ where }),
    ]);
    return paginated(data, total, page, limit);
  }

  async findOne(id: string, acting: CurrentUser | null) {
    const post = await this.prisma.post.findFirst({
      where: { id, ...postWhere(scopeOf(acting)) },
      include: { profile: true, targets: { include: { group: true } } },
    });
    if (!post) throw new NotFoundException('Post introuvable');
    return post;
  }

  async update(id: string, dto: UpdatePostDto, acting: CurrentUser | null) {
    await this.reachable(id, acting);
    return this.prisma.post.update({ where: { id }, data: dto });
  }

  /** Un post qu'on n'a pas le droit de voir est introuvable, pas interdit :
   * répondre 403 confirmerait son existence. */
  private async reachable(id: string, acting: CurrentUser | null) {
    const post = await this.prisma.post.findFirst({
      where: { id, ...postWhere(scopeOf(acting)) },
      select: { id: true },
    });
    if (!post) throw new NotFoundException('Post introuvable');
    return post;
  }

  async remove(id: string, force = false, acting: CurrentUser | null = null) {
    await this.reachable(id, acting);
    const post = await this.prisma.post.findUniqueOrThrow({
      where: { id },
      select: { id: true, targets: this.activeClaimSelect() },
    });
    if (post.targets.length && !force) {
      throw new ConflictException(
        'Ce post est réservé par un automate en cours. Attendez la fin du ' +
          'job ou utilisez force=true pour le supprimer malgré tout.',
      );
    }
    return this.prisma.post.delete({ where: { id } });
  }

  /** Supprime tout ce qui correspond à la sélection ou aux filtres. Les posts
   * réservés par un job encore valide sont écartés par défaut : les effacer
   * ferait disparaître des publications qu'un automate est en train de
   * traiter, sans qu'il puisse le signaler. */
  async bulkRemove(dto: BulkDeletePostsDto, acting: CurrentUser | null = null) {
    const { dryRun, force, ...filters } = dto;
    if (!this.hasCriteria(filters)) {
      throw new BadRequestException(
        'Précisez au moins ids, profileId, groupId, articleId, status ou sourceType',
      );
    }
    const where = this.buildWhere(filters, acting);

    return this.prisma.$transaction(async (tx) => {
      const matched = await tx.post.count({ where });
      const claimed = await tx.post.findMany({
        where: {
          AND: [where, { targets: { some: this.activeClaimWhere() } }],
        },
        select: { id: true, title: true },
      });

      // `claimed` est un sous-ensemble de `matched` : la soustraction donne
      // exactement ce que le deleteMany va effacer.
      const blocked = force ? [] : claimed;
      if (dryRun || matched - blocked.length === 0) {
        return this.report(matched, 0, blocked, dryRun);
      }

      const { count } = await tx.post.deleteMany({
        where: blocked.length
          ? { AND: [where, { id: { notIn: blocked.map(({ id }) => id) } }] }
          : where,
      });
      return this.report(matched, count, blocked, dryRun);
    });
  }

  private report(
    matched: number,
    deleted: number,
    blocked: Array<{ id: string; title: string }>,
    dryRun: boolean,
  ) {
    return {
      dryRun,
      matched,
      deleted,
      blocked: blocked.length,
      blockedPosts: blocked,
    };
  }

  private hasCriteria(filters: PostFilters) {
    return Boolean(
      filters.ids?.length ||
      filters.profileId ||
      filters.groupId ||
      filters.articleId ||
      filters.status ||
      filters.sourceType,
    );
  }

  /** Point de passage unique des lectures de posts : la portée s'y pose une
   * fois. Elle s'ajoute aux filtres, jamais à leur place — un `profileId`
   * fourni par l'appelant ne doit pas élargir ce qu'il voit. */
  private buildWhere(
    filters: PostFilters,
    acting: CurrentUser | null,
  ): Prisma.PostWhereInput {
    // La portée et la recherche sont deux `OR` : réunis dans un `AND`, aucun
    // n'écrase l'autre.
    const scope = postWhere(scopeOf(acting));
    const and: Prisma.PostWhereInput[] = Object.keys(scope).length
      ? [scope]
      : [];
    const where: Prisma.PostWhereInput = {};
    if (filters.ids?.length) where.id = { in: [...new Set(filters.ids)] };
    if (filters.profileId) where.profileId = filters.profileId;
    if (filters.articleId) where.articleId = filters.articleId;
    if (filters.status) where.status = filters.status;
    if (filters.sourceType) where.sourceType = filters.sourceType;
    if (filters.groupId) where.targets = { some: { groupId: filters.groupId } };
    if (filters.search?.trim()) {
      const contains = filters.search.trim();
      and.push({
        OR: [
          { title: { contains, mode: 'insensitive' } },
          { description: { contains, mode: 'insensitive' } },
        ],
      });
    }
    if (and.length) where.AND = and;
    return where;
  }

  /** Une réservation expirée ne protège plus rien : le job l'a perdue. */
  private activeClaimWhere(): Prisma.PostTargetWhereInput {
    return { status: 'CLAIMED', claimExpiresAt: { gt: new Date() } };
  }

  private activeClaimSelect() {
    return { where: this.activeClaimWhere(), select: { id: true } } as const;
  }
}
