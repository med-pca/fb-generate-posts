import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { IngestStatus, PostStatus, Prisma, TargetStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ArticlesService } from '../articles/articles.service';
import { WordpressArticleDto } from './wordpress.dto';

export function wordpressCaption(dto: WordpressArticleDto) {
  const clean = (value: string) =>
    value
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]*>/g, ' ')
      .replace(/(?:https?:\/\/|www\.)\S+/gi, '')
      .replace(/\s+/g, ' ')
      .trim();
  const text =
    clean(dto.excerpt || '') || clean(dto.content) || clean(dto.title);
  const excerpt =
    text.length > 280 ? text.slice(0, 277).replace(/\s+\S*$/, '') + '…' : text;
  return `${excerpt}\n\n📖 Read more on our website 👉 Link in the comments 👇`;
}

/** Tout ce qu'une réception WordPress (re)définit. Le reste de la fiche —
 * source, identifiant externe, slug, URL JSON — est fixé à la création. */
export function wordpressArticleFields(dto: WordpressArticleDto) {
  return {
    title: dto.title,
    articleUrl: dto.articleUrl,
    coverImageUrl: dto.imageUrl ?? null,
    excerpt: dto.excerpt ?? null,
    publishedAt: new Date(dto.publishedAt),
    captions: [{ text: wordpressCaption(dto), angle: 'wordpress' }],
    rawData: { ...dto },
  };
}

/** Ce qu'une reprise impose à la fiche : la légende réécrite pour Facebook
 * et ses mots-clés, au lieu de l'extrait automatique. Le reste de l'article —
 * titre, lien, image, date — vient de WordPress comme pour tout autre. */
export function ingestArticleFields(
  fields: ReturnType<typeof wordpressArticleFields>,
  generated: { caption?: string; hashtags?: string[] } | null,
) {
  if (!generated?.caption) return fields;
  return {
    ...fields,
    captions: [{ text: generated.caption, angle: 'facebook' }],
    hashtags: Array.isArray(generated.hashtags) ? generated.hashtags : [],
  };
}

type ArticleFields = ReturnType<typeof wordpressArticleFields> & {
  hashtags?: string[];
};
/** La fiche en base, réduite à ce que la synchronisation lit et réécrit. */
type StoredArticle = {
  id: string;
  title: string;
  articleUrl: string;
  coverImageUrl: string | null;
  excerpt: string | null;
  publishedAt: Date | null;
  captions: Prisma.JsonValue;
  hashtags: string[];
};

@Injectable()
export class WordpressService {
  private readonly logger = new Logger(WordpressService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly articles: ArticlesService,
  ) {}

  async publish(dto: WordpressArticleDto) {
    const site = new URL(dto.siteUrl);
    const articleUrl = new URL(dto.articleUrl);
    if (
      site.username ||
      site.password ||
      site.search ||
      site.hash ||
      articleUrl.username ||
      articleUrl.password ||
      site.origin !== articleUrl.origin
    ) {
      throw new BadRequestException(
        'Le site et l’article doivent appartenir au même domaine, sans identifiants dans les URL',
      );
    }
    const siteUrl = site.origin + site.pathname.replace(/\/+$/, '');
    const externalId = `wordpress:${dto.postId}`;
    const ingest = await this.ingestFor(dto, siteUrl);
    const fields = ingestArticleFields(
      wordpressArticleFields(dto),
      ingest?.generated as { caption?: string; hashtags?: string[] } | null,
    );
    return this.prisma.$transaction(
      async (tx) => {
        // Lock per site, including source creation, so simultaneous deliveries are atomic.
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${siteUrl}))`;
        const source = await tx.contentSource.upsert({
          where: { originUrl: siteUrl },
          create: { originUrl: siteUrl, name: dto.siteName },
          update: {},
        });
        const existing = await tx.article.findUnique({
          where: { sourceId_externalId: { sourceId: source.id, externalId } },
        });
        if (existing) {
          // Un renvoi identique ne touche rien, mais il doit quand même
          // refermer la reprise : sans cela elle resterait en attente.
          if (ingest) await this.closeIngest(tx, ingest.id, existing.id);
          return this.synchronize(tx, existing, fields);
        }
        const article = await tx.article.create({
          data: {
            sourceId: source.id,
            externalId,
            slug: externalId,
            jsonUrl: `${siteUrl}/?rest_route=/wp/v2/posts/${dto.postId}`,
            hashtags: [],
            ...fields,
          },
        });
        const profiles = await tx.profile.findMany({
          where: {
            status: 'ACTIVE',
            ...(ingest?.profileIds.length
              ? { id: { in: ingest.profileIds } }
              : {}),
          },
          include: {
            profileGroups: {
              where: {
                status: 'ACTIVE',
                group: { status: 'ACTIVE' },
                ...(ingest?.groupIds.length
                  ? { groupId: { in: ingest.groupIds } }
                  : {}),
              },
            },
          },
        });
        for (const profile of profiles) {
          await tx.post.create({
            data: {
              ...this.articles.postDataForSlot(article, 0, {
                profileId: profile.id,
                delayMin: 10,
                delayMax: 60,
              }),
              targets: {
                create: profile.profileGroups.map(({ groupId }) => ({
                  groupId,
                })),
              },
            },
          });
        }
        if (ingest) await this.closeIngest(tx, ingest.id, article.id);
        return {
          articleId: article.id,
          duplicate: false,
          updated: false,
          generated: profiles.length,
          synchronized: 0,
          skipped: 0,
        };
      },
      { timeout: 30000 },
    );
  }

  /** La reprise que le plugin annonce, si elle attend bien ce dépôt. Une
   * référence inconnue, déjà refermée ou venue d'un autre site est ignorée :
   * l'article est reçu normalement, et la réception ne casse pas pour
   * autant. */
  private async ingestFor(dto: WordpressArticleDto, siteUrl: string) {
    if (!dto.ingestRef) return null;
    const ingest = await this.prisma.sourceIngest.findUnique({
      where: { id: dto.ingestRef },
    });
    if (!ingest) {
      this.logger.warn(`Reprise ${dto.ingestRef} inconnue : article reçu seul`);
      return null;
    }
    if (ingest.siteUrl !== siteUrl) {
      this.logger.warn(
        `Reprise ${dto.ingestRef} rattachée à ${ingest.siteUrl}, dépôt reçu de ${siteUrl}`,
      );
      return null;
    }
    return ingest;
  }

  /** Referme la reprise sur l'article produit. `articleId` est unique : une
   * reprise déjà rattachée à un autre article ne se laisse pas réécrire, ce
   * qui rend un renvoi inattendu inoffensif. */
  private async closeIngest(
    tx: Prisma.TransactionClient,
    ingestId: string,
    articleId: string,
  ) {
    const { count } = await tx.sourceIngest.updateMany({
      where: { id: ingestId, OR: [{ articleId: null }, { articleId }] },
      data: { articleId, status: IngestStatus.COMPLETED, lastError: null },
    });
    if (!count) {
      this.logger.warn(
        `Reprise ${ingestId} déjà rattachée à un autre article : rattachement ignoré`,
      );
    }
  }

  /** Un article déjà reçu n'est jamais recréé : on réaligne sa fiche, puis le
   * titre, le texte et l'image des posts qui peuvent encore changer. Une
   * réception à l'identique (renvoi réseau, retouche sans effet éditorial) ne
   * touche rien. */
  private async synchronize(
    tx: Prisma.TransactionClient,
    existing: StoredArticle,
    fields: ArticleFields,
  ) {
    const unchanged = {
      articleId: existing.id,
      duplicate: true,
      updated: false,
      generated: 0,
      synchronized: 0,
      skipped: 0,
    };
    if (!this.hasChanges(existing, fields)) return unchanged;
    const article = await tx.article.update({
      where: { id: existing.id },
      data: fields,
    });
    const { count } = await tx.post.updateMany({
      where: this.syncablePosts(article.id),
      data: this.articles.postContent(article),
    });
    const total = await tx.post.count({ where: { articleId: article.id } });
    return {
      ...unchanged,
      updated: true,
      synchronized: count,
      skipped: total - count,
    };
  }

  private hasChanges(existing: StoredArticle, fields: ArticleFields) {
    const [caption] = this.articles.captionsOf(existing);
    return (
      existing.title !== fields.title ||
      existing.articleUrl !== fields.articleUrl ||
      existing.coverImageUrl !== fields.coverImageUrl ||
      existing.excerpt !== fields.excerpt ||
      existing.publishedAt?.getTime() !== fields.publishedAt.getTime() ||
      caption?.text !== fields.captions[0].text ||
      // Les mots-clés d'une reprise font partie du texte publié : les
      // oublier ici laisserait un post avec les anciens hashtags.
      (fields.hashtags !== undefined &&
        existing.hashtags.join(' ') !== fields.hashtags.join(' '))
    );
  }

  /** Ce qui reste réécrivable : un post réservé par un job en cours est en
   * train d'être publié avec son texte actuel, et un post dont toutes les
   * cibles sont parties est l'archive de ce qui a été diffusé. Entre les deux,
   * tout ce qui attend encore une publication reçoit la dernière version. */
  private syncablePosts(articleId: string): Prisma.PostWhereInput {
    return {
      articleId,
      status: { not: PostStatus.ARCHIVED },
      targets: {
        none: {
          status: TargetStatus.CLAIMED,
          claimExpiresAt: { gt: new Date() },
        },
      },
      OR: [
        { targets: { none: {} } },
        {
          targets: {
            some: {
              // Une réservation expirée repassera en AVAILABLE : ce post
              // sert encore.
              status: { in: [TargetStatus.AVAILABLE, TargetStatus.CLAIMED] },
            },
          },
        },
      ],
    };
  }
}
