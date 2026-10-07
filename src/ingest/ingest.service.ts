import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
  Optional,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IngestStatus, Prisma, SourceIngest } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { CurrentUser } from '../auth/current-user';
import { normalizeSiteUrl, pluginBlocker } from '../sites/sites.service';
import { ingestWhere, scopeOf } from '../auth/scope';
import { PaginationDto } from '../common/dto/pagination.dto';
import { paginated } from '../common/paginated';
import { CaptureIngestDto } from './dto/capture-ingest.dto';
import { CreateIngestDto } from './dto/create-ingest.dto';
import { ScrapeResultDto } from './dto/scrape-result.dto';
import { GeneratedArticle, RewriterService, writingLanguage } from './rewriter.service';
import { SourceReaderService } from './source-reader.service';
import { WordpressWriterService } from './wordpress-writer.service';
import { WordpressService } from '../wordpress/wordpress.service';
import { isOnSite } from '../wordpress/article-url';
import { NewsService, headlinesText } from './news.service';
import { ImageTranslatorService, languageName } from './image-translator.service';
import { VisualsService } from '../visuals/visuals.service';

/** Passé ce nombre d'échecs, la reprise cesse de se relancer seule : une
 * erreur qui revient cinq fois demande qu'on la regarde. */
const MAX_ATTEMPTS = 5;

/** Ce qu'une extension reçoit pour aller relever une publication. */
export type ClaimedScrape = {
  scrapeId: string;
  facebookUrl: string;
  claimExpiresAt: Date;
};

/** L'étape à reprendre, déduite de ce qui est déjà en base. Une reprise
 * abandonnée ne perd donc pas le travail déjà payé : ni la lecture de la
 * page, ni la réécriture ne sont refaites. */
export function resumeStatus(ingest: {
  generated: Prisma.JsonValue | null;
  sourceText: string | null;
  fbCaption: string | null;
}): IngestStatus {
  if (ingest.generated) return IngestStatus.REWRITTEN;
  if (ingest.sourceText) return IngestStatus.REWRITING;
  if (ingest.fbCaption) return IngestStatus.SCRAPED;
  return IngestStatus.PENDING_SCRAPE;
}

/** Le renvoi du plugin attendu au plus ce temps après le dépôt ; ensuite le
 * serveur va chercher l'article lui-même. */
const ECHO_GRACE_MS = 2 * 60_000;
/** Au-delà, on cesse de relire tout seul (le bouton « Relancer » le refait). */
const MAX_PULLS = 10;

@Injectable()
export class IngestService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(IngestService.name);
  /** Deux avancées simultanées sur la même reprise paieraient deux fois la
   * réécriture. Le verrou ne vaut que dans ce processus, comme le minuteur
   * d'alimentation. */
  private readonly running = new Set<string>();
  private pullTimer?: NodeJS.Timeout;
  private pulling = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly reader: SourceReaderService,
    private readonly rewriter: RewriterService,
    private readonly wordpress: WordpressWriterService,
    /** La réception WordPress : pour appliquer une capture à un article de
     * notre site déjà présent. Absente dans les tests qui ne s'en servent pas. */
    @Optional() private readonly site?: WordpressService,
    /** L'actualité du moment (mode « news »). */
    @Optional() private readonly news?: NewsService,
    /** La traduction du texte d'une image (mode « engagement »). */
    @Optional() private readonly imageTranslator?: ImageTranslatorService,
    /** Les visuels : le mode « engagement » en crée un. */
    @Optional() private readonly visuals?: VisualsService,
  ) {}

  async create(dto: CreateIngestDto, owner: CurrentUser | null = null) {
    const profileIds = [...new Set(dto.profileIds ?? [])];
    const groupIds = [...new Set(dto.groupIds ?? [])];
    let siteUrl: string;
    try {
      ({ siteUrl } = await this.resolveSite(dto.siteUrl));
      await this.assertScope(profileIds, groupIds);
    } catch (error) {
      // Refusée avant d'exister : sans cette trace, une capture rejetée par
      // l'extension ne laisserait rien à lire côté serveur.
      await this.prisma.activityLog
        .create({
          data: {
            eventType: 'INGEST_REJECTED',
            level: 'WARN',
            message: `Capture refusée : ${error instanceof Error ? error.message : String(error)}`,
            metadata: {
              facebookUrl: dto.facebookUrl,
              sourceUrl: dto.sourceUrl,
              siteUrl: dto.siteUrl ?? null,
              by: owner?.username ?? 'clé globale',
            },
          },
        })
        .catch(() => undefined);
      throw error;
    }
    const ingest = await this.prisma.sourceIngest.create({
      data: {
        facebookUrl: dto.facebookUrl,
        // Mode « news » : pas de site source, notre propre article.
        // Mode « engagement » : image traduite + description, sans article.
        mode: dto.mode ?? 'rewrite',
        targetLanguage: dto.mode === 'engagement' ? dto.targetLanguage ?? null : null,
        sourceUrl: dto.sourceUrl ?? '',
        siteUrl,
        // Nos articles d'actualité sont en anglais, sauf langue imposée.
        language: dto.mode === 'news' && (!dto.language || dto.language === 'auto') ? 'en' : dto.language,
        profileIds,
        groupIds,
        ownerId: owner?.id ?? null,
      },
    });
    await this.log(ingest.id, 'INGEST_CREATED', 'Reprise enregistrée', {
      facebookUrl: ingest.facebookUrl,
      sourceUrl: ingest.sourceUrl,
    });
    return ingest;
  }

  async findAll({ page, limit }: PaginationDto, acting: CurrentUser | null) {
    const where = ingestWhere(scopeOf(acting));
    const [data, total] = await this.prisma.$transaction([
      this.prisma.sourceIngest.findMany({
        where,
        include: {
          article: { select: { id: true, title: true, articleUrl: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.sourceIngest.count({ where }),
    ]);
    return paginated(data, total, page, limit);
  }

  /** `findUniqueOrThrow` remonterait une erreur Prisma, donc un 500 : une
   * fiche absente est un 404, pas une panne. */
  async findOne(id: string, acting: CurrentUser | null) {
    const ingest = await this.prisma.sourceIngest.findFirst({
      where: { id, ...ingestWhere(scopeOf(acting)) },
      include: { article: true },
    });
    if (!ingest) throw new NotFoundException('Reprise introuvable');
    return ingest;
  }

  async remove(id: string, acting: CurrentUser | null) {
    await this.load(id, acting);
    return this.prisma.sourceIngest.delete({ where: { id } });
  }

  /** Enregistre une reprise déjà collectée, en un seul appel. C'est le
   * chemin de l'extension : l'utilisateur est devant la publication, il a
   * décidé de la reprendre, et il n'y a rien à réserver ni à attendre. */
  async capture(dto: CaptureIngestDto, owner: CurrentUser | null = null) {
    const ingest = await this.create(dto, owner);
    return this.submitScrape(ingest.id, {
      caption: dto.caption,
      imageUrl: dto.imageUrl,
    });
  }

  /** Confie une collecte à une extension. Une réservation expirée revient
   * d'elle-même dans la file : pas de balayage séparé à maintenir, et une
   * extension qui disparaît en cours de route ne bloque rien.
   *
   * `SKIP LOCKED` fait le reste : deux extensions qui interrogent en même
   * temps repartent avec deux reprises différentes. */
  async claimScrape(
    profileExternalId?: string,
    acting: CurrentUser | null = null,
  ) {
    const ttlMinutes = this.config.get<number>('CLAIM_TTL_MINUTES', 30);
    const claimExpiresAt = new Date(Date.now() + ttlMinutes * 60_000);
    const claimed = await this.prisma.$transaction(async (tx) => {
      // Un compte ne réserve que ses propres collectes ; la clé globale les
      // voit toutes.
      const mine = scopeOf(acting);
      const [row] = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
        SELECT id FROM source_ingests
        WHERE (status = 'PENDING_SCRAPE'::"IngestStatus"
               OR (status = 'SCRAPING'::"IngestStatus" AND claim_expires_at < NOW()))
          AND (${mine === null} OR owner_id = ${mine?.ownerId ?? null})
        ORDER BY created_at
        FOR UPDATE SKIP LOCKED
        LIMIT 1
      `);
      if (!row) return null;
      return tx.sourceIngest.update({
        where: { id: row.id },
        data: {
          status: IngestStatus.SCRAPING,
          claimedAt: new Date(),
          claimExpiresAt,
        },
      });
    });
    if (!claimed) {
      return { scrape: null, message: 'Aucune collecte en attente' };
    }
    await this.log(claimed.id, 'INGEST_SCRAPE_CLAIMED', 'Collecte réservée', {
      profileExternalId: profileExternalId ?? null,
    });
    return {
      scrape: {
        scrapeId: claimed.id,
        facebookUrl: claimed.facebookUrl,
        claimExpiresAt: claimed.claimExpiresAt as Date,
      } satisfies ClaimedScrape,
    };
  }

  /** L'extension n'a pas pu relever la publication. La reprise retourne dans
   * la file : le compte suivant, ou le même plus tard, réessaiera. */
  async failScrape(
    id: string,
    error: string,
    acting: CurrentUser | null = null,
  ) {
    const ingest = await this.load(id, acting);
    const attempts = ingest.attempts + 1;
    const exhausted = attempts >= MAX_ATTEMPTS;
    await this.log(id, 'INGEST_FAILED', error, {
      stage: IngestStatus.PENDING_SCRAPE,
      attempts,
      exhausted,
    });
    return this.prisma.sourceIngest.update({
      where: { id },
      data: {
        attempts,
        lastError: error,
        status: exhausted ? IngestStatus.FAILED : IngestStatus.PENDING_SCRAPE,
        claimedAt: null,
        claimExpiresAt: null,
      },
    });
  }

  /** Dépose ce que l'extension — ou un administrateur — a relevé sur la
   * publication d'origine. N'enchaîne pas : l'appelant décide s'il attend la
   * suite ou non. */
  async submitScrape(
    id: string,
    dto: ScrapeResultDto,
    acting?: CurrentUser | null,
  ) {
    const ingest = await this.load(id, acting);
    if (
      ingest.status !== IngestStatus.PENDING_SCRAPE &&
      ingest.status !== IngestStatus.SCRAPING &&
      ingest.status !== IngestStatus.FAILED
    ) {
      throw new BadRequestException(
        `Cette reprise a dépassé l’étape de collecte (${ingest.status})`,
      );
    }
    await this.log(id, 'INGEST_SCRAPED', 'Publication d’origine relevée', {
      hasImage: Boolean(dto.imageUrl),
      captionLength: dto.caption.length,
    });
    return this.prisma.sourceIngest.update({
      where: { id },
      data: {
        fbCaption: dto.caption,
        fbImageUrl: dto.imageUrl ?? null,
        status: IngestStatus.SCRAPED,
        claimedAt: null,
        claimExpiresAt: null,
        lastError: null,
      },
    });
  }

  /** Remet une reprise abandonnée à l'étape que ses données permettent, puis
   * la relance. Le compteur repart de zéro : c'est une décision humaine. */
  onModuleInit() {
    const raw = Number(this.config.get<string>('ECHO_PULL_INTERVAL_MINUTES') ?? 2);
    const minutes = Number.isFinite(raw) && raw >= 0 ? raw : 2;
    if (!minutes || !this.site) return;
    this.pullTimer = setInterval(() => void this.pullStaleEchoes().catch(() => undefined), minutes * 60_000);
    this.pullTimer.unref?.();
  }

  onModuleDestroy() {
    if (this.pullTimer) clearInterval(this.pullTimer);
  }

  /** Les reprises déposées dont WordPress n'a pas renvoyé l'article : le
   * plugin compte sur WP-Cron, qui ne passe qu'à la visite du site — un site
   * peu visité, ou WP-Cron désactivé, laissait l'article sans post. Chaque
   * essai raté espace le suivant (2, 4, 8… min, au plus 1 h). */
  async pullStaleEchoes(now = new Date()) {
    if (this.pulling || !this.site) return [];
    this.pulling = true;
    try {
      const waiting = await this.prisma.sourceIngest.findMany({
        where: {
          status: IngestStatus.AWAITING_ECHO,
          articleId: null,
          OR: [{ wpPostId: { not: null } }, { wpPermalink: { not: null } }],
          updatedAt: { lt: new Date(now.getTime() - ECHO_GRACE_MS) },
        },
        orderBy: { updatedAt: 'asc' },
        take: 20,
      });
      const done: string[] = [];
      for (const ingest of waiting) {
        const pulls = Number((ingest.lastError || '').match(/\[essai (\d+)\]/)?.[1] ?? 0);
        if (pulls >= MAX_PULLS) continue;
        const wait = Math.min(60, 2 * 2 ** pulls) * 60_000;
        if (now.getTime() - ingest.updatedAt.getTime() < wait) continue;
        if (await this.pullEcho(ingest, pulls)) done.push(ingest.id);
      }
      return done;
    } finally {
      this.pulling = false;
    }
  }

  /** Va chercher l'article sur le site et le reçoit comme si le plugin
   * l'avait envoyé : article, posts, description Facebook, reprise refermée.
   * Si le plugin l'envoie plus tard, ce renvoi ne change rien (même article). */
  private async pullEcho(ingest: SourceIngest, pulls = 0) {
    if (!this.site) return false;
    try {
      const source = await this.prisma.contentSource.findUnique({ where: { originUrl: ingest.siteUrl } });
      if (!source) throw new Error(`Site inconnu : ${ingest.siteUrl}`);
      const slug = !ingest.wpPostId && ingest.wpPermalink
        ? new URL(ingest.wpPermalink).pathname.split('/').filter(Boolean).pop() ?? null
        : null;
      const article = await this.wordpress.fetchArticle({
        siteUrl: ingest.siteUrl,
        siteName: source.name,
        apiKey: source.depositKey,
        postId: ingest.wpPostId,
        slug,
      });
      const result = await this.site.publish({ ...article, ingestRef: ingest.id } as never);
      await this.log(
        ingest.id,
        'INGEST_PULLED',
        `Article « ${article.title} » relu directement sur WordPress : le plugin ne l’avait pas renvoyé ` +
          '(WP-Cron qui ne passe pas, ou URL/clé de réception à vérifier dans Réglages → Data FB Posting)',
        { result: result as unknown as Record<string, unknown> },
      );
      return true;
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      await this.prisma.sourceIngest.update({
        where: { id: ingest.id },
        data: { lastError: `[essai ${pulls + 1}] Renvoi WordPress attendu, relecture impossible : ${reason}` },
      });
      await this.log(ingest.id, 'INGEST_ECHO_MISSING', `L’article n’est pas revenu de WordPress, et le serveur n’a pas pu le relire : ${reason}`, {
        attempt: pulls + 1,
      });
      return false;
    }
  }

  async retry(id: string, acting: CurrentUser | null) {
    const ingest = await this.load(id, acting);
    // Déjà déposé sur WordPress : relancer, c'est aller relire l'article —
    // surtout pas le redéposer (doublon sur le site).
    if (ingest.status === IngestStatus.AWAITING_ECHO && (ingest.wpPostId || ingest.wpPermalink)) {
      await this.pullEcho(ingest);
      return this.load(id);
    }
    await this.prisma.sourceIngest.update({
      where: { id },
      data: {
        status: resumeStatus(ingest),
        attempts: 0,
        lastError: null,
      },
    });
    return this.advance(id);
  }

  /** Fait avancer la reprise aussi loin que l'état le permet, étape par
   * étape. Chaque étape est enregistrée avant la suivante : une panne
   * reprend là où elle s'est arrêtée, sans refaire ce qui est payé. */
  async advance(id: string): Promise<SourceIngest> {
    if (this.running.has(id)) return this.load(id);
    this.running.add(id);
    try {
      let ingest = await this.load(id);
      for (;;) {
        const next = await this.step(ingest);
        // Une étape qui s'arrête a pu écrire son échec : relire plutôt que
        // rendre l'état d'avant, qui annoncerait une reprise en bonne santé.
        if (!next) return this.load(id);
        ingest = next;
      }
    } finally {
      this.running.delete(id);
    }
  }

  /** Une étape, ou `null` quand il n'y a plus rien à faire ici : la reprise
   * attend la collecte, elle est arrivée au bout de ce que cette version
   * sait faire, ou elle a trop échoué. */
  private async step(ingest: SourceIngest): Promise<SourceIngest | null> {
    switch (ingest.status) {
      case IngestStatus.SCRAPED:
        // Mode « engagement » : pas d'article — image traduite, description,
        // posts directs dans les groupes de la langue choisie.
        if (ingest.mode === 'engagement') {
          return this.guard(ingest, 'INGEST_ENGAGEMENT_READY', 'Posts « engagement » créés', () => this.engagement(ingest));
        }
        // Mode « news » : pas de site source — on relève l'actualité du
        // moment, à laquelle l'image sera rattachée.
        if (ingest.mode === 'news') {
          return this.guard(ingest, 'INGEST_NEWS_READ', 'Actualité du moment relevée', () => this.readNews(ingest));
        }
        // L'URL donnée est celle d'un article de NOTRE site : il existe déjà,
        // rien à lire ni à réécrire — seule sa description change.
        if (isOnSite(ingest.sourceUrl, ingest.siteUrl)) {
          return this.guard(ingest, 'INGEST_OWN_ARTICLE', 'Article de notre site : pas de réécriture', () =>
            this.useOwnArticle(ingest),
          );
        }
        return this.guard(ingest, 'INGEST_SOURCE_READ', 'Page source lue', () =>
          this.readSource(ingest),
        );
      case IngestStatus.REWRITING:
        if (ingest.mode === 'news') {
          return this.guard(ingest, 'INGEST_NEWS_WRITTEN', 'Article d’actualité écrit depuis l’image', () => this.writeFromNews(ingest));
        }
        return this.guard(ingest, 'INGEST_REWRITTEN', 'Article réécrit', () =>
          this.rewrite(ingest),
        );
      case IngestStatus.REWRITTEN:
        return this.guard(
          ingest,
          'INGEST_PUBLISHED',
          'Article déposé sur WordPress',
          () => this.publishToWordpress(ingest),
        );
      default:
        // PENDING_SCRAPE et SCRAPING attendent l'extension ; AWAITING_ECHO
        // attend le renvoi du plugin, qui referme la boucle ; le reste est
        // terminé ou abandonné.
        return null;
    }
  }

  /** Une étape qui échoue ne fait pas perdre l'état : le statut reste celui
   * de l'étape à refaire, et seul le compteur monte. Au bout du compte, la
   * reprise passe en FAILED et n'est plus relancée toute seule. */
  private async guard(
    ingest: SourceIngest,
    event: string,
    message: string,
    run: () => Promise<SourceIngest>,
  ) {
    try {
      const updated = await run();
      await this.log(ingest.id, event, message);
      return updated;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Erreur inconnue';
      const attempts = ingest.attempts + 1;
      const exhausted = attempts >= MAX_ATTEMPTS;
      this.logger.error(`Reprise ${ingest.id} en échec : ${message}`);
      await this.prisma.sourceIngest.update({
        where: { id: ingest.id },
        data: {
          attempts,
          lastError: message,
          ...(exhausted ? { status: IngestStatus.FAILED } : {}),
        },
      });
      await this.log(ingest.id, 'INGEST_FAILED', message, {
        stage: ingest.status,
        attempts,
        exhausted,
      });
      return null;
    }
  }

  private async readSource(ingest: SourceIngest) {
    const source = await this.reader.read(ingest.sourceUrl);
    // « auto » se résout ici, une fois pour toutes : la langue déclarée par
    // la page est enregistrée, donc une relance ne la redemande pas et la
    // fiche dit dans quelle langue l'article a été écrit.
    const resolved = writingLanguage(ingest.language, source.language, source.text);
    const pages = source.pages ?? source.pageUrls?.length ?? 1;
    await this.log(
      ingest.id,
      'INGEST_SOURCE_READ',
      (pages > 1
        ? `Article source lu sur ${pages} pages (${source.text.length} caractères)`
        : `Article source lu (${source.text.length} caractères)`) + (source.pageStop ? ` — ${source.pageStop}` : ''),
      { pages: source.pageUrls ?? [source.url], pageStop: source.pageStop ?? null },
    );
    return this.prisma.sourceIngest.update({
      where: { id: ingest.id },
      data: {
        sourceTitle: source.title,
        sourceText: source.text,
        language: resolved,
        status: IngestStatus.REWRITING,
        lastError: null,
      },
    });
  }

  /** Une langue demandée explicitement l'emporte : c'est une décision. Sinon
   * on prend celle de la page ; si elle n'en déclare aucune, « auto » reste,
   * et la consigne demandera au modèle de s'aligner sur les notes. */

  /** Le mode « engagement », d'un bout à l'autre :
   *   1. les groupes visés : actifs, de la langue choisie, de la catégorie du
   *      site (vérifié AVANT toute dépense d'IA) ;
   *   2. le texte de l'image, lu et traduit (modèle qui voit l'image) ;
   *   3. s'il y en a, une nouvelle image avec le texte traduit (l'IA d'image
   *      choisie dans Paramètres) ; sinon l'image d'origine ;
   *   4. la description « engagement » dans la langue (DeepSeek d'abord) ;
   *   5. un post ouvert, SANS lien ni commentaire, vers ces groupes. */
  private async engagement(ingest: SourceIngest) {
    const language = ingest.targetLanguage;
    if (!language) throw new Error('Mode engagement : langue cible absente');
    if (!ingest.fbImageUrl) throw new Error('Mode engagement : la capture n’a pas d’image');
    if (!this.visuals) throw new Error('Visuels indisponibles');
    const site = await this.prisma.contentSource.findUnique({ where: { originUrl: ingest.siteUrl }, select: { categoryId: true, ownerId: true } });
    const original = await this.wordpress.loadImage(ingest.fbImageUrl);
    // Le même parcours qu'une image importée : rubrique Articles → Visuels.
    const { visual, postId, groups } = await this.visuals.create({
      image: { data: original.data, mimeType: original.mimeType },
      language,
      translate: true,
      caption: null,
      fbCaption: ingest.fbCaption,
      categoryId: site?.categoryId ?? null,
      groupIds: ingest.groupIds,
      createPosts: true,
      origin: 'capture',
      ingestId: ingest.id,
      ownerId: ingest.ownerId ?? site?.ownerId ?? null,
    });
    await this.log(ingest.id, 'INGEST_ENGAGEMENT_DETAIL', `Visuel « ${visual.title} » en ${languageName(language)} : ${groups} groupe(s)`, {
      visualId: visual.id,
      postId,
    });
    return this.prisma.sourceIngest.update({
      where: { id: ingest.id },
      data: {
        generated: { mode: 'engagement', visualId: visual.id, postId, title: visual.title, caption: visual.caption, imageUrl: visual.imageUrl } as unknown as Prisma.InputJsonValue,
        status: IngestStatus.COMPLETED,
        lastError: null,
      },
    });
  }

  /** Les titres d'actualité du moment, gardés sur la reprise : on sait à
   * quoi l'article a été rattaché, et une relance ne les relit pas. */
  private async readNews(ingest: SourceIngest) {
    if (!ingest.fbImageUrl) throw new Error('Mode actualité : la capture n’a pas d’image');
    const headlines = this.news ? await this.news.headlines() : [];
    await this.log(ingest.id, 'INGEST_NEWS_READ', `${headlines.length} titre(s) d’actualité relevé(s)`, {
      sample: headlines.slice(0, 5).map((h) => h.title),
    });
    return this.prisma.sourceIngest.update({
      where: { id: ingest.id },
      data: {
        sourceTitle: 'Actualité du moment',
        sourceText: headlinesText(headlines) || '(aucun titre disponible)',
        status: IngestStatus.REWRITING,
        lastError: null,
      },
    });
  }

  /** Notre article : l'image (lue par le modèle) rapprochée de l'actualité. */
  private async writeFromNews(ingest: SourceIngest) {
    if (!ingest.fbImageUrl) throw new Error('Mode actualité : la capture n’a pas d’image');
    const image = await this.wordpress.loadImage(ingest.fbImageUrl);
    const generated = await this.rewriter.fromNews({
      image: { data: image.data, mimeType: image.mimeType },
      fbCaption: ingest.fbCaption,
      headlines: ingest.sourceText ?? '',
      language: ingest.language,
    });
    await this.log(ingest.id, 'INGEST_NEWS_TITLES', `Titres proposés : ${generated.titles.map((t) => `« ${t} »`).join(' · ')}`, {
      newsHook: generated.newsHook,
      titles: generated.titles,
    });
    return this.prisma.sourceIngest.update({
      where: { id: ingest.id },
      data: { generated: generated as unknown as Prisma.InputJsonValue, status: IngestStatus.REWRITTEN, lastError: null },
    });
  }

  private async rewrite(ingest: SourceIngest) {
    const generated = await this.rewriter.rewrite({
      source: {
        url: ingest.sourceUrl,
        title: ingest.sourceTitle ?? '',
        text: ingest.sourceText ?? '',
        excerpt: null,
        leadImageUrl: null,
        siteName: null,
        language: null,
      },
      fbCaption: ingest.fbCaption,
      language: ingest.language,
    });
    return this.prisma.sourceIngest.update({
      where: { id: ingest.id },
      data: {
        generated,
        status: IngestStatus.REWRITTEN,
        lastError: null,
      },
    });
  }

  /** La description du post Facebook devient celle de l'article de notre
   * site, et de ses posts. Déjà reçu de WordPress : c'est fait tout de suite.
   * Pas encore : la capture attend sa réception (AWAITING_ECHO), qui la
   * retrouvera par son adresse. */
  private async useOwnArticle(ingest: SourceIngest) {
    const result = this.site ? await this.site.attachCapture(ingest.id) : { attached: false as const };
    if (result.attached) {
      await this.log(
        ingest.id,
        'INGEST_CAPTION_APPLIED',
        `Description du post Facebook appliquée à « ${result.title} » (${result.synchronized} post(s) à publier mis à jour)`,
        { articleId: result.articleId },
      );
      // Le statut est posé ici, pas déduit : une capture restée « SCRAPED »
      // repasserait sans fin dans cette étape.
      return this.prisma.sourceIngest.update({
        where: { id: ingest.id },
        data: { status: IngestStatus.COMPLETED, lastError: null },
      });
    }
    await this.log(
      ingest.id,
      'INGEST_WAITING_ARTICLE',
      'Article pas encore reçu de WordPress : la description lui sera appliquée à sa réception ' +
        '(le réenregistrer dans WordPress pour l’envoyer tout de suite)',
    );
    return this.prisma.sourceIngest.update({
      where: { id: ingest.id },
      data: { status: IngestStatus.AWAITING_ECHO, wpPermalink: ingest.sourceUrl, lastError: null },
    });
  }

  /** Dépose l'article réécrit, puis attend : c'est le renvoi du plugin, et
   * lui seul, qui rattache l'article et fabrique les posts. Le faire ici
   * dupliquerait ce que la réception WordPress sait déjà faire. */
  private async publishToWordpress(ingest: SourceIngest) {
    const generated = ingest.generated as GeneratedArticle | null;
    if (!generated) throw new Error('Aucune réécriture à déposer');
    const { depositKey } = await this.resolveSite(ingest.siteUrl);
    const deposit = await this.wordpress.deposit({
      siteUrl: ingest.siteUrl,
      apiKey: depositKey,
      ingestRef: ingest.id,
      article: generated,
      imageUrl: ingest.fbImageUrl,
      language: ingest.language,
    });
    if (deposit.imageWarning) {
      // L'article est en ligne : le signaler suffit, l'arrêter serait pire.
      await this.log(ingest.id, 'INGEST_IMAGE_SKIPPED', deposit.imageWarning);
    }
    // Le renvoi du plugin a pu arriver AVANT cette ligne (WP-Cron rapide) et
    // refermer déjà la reprise : on ne la repasse pas « en attente ».
    await this.prisma.sourceIngest.update({
      where: { id: ingest.id },
      data: { wpPostId: deposit.postId, wpPermalink: deposit.permalink, lastError: null },
    });
    await this.prisma.sourceIngest.updateMany({
      where: { id: ingest.id, articleId: null },
      data: { status: IngestStatus.AWAITING_ECHO },
    });
    return this.load(ingest.id);
  }

  /** Le site de destination, qui doit être déclaré dans la plateforme.
   *
   * Sans cette vérification, la clé d'automatisation suffirait à faire
   * déposer nos articles sur n'importe quel domaine. Le site par défaut,
   * lui, se déclare tout seul la première fois : sans quoi une installation
   * neuve refuserait sa propre destination.
   */
  private async resolveSite(provided?: string) {
    const raw = provided ?? this.config.get<string>('WORDPRESS_SITE_URL');
    if (!raw) {
      throw new BadRequestException(
        'Indiquer siteUrl, ou configurer WORDPRESS_SITE_URL',
      );
    }
    const siteUrl = normalizeSiteUrl(raw);
    const site = await this.prisma.contentSource.findUnique({
      where: { originUrl: siteUrl },
    });
    if (!site) {
      const fallback = this.config.get<string>('WORDPRESS_SITE_URL');
      if (!fallback || normalizeSiteUrl(fallback) !== siteUrl) {
        throw new BadRequestException(
          `Site inconnu : ${siteUrl}. Le déclarer dans la plateforme, section Sites.`,
        );
      }
      const created = await this.prisma.contentSource.create({
        data: { originUrl: siteUrl, name: new URL(siteUrl).hostname },
      });
      return { siteUrl, depositKey: created.depositKey };
    }
    if (site.status !== 'ACTIVE') {
      throw new BadRequestException(
        `${site.name} est désactivé comme destination`,
      );
    }
    // Refuser maintenant plutôt qu'après la lecture et la réécriture, que le
    // dépôt ferait échouer de toute façon.
    const blocker = pluginBlocker(site.pluginState);
    if (blocker) {
      throw new BadRequestException(
        `${site.name} : ${blocker}. Corriger puis cliquer « Vérifier » dans la page Sites.`,
      );
    }
    return { siteUrl, depositKey: site.depositKey };
  }

  /** Une portée qui ne désigne rien de publiable se voit tout de suite, pas
   * au moment de la diffusion : un groupe non rattaché ne recevrait jamais
   * le post, sans que rien ne l'explique. */
  private async assertScope(profileIds: string[], groupIds: string[]) {
    if (profileIds.length) {
      const known = await this.prisma.profile.count({
        where: { id: { in: profileIds }, status: 'ACTIVE' },
      });
      if (known !== profileIds.length) {
        throw new BadRequestException(
          'Tous les profils doivent exister et être actifs',
        );
      }
    }
    if (!groupIds.length) return;
    const linked = await this.prisma.group.count({
      where: {
        id: { in: groupIds },
        status: 'ACTIVE',
        profiles: {
          some: {
            status: 'ACTIVE',
            ...(profileIds.length ? { profileId: { in: profileIds } } : {}),
          },
        },
      },
    });
    if (linked !== groupIds.length) {
      throw new BadRequestException(
        profileIds.length
          ? 'Tous les groupes doivent être rattachés aux profils retenus'
          : 'Tous les groupes doivent être actifs et rattachés à un profil',
      );
    }
  }

  /** Une reprise hors de portée est introuvable, pas interdite : répondre
   * 403 confirmerait son existence. `acting` non fourni = appel interne,
   * déjà autorisé par l'étape qui l'a déclenché. */
  private async load(id: string, acting?: CurrentUser | null) {
    const ingest = await this.prisma.sourceIngest.findFirst({
      where: {
        id,
        ...(acting === undefined ? {} : ingestWhere(scopeOf(acting))),
      },
    });
    if (!ingest) throw new NotFoundException('Reprise introuvable');
    return ingest;
  }

  /** La reprise n'a ni profil ni groupe à ce stade : son identifiant vit
   * dans les métadonnées, où la recherche des journaux le retrouve. */
  private log(
    ingestId: string,
    eventType: string,
    message: string,
    metadata: Record<string, unknown> = {},
  ) {
    return this.prisma.activityLog
      .create({
        data: {
          eventType,
          level: eventType.endsWith('_FAILED') ? 'ERROR' : 'INFO',
          message,
          metadata: { ingestId, ...metadata },
        },
      })
      .catch(() => undefined);
  }
}
