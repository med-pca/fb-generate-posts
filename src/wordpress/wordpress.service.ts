import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import {
  IngestStatus,
  PluginState,
  PostStatus,
  Prisma,
  Role,
  TargetStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ArticlesService } from '../articles/articles.service';
import { groupWhere } from '../auth/scope';
import { WordpressArticleDto } from './wordpress.dto';

/** Le post d'un article dans un groupe : un seul par couple article ×
 * groupe, garanti par l'unicité de `externalId`. */
export function groupPostExternalId(articleId: string, groupId: string) {
  return `${articleId}:group:${groupId}`;
}

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

/** La légende du post d'origine part telle quelle : c'est elle qui a
 * fonctionné, et le but de la reprise est de reproduire la publication. Seul
 * le lien est retiré — celui d'origine renverrait vers le site repris, alors
 * que le nouveau arrive plus tard, dans le commentaire. Hashtags et emojis
 * restent : ils font partie du texte. */
export function facebookCaption(text: string) {
  return text
    .replace(/(?:https?:\/\/|www\.)\S+/gi, '')
    .replace(/[^\S\n]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Ce qu'une reprise impose à la fiche : la publication d'origine reprend son
 * texte, mot pour mot. L'article, lui, a été réécrit — c'est la seule chose
 * qui change. La légende réécrite ne sert que de secours, quand la collecte
 * n'a rapporté aucun texte. */
export function ingestArticleFields(
  fields: ReturnType<typeof wordpressArticleFields>,
  ingest: {
    fbCaption?: string | null;
    generated?: { caption?: string; hashtags?: string[] } | null;
  } | null,
) {
  const original = facebookCaption(ingest?.fbCaption ?? '');
  const fallback = ingest?.generated?.caption ?? '';
  const text = original || fallback;
  if (!text) return fields;
  return {
    ...fields,
    captions: [{ text, angle: original ? 'facebook' : 'facebook-fallback' }],
    // Rien n'est accolé à la légende d'origine : y ajouter des mots-clés la
    // changerait, et c'est précisément ce qu'on veut éviter.
    hashtags: original ? [] : (ingest?.generated?.hashtags ?? []),
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

  /** La réception, tracée dans les journaux (domaine « Synchronisation ») :
   * reçu, mis à jour, reçu sans post, ou refusé. C'est là qu'on cherche
   * pourquoi un article publié sur WordPress n'a pas donné de post. */
  async publish(dto: WordpressArticleDto) {
    // Un site désactivé : l'article est ignoré pour de bon, avant tout le
    // reste — ni article, ni post, ni mise à jour, ni reprise refermée.
    const ignored = await this.ignoreIfPaused(dto);
    if (ignored) return ignored;

    let result: Awaited<ReturnType<WordpressService['receive']>>;
    try {
      result = await this.receive(dto);
    } catch (error) {
      await this.trace('WORDPRESS_ARTICLE_REJECTED', 'ERROR', dto, {
        message: `« ${dto.title} » refusé : ${error instanceof Error ? error.message : String(error)}`,
      });
      throw error;
    }
    if (!result.duplicate) {
      const noPost =
        result.noPost === 'no_category'
          ? 'le site n’a pas de catégorie'
          : 'aucun groupe actif dans la catégorie du site';
      await this.trace(
        result.generated ? 'WORDPRESS_ARTICLE_RECEIVED' : 'WORDPRESS_ARTICLE_NO_POST',
        result.generated ? 'INFO' : 'WARN',
        dto,
        {
          message: result.generated
            ? `« ${dto.title} » reçu de ${dto.siteName} : ${result.generated} post(s), un par groupe`
            : `« ${dto.title} » reçu de ${dto.siteName} sans post : ${noPost}`,
          articleId: result.articleId,
        },
      );
    } else if (result.updated) {
      await this.trace('WORDPRESS_ARTICLE_UPDATED', 'INFO', dto, {
        message: `« ${dto.title} » modifié sur ${dto.siteName} : ${result.synchronized} post(s) réalignés`,
        articleId: result.articleId,
      });
    }
    return result;
  }

  /** Pendant qu'un site est désactivé, ses articles ne sont PAS pris, et ne
   * le seront pas après : à la réactivation, seuls les articles suivants
   * sont créés.
   *
   * La réponse est un succès pour le plugin : il marque l'article envoyé et
   * cesse de le renvoyer. L'article est retenu comme ignoré, parce que
   * WordPress le renverrait à sa prochaine modification — et il serait
   * alors créé après coup.
   *
   * Un article déjà reçu AVANT la désactivation n'est pas mis à jour
   * pendant la pause, mais n'est pas oublié : il reste un article du site. */
  private async ignoreIfPaused(dto: WordpressArticleDto) {
    let siteUrl: string;
    try {
      const site = new URL(dto.siteUrl);
      siteUrl = site.origin + site.pathname.replace(/\/+$/, '');
    } catch {
      return null; // l'URL invalide sera refusée par la réception normale
    }
    const source = await this.prisma.contentSource.findUnique({
      where: { originUrl: siteUrl },
      select: { id: true, name: true, status: true },
    });
    if (!source) return null;
    const externalId = `wordpress:${dto.postId}`;
    const key = { sourceId_externalId: { sourceId: source.id, externalId } };
    const known = await this.prisma.ignoredArticle.findUnique({ where: key });
    const answer = (articleId: string, reason: string) => ({
      articleId,
      duplicate: false,
      updated: false,
      generated: 0,
      groups: 0,
      noPost: null as 'no_group' | 'no_category' | null,
      synchronized: 0,
      skipped: 0,
      ignored: true,
      reason,
    });

    if (known) {
      // Ignoré pendant une pause : il le reste, même une fois le site réactivé.
      return answer(`ignored:${known.id}`, 'ignored_while_inactive');
    }
    if (source.status !== 'INACTIVE') return null;

    const existing = await this.prisma.article.findUnique({
      where: key,
      select: { id: true },
    });
    if (existing) {
      await this.trace('WORDPRESS_SITE_INACTIVE', 'WARN', dto, {
        message: `« ${dto.title} » modifié sur ${source.name}, désactivé : modification non reprise`,
        articleId: existing.id,
      });
      return answer(existing.id, 'site_inactive_update_skipped');
    }
    const record = await this.prisma.ignoredArticle.upsert({
      where: key,
      create: {
        sourceId: source.id,
        externalId,
        title: dto.title.slice(0, 500),
        reason: 'site_inactive',
      },
      update: {},
    });
    await this.trace('WORDPRESS_SITE_INACTIVE', 'WARN', dto, {
      message: `« ${dto.title} » ignoré : ${source.name} est désactivé (il ne sera pas créé, même après réactivation)`,
    });
    return answer(`ignored:${record.id}`, 'site_inactive');
  }

  private trace(
    eventType: string,
    level: 'INFO' | 'WARN' | 'ERROR',
    dto: WordpressArticleDto,
    { message, ...extra }: { message: string } & Record<string, unknown>,
  ) {
    return this.prisma.activityLog
      .create({
        data: {
          eventType,
          level,
          message,
          metadata: {
            siteUrl: dto.siteUrl,
            siteName: dto.siteName,
            wordpressPostId: dto.postId,
            articleUrl: dto.articleUrl,
            ingestRef: dto.ingestRef ?? null,
            ...extra,
          } as Prisma.InputJsonValue,
        },
      })
      .catch(() => undefined);
  }

  private async receive(dto: WordpressArticleDto) {
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
      ingest && {
        fbCaption: ingest.fbCaption,
        generated: ingest.generated as {
          caption?: string;
          hashtags?: string[];
        } | null,
      },
    );
    return this.prisma.$transaction(
      async (tx) => {
        // Lock per site, including source creation, so simultaneous deliveries are atomic.
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${siteUrl}))`;
        // Recevoir un article prouve que l'extension du site est installée
        // et qu'elle nous parle : l'état est mis à jour sans attendre la
        // prochaine vérification. Un refus de clé déjà constaté reste
        // affiché — il concerne l'autre sens (nos dépôts vers le site).
        const received = {
          lastDeliveryAt: new Date(),
          pluginMessage: 'Article reçu de l’extension',
        };
        const known = await tx.contentSource.findUnique({
          where: { originUrl: siteUrl },
          select: { pluginState: true },
        });
        const source = await tx.contentSource.upsert({
          where: { originUrl: siteUrl },
          create: {
            originUrl: siteUrl,
            name: dto.siteName,
            pluginState: PluginState.CONNECTED,
            ...received,
          },
          update: this.deliveryState(known?.pluginState, received),
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
        // UN post par groupe de la catégorie, mêmes données partout : chaque
        // groupe a le sien, qui se priorise, se modifie et se retire seul.
        // L'identifiant `article:group:<groupe>` interdit un second exemplaire
        // du même article dans le même groupe, même si WordPress renvoie.
        const groupIds = await this.audience(tx, source, ingest?.groupIds);
        const noPost = groupIds.length
          ? null
          : source.categoryId
            ? ('no_group' as const)
            : ('no_category' as const);
        if (groupIds.length) {
          for (const groupId of groupIds) {
            await tx.post.create({
              data: {
                ...this.articles.postDataForSlot(article, 0, {
                  profileId: null,
                  delayMin: 10,
                  delayMax: 60,
                }),
                externalId: groupPostExternalId(article.id, groupId),
                ownerId: source.ownerId,
                targets: { create: { groupId } },
              },
            });
          }
        } else {
          this.logger.warn(
            `${source.name} : aucun groupe actif dans sa catégorie — ` +
              `article « ${article.title} » reçu sans post`,
          );
        }
        if (ingest) await this.closeIngest(tx, ingest.id, article.id);
        return {
          articleId: article.id,
          duplicate: false,
          updated: false,
          generated: groupIds.length,
          groups: groupIds.length,
          noPost,
          synchronized: 0,
          skipped: 0,
        };
      },
      { timeout: 30000 },
    );
  }

  /** Ce qu'une réception apprend de l'extension du site.
   *
   * Elle prouve que l'extension est installée et nous parle. Si la dernière
   * vérification n'a trouvé aucune route (`MISSING`), c'est donc une
   * ancienne version, qui envoie sans exposer de routes : `OUTDATED`. Un
   * refus de clé ou une ancienne version déjà constatés restent affichés —
   * une réception ne les corrige pas. */
  private deliveryState(
    known: PluginState | undefined,
    received: { lastDeliveryAt: Date; pluginMessage: string },
  ): Prisma.ContentSourceUpdateInput {
    if (known === PluginState.BAD_KEY || known === PluginState.OUTDATED) {
      return { lastDeliveryAt: received.lastDeliveryAt };
    }
    if (known === PluginState.MISSING) {
      return {
        pluginState: PluginState.OUTDATED,
        lastDeliveryAt: received.lastDeliveryAt,
        pluginMessage:
          'Ancienne extension : elle envoie ses articles, mais ne se laisse pas ' +
          'vérifier et ne reçoit pas les reprises. Installer la version 1.3.0.',
      };
    }
    return { pluginState: PluginState.CONNECTED, ...received };
  }

  /** Les groupes qui recevront le post d'un article.
   *
   * Une reprise qui a choisi ses groupes les garde. Sinon, ce sont les
   * groupes actifs de la catégorie du site, que son propriétaire peut
   * atteindre (les siens et ceux qu'on lui a partagés ; tous pour un site
   * sans propriétaire ou tenu par un ADMIN). Un site sans catégorie ne
   * diffuse nulle part : mieux vaut aucun post qu'un post dans le mauvais
   * public. */
  private async audience(
    tx: Prisma.TransactionClient,
    source: { categoryId: string | null; ownerId: string | null },
    chosen: string[] | undefined,
  ) {
    if (chosen?.length) {
      const groups = await tx.group.findMany({
        where: { id: { in: chosen }, status: 'ACTIVE' },
        select: { id: true },
      });
      return groups.map(({ id }) => id);
    }
    if (!source.categoryId) return [];
    const owner = source.ownerId
      ? await tx.user.findUnique({
          where: { id: source.ownerId },
          select: { id: true, role: true },
        })
      : null;
    const groups = await tx.group.findMany({
      where: {
        categoryId: source.categoryId,
        status: 'ACTIVE',
        ...(owner && owner.role !== Role.ADMIN
          ? groupWhere({ ownerId: owner.id })
          : {}),
      },
      select: { id: true },
    });
    return groups.map(({ id }) => id);
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
      groups: 0,
      noPost: null as 'no_group' | 'no_category' | null,
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
