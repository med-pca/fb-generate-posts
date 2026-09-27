import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IngestStatus, Prisma, SourceIngest } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PaginationDto } from '../common/dto/pagination.dto';
import { paginated } from '../common/paginated';
import { CaptureIngestDto } from './dto/capture-ingest.dto';
import { CreateIngestDto } from './dto/create-ingest.dto';
import { ScrapeResultDto } from './dto/scrape-result.dto';
import { GeneratedArticle, RewriterService } from './rewriter.service';
import { SourceReaderService } from './source-reader.service';
import { WordpressWriterService } from './wordpress-writer.service';

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

@Injectable()
export class IngestService {
  private readonly logger = new Logger(IngestService.name);
  /** Deux avancées simultanées sur la même reprise paieraient deux fois la
   * réécriture. Le verrou ne vaut que dans ce processus, comme le minuteur
   * d'alimentation. */
  private readonly running = new Set<string>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly reader: SourceReaderService,
    private readonly rewriter: RewriterService,
    private readonly wordpress: WordpressWriterService,
  ) {}

  async create(dto: CreateIngestDto) {
    const siteUrl = this.siteUrl(dto.siteUrl);
    const profileIds = [...new Set(dto.profileIds ?? [])];
    const groupIds = [...new Set(dto.groupIds ?? [])];
    await this.assertScope(profileIds, groupIds);
    const ingest = await this.prisma.sourceIngest.create({
      data: {
        facebookUrl: dto.facebookUrl,
        sourceUrl: dto.sourceUrl,
        siteUrl,
        language: dto.language,
        profileIds,
        groupIds,
      },
    });
    await this.log(ingest.id, 'INGEST_CREATED', 'Reprise enregistrée', {
      facebookUrl: ingest.facebookUrl,
      sourceUrl: ingest.sourceUrl,
    });
    return ingest;
  }

  async findAll({ page, limit }: PaginationDto) {
    const [data, total] = await this.prisma.$transaction([
      this.prisma.sourceIngest.findMany({
        include: {
          article: { select: { id: true, title: true, articleUrl: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.sourceIngest.count(),
    ]);
    return paginated(data, total, page, limit);
  }

  /** `findUniqueOrThrow` remonterait une erreur Prisma, donc un 500 : une
   * fiche absente est un 404, pas une panne. */
  async findOne(id: string) {
    const ingest = await this.prisma.sourceIngest.findUnique({
      where: { id },
      include: { article: true },
    });
    if (!ingest) throw new NotFoundException('Reprise introuvable');
    return ingest;
  }

  async remove(id: string) {
    await this.load(id);
    return this.prisma.sourceIngest.delete({ where: { id } });
  }

  /** Enregistre une reprise déjà collectée, en un seul appel. C'est le
   * chemin de l'extension : l'utilisateur est devant la publication, il a
   * décidé de la reprendre, et il n'y a rien à réserver ni à attendre. */
  async capture(dto: CaptureIngestDto) {
    const ingest = await this.create(dto);
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
  async claimScrape(profileExternalId?: string) {
    const ttlMinutes = this.config.get<number>('CLAIM_TTL_MINUTES', 30);
    const claimExpiresAt = new Date(Date.now() + ttlMinutes * 60_000);
    const claimed = await this.prisma.$transaction(async (tx) => {
      const [row] = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
        SELECT id FROM source_ingests
        WHERE status = 'PENDING_SCRAPE'::"IngestStatus"
           OR (status = 'SCRAPING'::"IngestStatus" AND claim_expires_at < NOW())
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
  async failScrape(id: string, error: string) {
    const ingest = await this.load(id);
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
  async submitScrape(id: string, dto: ScrapeResultDto) {
    const ingest = await this.load(id);
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
  async retry(id: string) {
    const ingest = await this.load(id);
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
        return this.guard(ingest, 'INGEST_SOURCE_READ', 'Page source lue', () =>
          this.readSource(ingest),
        );
      case IngestStatus.REWRITING:
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
    const resolved = this.resolvedLanguage(ingest.language, source.language);
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
  private resolvedLanguage(requested: string, detected: string | null) {
    const wanted = requested.trim().toLowerCase();
    if (wanted && wanted !== 'auto') return requested;
    return detected ?? 'auto';
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

  /** Dépose l'article réécrit, puis attend : c'est le renvoi du plugin, et
   * lui seul, qui rattache l'article et fabrique les posts. Le faire ici
   * dupliquerait ce que la réception WordPress sait déjà faire. */
  private async publishToWordpress(ingest: SourceIngest) {
    const generated = ingest.generated as GeneratedArticle | null;
    if (!generated) throw new Error('Aucune réécriture à déposer');
    const deposit = await this.wordpress.deposit({
      siteUrl: ingest.siteUrl,
      ingestRef: ingest.id,
      article: generated,
      imageUrl: ingest.fbImageUrl,
    });
    if (deposit.imageWarning) {
      // L'article est en ligne : le signaler suffit, l'arrêter serait pire.
      await this.log(ingest.id, 'INGEST_IMAGE_SKIPPED', deposit.imageWarning);
    }
    return this.prisma.sourceIngest.update({
      where: { id: ingest.id },
      data: {
        wpPostId: deposit.postId,
        wpPermalink: deposit.permalink,
        status: IngestStatus.AWAITING_ECHO,
        lastError: null,
      },
    });
  }

  /** Le site de destination, réduit à ce qui sert d'adresse : ni identifiants,
   * ni requête, ni barre finale — la même normalisation que la réception
   * WordPress, pour que les deux désignent bien le même site. */
  private siteUrl(provided?: string) {
    const raw = provided ?? this.config.get<string>('WORDPRESS_SITE_URL');
    if (!raw) {
      throw new BadRequestException(
        'Indiquer siteUrl, ou configurer WORDPRESS_SITE_URL',
      );
    }
    const url = new URL(raw);
    if (url.username || url.password || url.search || url.hash) {
      throw new BadRequestException(
        'siteUrl ne doit porter ni identifiants, ni paramètres',
      );
    }
    return url.origin + url.pathname.replace(/\/+$/, '');
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

  private async load(id: string) {
    const ingest = await this.prisma.sourceIngest.findUnique({ where: { id } });
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
