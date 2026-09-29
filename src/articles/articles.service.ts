import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { GenerateArticlePostsDto } from './dto/generate-article-posts.dto';
import { ImportArticleDto } from './dto/import-article.dto';
import { UpdateArticleDto } from './dto/update-article.dto';
import { PaginationDto } from '../common/dto/pagination.dto';
import { paginated } from '../common/paginated';
import type { CurrentUser } from '../auth/current-user';
import { articleWhere, scopeOf } from '../auth/scope';
import { postGroupIds } from '../posts/post-groups';
import { assertSafeRemoteUrl } from '../common/safe-fetch';

type SocialCaption = { text: string; angle?: string };
type ArticleRecord = {
  id: string;
  title: string;
  articleUrl: string;
  coverImageUrl: string | null;
  hashtags: string[];
  captions: Prisma.JsonValue;
};
type ArticlePayload = {
  id: string;
  title: string;
  slug: string;
  excerpt?: string;
  metaDescription?: string;
  articleUrl: string;
  coverImage?: string;
  course?: string;
  cuisine?: string;
  servings?: string;
  prepMinutes?: number;
  cookMinutes?: number;
  totalMinutes?: number;
  calories?: number;
  publishedAt?: string;
  socialPost: {
    captions: SocialCaption[];
    hashtags?: string[];
    imagePrompt?: string;
  };
};

@Injectable()
export class ArticlesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll({ page, limit }: PaginationDto, acting: CurrentUser | null) {
    const where = articleWhere(scopeOf(acting));
    const [data, total] = await this.prisma.$transaction([
      this.prisma.article.findMany({
        where,
        include: { source: true, _count: { select: { posts: true } } },
        orderBy: { importedAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.article.count({ where }),
    ]);
    return paginated(data, total, page, limit);
  }

  async findOne(id: string, acting: CurrentUser | null) {
    const article = await this.prisma.article.findFirst({
      where: { id, ...articleWhere(scopeOf(acting)) },
      include: { source: true, posts: { include: { targets: true } } },
    });
    if (!article) throw new NotFoundException('Article introuvable');
    return article;
  }

  /** Un article hors de portée est introuvable, pas interdit : répondre 403
   * confirmerait son existence. */
  private async reachable(id: string, acting: CurrentUser | null) {
    const article = await this.prisma.article.findFirst({
      where: { id, ...articleWhere(scopeOf(acting)) },
      select: { id: true },
    });
    if (!article) throw new NotFoundException('Article introuvable');
    return article;
  }

  async update(id: string, dto: UpdateArticleDto, acting: CurrentUser | null) {
    await this.reachable(id, acting);
    return this.prisma.article.update({ where: { id }, data: dto });
  }

  async remove(id: string, acting: CurrentUser | null) {
    await this.reachable(id, acting);
    return this.prisma.article.delete({ where: { id } });
  }

  async import(dto: ImportArticleDto, acting: CurrentUser | null = null) {
    const normalizedJsonUrl = this.toJsonUrl(dto.jsonUrl);
    const jsonUrl = await assertSafeRemoteUrl(normalizedJsonUrl);
    const payload = await this.fetchPayload(jsonUrl);
    this.validatePayload(payload);

    const articleUrl = new URL(payload.articleUrl);
    if (
      articleUrl.protocol !== 'https:' ||
      articleUrl.origin !== jsonUrl.origin
    ) {
      throw new BadRequestException(
        'articleUrl doit utiliser HTTPS et appartenir au même site que jsonUrl',
      );
    }
    const coverImageUrl = payload.coverImage
      ? new URL(payload.coverImage, articleUrl.origin).toString()
      : undefined;
    const source = await this.prisma.contentSource.upsert({
      where: { originUrl: articleUrl.origin },
      create: {
        originUrl: articleUrl.origin,
        name: dto.sourceName?.trim() || articleUrl.hostname,
        ownerId: acting?.id ?? null,
      },
      update: dto.sourceName?.trim() ? { name: dto.sourceName.trim() } : {},
    });

    return this.prisma.article.upsert({
      where: {
        sourceId_externalId: { sourceId: source.id, externalId: payload.id },
      },
      create: {
        ...this.articleData(payload, jsonUrl.toString(), coverImageUrl),
        sourceId: source.id,
      },
      update: this.articleData(payload, jsonUrl.toString(), coverImageUrl),
      include: { source: true, _count: { select: { posts: true } } },
    });
  }

  async generatePosts(
    id: string,
    dto: GenerateArticlePostsDto,
    acting: CurrentUser | null = null,
  ) {
    await this.reachable(id, acting);
    if (dto.delayMin > dto.delayMax) {
      throw new BadRequestException(
        'delayMin doit être inférieur ou égal à delayMax',
      );
    }
    const article = await this.prisma.article.findUnique({ where: { id } });
    if (!article) throw new NotFoundException('Article introuvable');
    // Un article qui a déjà été publié a servi : en tirer d'autres posts
    // referait circuler le même contenu dans les mêmes groupes.
    if (article.archivedAt) {
      throw new ConflictException(
        'Cet article est archivé : ses posts ont commencé à être publiés, il ne sert plus',
      );
    }
    const groupIds = await postGroupIds(this.prisma, dto.groupIds, acting);

    const captions = this.captionsOf(article);
    if (!captions.length) {
      throw new BadRequestException(
        'Cet article ne contient aucune légende exploitable',
      );
    }
    return this.prisma.$transaction(
      captions.map((_, slot) => {
        const { profileId, sourceType, externalId, ...content } =
          this.postDataForSlot(article, slot, { ...dto, profileId: null });
        return this.prisma.post.upsert({
          where: { sourceType_externalId: { sourceType, externalId } },
          create: {
            ...content,
            profileId,
            ownerId: acting?.id ?? null,
            sourceType,
            externalId,
            targets: { create: groupIds.map((groupId) => ({ groupId })) },
          },
          update: {
            ...content,
            // Ne pas repartir de zéro : une cible déjà réservée ou publiée
            // porte l'historique d'un job, et la supprimer effacerait la
            // trace d'une publication bien réelle.
            targets: {
              deleteMany: { status: 'AVAILABLE', groupId: { notIn: groupIds } },
              createMany: {
                data: groupIds.map((groupId) => ({ groupId })),
                skipDuplicates: true,
              },
            },
          },
          include: { targets: true },
        });
      }),
    );
  }

  /** Les légendes d'un article sont un JSON libre : ne garder que celles qui
   * portent un texte publiable. */
  captionsOf(article: { captions: Prisma.JsonValue }): SocialCaption[] {
    const captions = article.captions as SocialCaption[] | null;
    return Array.isArray(captions)
      ? captions.filter((caption) => caption?.text)
      : [];
  }

  /** Un « slot » est la n-ième publication tirée d'un article pour un profil.
   * Passé le nombre de légendes, il boucle sur la première avec un suffixe de
   * variante : le même article peut donc réalimenter un groupe indéfiniment
   * sans casser l'unicité de `externalId`. */
  postDataForSlot(
    article: ArticleRecord,
    slot: number,
    dto: { profileId: string | null; delayMin: number; delayMax: number },
  ) {
    const captions = this.captionsOf(article);
    const caption = captions[slot % captions.length];
    const hashtags = article.hashtags.map((tag) => `#${tag.replace(/^#/, '')}`);
    return {
      articleId: article.id,
      profileId: dto.profileId,
      title: article.title,
      description: [caption.text, hashtags.join(' ')]
        .filter(Boolean)
        .join('\n\n'),
      url: article.articleUrl,
      imageUrl: article.coverImageUrl,
      delay: this.randomInt(dto.delayMin, dto.delayMax),
      sourceType: 'JSON' as const,
      externalId: this.slotExternalId(
        article.id,
        dto.profileId,
        slot,
        captions.length,
      ),
      socialAngle: caption.angle,
      rawData: caption as Prisma.InputJsonValue,
    };
  }

  /** Ce qu'un post reprend de son article, sans rien qui lui appartienne en
   * propre (profil, délai, identité) : de quoi réaligner un post existant
   * quand l'article change de titre, de texte ou d'image. */
  postContent(article: ArticleRecord, slot = 0) {
    const { profileId, delay, sourceType, externalId, ...content } =
      this.postDataForSlot(article, slot, {
        profileId: '',
        delayMin: 0,
        delayMax: 0,
      });
    return content;
  }

  /** La variante 0 garde le format historique : les posts déjà en base
   * restent reconnus par leur `externalId` et sont mis à jour, pas dupliqués. */
  slotExternalId(
    articleId: string,
    profileId: string | null,
    slot: number,
    captionCount: number,
  ) {
    const index = slot % captionCount;
    const variant = Math.floor(slot / captionCount);
    // Un post ouvert n'a pas de profil : `open` tient sa place, et l'unicité
    // garantit un seul post ouvert par légende d'article.
    const owner = profileId ?? 'open';
    return variant === 0
      ? `${articleId}:${owner}:${index}`
      : `${articleId}:${owner}:${index}:v${variant}`;
  }

  private articleData(
    payload: ArticlePayload,
    jsonUrl: string,
    coverImageUrl?: string,
  ) {
    return {
      externalId: payload.id,
      jsonUrl,
      title: payload.title,
      slug: payload.slug,
      excerpt: payload.excerpt,
      metaDescription: payload.metaDescription,
      articleUrl: payload.articleUrl,
      coverImageUrl,
      course: payload.course,
      cuisine: payload.cuisine,
      servings: payload.servings,
      prepMinutes: payload.prepMinutes,
      cookMinutes: payload.cookMinutes,
      totalMinutes: payload.totalMinutes,
      calories: payload.calories,
      publishedAt: payload.publishedAt
        ? new Date(payload.publishedAt)
        : undefined,
      captions: payload.socialPost.captions as Prisma.InputJsonValue,
      hashtags: payload.socialPost.hashtags ?? [],
      imagePrompt: payload.socialPost.imagePrompt,
      rawData: payload as unknown as Prisma.InputJsonValue,
      importedAt: new Date(),
    };
  }

  private async fetchPayload(url: URL): Promise<ArticlePayload> {
    let response: Response;
    try {
      response = await fetch(url, {
        signal: AbortSignal.timeout(10_000),
        headers: { accept: 'application/json' },
      });
    } catch {
      throw new BadGatewayException(
        'Impossible de contacter la source de l’article',
      );
    }
    if (!response.ok) {
      throw new BadGatewayException(
        `La source a répondu avec le statut ${response.status}`,
      );
    }
    const length = Number(response.headers.get('content-length') || 0);
    if (length > 1_000_000)
      throw new BadRequestException('Réponse JSON trop volumineuse');
    const text = await response.text();
    if (text.length > 1_000_000)
      throw new BadRequestException('Réponse JSON trop volumineuse');
    try {
      return JSON.parse(text) as ArticlePayload;
    } catch {
      throw new BadGatewayException('La source ne retourne pas un JSON valide');
    }
  }

  private validatePayload(payload: ArticlePayload) {
    if (
      !payload?.id ||
      !payload.title ||
      !payload.slug ||
      !payload.articleUrl ||
      !Array.isArray(payload.socialPost?.captions) ||
      !payload.socialPost.captions.length ||
      payload.socialPost.captions.some((caption) => !caption?.text)
    ) {
      throw new BadRequestException(
        'JSON incomplet : id, title, slug, articleUrl et socialPost.captions sont requis',
      );
    }
  }

  private toJsonUrl(value: string) {
    const url = new URL(value);
    const recipeMatch = url.pathname.match(/^\/recipes\/([^/]+)\/?$/);
    if (recipeMatch) {
      url.pathname = `/api/blog/${recipeMatch[1]}/post`;
      url.search = '';
      url.hash = '';
    }
    return url.toString();
  }

  private randomInt(min: number, max: number) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }
}
