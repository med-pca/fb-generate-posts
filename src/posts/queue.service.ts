import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, TargetStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { CurrentUser } from '../auth/current-user';
import { postWhere, scopeOf } from '../auth/scope';
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

/** La file de publication, vue cible par cible (un post × un groupe) : c'est
 * l'unité que les automates consomment — un post qui vise trois groupes
 * part trois fois, chaque fois par le profil qui a rejoint ce groupe.
 *
 *   - en cours   : réservées par un automate (ou prises, pas encore confirmées)
 *   - à venir    : dans l'ordre exact où elles seront réservées
 *   - publiées   : quand, dans quel groupe, par quel profil, et le lien
 */
@Injectable()
export class QueueService {
  constructor(private readonly prisma: PrismaService) {}

  async queue(query: QueueQueryDto, acting: CurrentUser | null) {
    const now = new Date();
    const scope = postWhere(scopeOf(acting));
    const group: Prisma.GroupWhereInput = {
      ...(query.categoryId ? { categoryId: query.categoryId } : {}),
    };
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

    const [runningRows, upcomingRows, publishedRows, counts] =
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
          orderBy: [
            { post: { priority: 'desc' } },
            { post: { createdAt: 'asc' } },
            { createdAt: 'asc' },
          ],
          take: query.limit,
          select: {
            id: true,
            post: { select: POST_FIELDS },
            group: {
              select: {
                ...GROUP_FIELDS,
                // Qui pourra le publier : les profils qui ont rejoint le groupe.
                profiles: {
                  where: { status: 'ACTIVE', joinStatus: 'JOINED' },
                  select: { profile: { select: PROFILE_FIELDS } },
                },
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
        ]),
      ]);

    return {
      counts: { running: counts[0], upcoming: counts[1], published: counts[2] },
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
        group: { ...row.group, profiles: undefined },
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
