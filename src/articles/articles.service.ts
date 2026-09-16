import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { isIP } from 'node:net';
import { lookup } from 'node:dns/promises';
import { PrismaService } from '../prisma/prisma.service';
import { GenerateArticlePostsDto } from './dto/generate-article-posts.dto';
import { ImportArticleDto } from './dto/import-article.dto';
import { UpdateArticleDto } from './dto/update-article.dto';
import { PaginationDto } from '../common/dto/pagination.dto';
import { paginated } from '../common/paginated';

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

  async findAll({ page, limit }: PaginationDto) {
    const [data, total] = await this.prisma.$transaction([
      this.prisma.article.findMany({
      include: { source: true, _count: { select: { posts: true } } },
      orderBy: { importedAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
      }),
      this.prisma.article.count(),
    ]);
    return paginated(data, total, page, limit);
  }

  findOne(id: string) {
    return this.prisma.article.findUniqueOrThrow({
      where: { id },
      include: { source: true, posts: { include: { targets: true } } },
    });
  }

  update(id: string, dto: UpdateArticleDto) {
    return this.prisma.article.update({ where: { id }, data: dto });
  }

  remove(id: string) {
    return this.prisma.article.delete({ where: { id } });
  }

  async import(dto: ImportArticleDto) {
    const normalizedJsonUrl = this.toJsonUrl(dto.jsonUrl);
    const jsonUrl = await this.assertSafeRemoteUrl(normalizedJsonUrl);
    const payload = await this.fetchPayload(jsonUrl);
    this.validatePayload(payload);

    const articleUrl = new URL(payload.articleUrl);
    if (articleUrl.protocol !== 'https:' || articleUrl.origin !== jsonUrl.origin) {
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

  async generatePosts(id: string, dto: GenerateArticlePostsDto) {
    if (dto.delayMin > dto.delayMax) {
      throw new BadRequestException('delayMin doit être inférieur ou égal à delayMax');
    }
    const article = await this.prisma.article.findUnique({ where: { id } });
    if (!article) throw new NotFoundException('Article introuvable');
    const groupIds = [...new Set(dto.groupIds)];
    const validGroups = await this.prisma.group.count({
      where: {
        id: { in: groupIds },
        profiles: { some: { profileId: dto.profileId, status: 'ACTIVE' } },
      },
    });
    if (validGroups !== groupIds.length) {
      throw new BadRequestException(
        'Tous les groupes doivent être associés au profil sélectionné',
      );
    }

    const captions = this.captionsOf(article);
    if (!captions.length) {
      throw new BadRequestException(
        'Cet article ne contient aucune légende exploitable',
      );
    }
    return this.prisma.$transaction(
      captions.map((_, slot) => {
        const { profileId, sourceType, externalId, ...content } =
          this.postDataForSlot(article, slot, dto);
        return this.prisma.post.upsert({
          where: { sourceType_externalId: { sourceType, externalId } },
          create: {
            ...content,
            profileId,
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
    dto: { profileId: string; delayMin: number; delayMax: number },
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

  /** La variante 0 garde le format historique : les posts déjà en base
   * restent reconnus par leur `externalId` et sont mis à jour, pas dupliqués. */
  slotExternalId(
    articleId: string,
    profileId: string,
    slot: number,
    captionCount: number,
  ) {
    const index = slot % captionCount;
    const variant = Math.floor(slot / captionCount);
    return variant === 0
      ? `${articleId}:${profileId}:${index}`
      : `${articleId}:${profileId}:${index}:v${variant}`;
  }

  private articleData(payload: ArticlePayload, jsonUrl: string, coverImageUrl?: string) {
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
      publishedAt: payload.publishedAt ? new Date(payload.publishedAt) : undefined,
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
      throw new BadGatewayException('Impossible de contacter la source de l’article');
    }
    if (!response.ok) {
      throw new BadGatewayException(`La source a répondu avec le statut ${response.status}`);
    }
    const length = Number(response.headers.get('content-length') || 0);
    if (length > 1_000_000) throw new BadRequestException('Réponse JSON trop volumineuse');
    const text = await response.text();
    if (text.length > 1_000_000) throw new BadRequestException('Réponse JSON trop volumineuse');
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

  private async assertSafeRemoteUrl(value: string) {
    const url = new URL(value);
    if (url.protocol !== 'https:') {
      throw new BadRequestException('Seules les sources HTTPS sont acceptées');
    }
    let addresses: Array<{ address: string; family: number }>;
    try {
      addresses = await lookup(url.hostname, { all: true });
    } catch {
      throw new BadGatewayException(
        'Le nom de domaine de la source est temporairement inaccessible',
      );
    }
    if (!addresses.length || addresses.some(({ address }) => this.isPrivateIp(address))) {
      throw new BadRequestException('Les adresses locales ou privées sont interdites');
    }
    return url;
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

  private isPrivateIp(address: string) {
    if (!isIP(address)) return true;
    const normalized = address.toLowerCase();
    return (
      normalized === '::1' ||
      normalized.startsWith('fc') ||
      normalized.startsWith('fd') ||
      normalized.startsWith('fe80:') ||
      normalized.startsWith('127.') ||
      normalized.startsWith('10.') ||
      normalized.startsWith('192.168.') ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(normalized) ||
      /^169\.254\./.test(normalized)
    );
  }

  private randomInt(min: number, max: number) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }
}
