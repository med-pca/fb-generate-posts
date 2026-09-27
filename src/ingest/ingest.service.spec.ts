import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IngestStatus, SourceIngest } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { IngestService, resumeStatus } from './ingest.service';
import { RewriterService } from './rewriter.service';
import { SourceReaderService } from './source-reader.service';
import {
  WordpressDeposit,
  WordpressWriterService,
} from './wordpress-writer.service';

const SOURCE = {
  url: 'https://exemple.test/article',
  title: 'Titre lu',
  text: 'Texte de la page source, assez long pour être réécrit.',
  excerpt: null,
  leadImageUrl: null,
  siteName: null,
  language: 'en',
};

const GENERATED = {
  title: 'Titre réécrit',
  slug: 'titre-reecrit',
  excerpt: 'Un résumé',
  metaDescription: 'Une description',
  contentHtml: '<p>Corps</p>',
  caption: 'Une légende',
  hashtags: ['cuisine'],
};

const ingest = (over: Partial<SourceIngest> = {}): SourceIngest => ({
  id: 'ing_1',
  facebookUrl: 'https://www.facebook.com/x/posts/1',
  sourceUrl: SOURCE.url,
  siteUrl: 'https://site.test',
  language: 'fr',
  fbCaption: null,
  fbImageUrl: null,
  sourceTitle: null,
  sourceText: null,
  generated: null,
  wpPostId: null,
  wpPermalink: null,
  articleId: null,
  profileIds: [],
  groupIds: [],
  ownerId: null,
  status: IngestStatus.PENDING_SCRAPE,
  claimedAt: null,
  claimExpiresAt: null,
  attempts: 0,
  lastError: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...over,
});

function setup(initial: SourceIngest) {
  let row = initial;
  const claimRow: Array<{ id: string }> = [{ id: 'ing_1' }];
  // Le client de transaction est défini à part : le faire référencer par le
  // `$transaction` de l'objet qui le contient créerait un cycle, et tout
  // l'objet retomberait en `any`.
  const tx = {
    $queryRaw: jest.fn(() => Promise.resolve(claimRow)),
    sourceIngest: {
      findUnique: jest.fn((): Promise<SourceIngest | null> =>
        Promise.resolve(row),
      ),
      // La portée passe par `findFirst` : un `findUnique` ne peut pas
      // porter de condition de propriétaire.
      findFirst: jest.fn((): Promise<SourceIngest | null> =>
        Promise.resolve(row),
      ),
      create: jest.fn(({ data }: { data: Partial<SourceIngest> }) => {
        row = { ...row, ...data };
        return Promise.resolve(row);
      }),
      update: jest.fn(({ data }: { data: Partial<SourceIngest> }) => {
        row = { ...row, ...data };
        return Promise.resolve(row);
      }),
    },
    // Le site de destination, déclaré et actif sauf mention contraire.
    contentSource: {
      findUnique: jest.fn(
        (): Promise<{
          id: string;
          name: string;
          originUrl: string;
          depositKey: string | null;
          status: string;
        } | null> =>
          Promise.resolve({
            id: 'site_1',
            name: 'Site de test',
            originUrl: 'https://site.test',
            depositKey: 'cle-du-site',
            status: 'ACTIVE',
          }),
      ),
      create: jest.fn(({ data }: { data: { originUrl: string } }) =>
        Promise.resolve({ id: 'site_new', depositKey: null, ...data }),
      ),
    },
    profile: { count: jest.fn(() => Promise.resolve(0)) },
    group: { count: jest.fn(() => Promise.resolve(0)) },
    activityLog: { create: jest.fn(() => Promise.resolve({})) },
  };
  // Les mêmes fonctions des deux côtés : ce qui passe par la transaction se
  // vérifie sur `prisma`.
  const prisma = {
    ...tx,
    $transaction: jest.fn((callback: (client: typeof tx) => Promise<unknown>) =>
      callback(tx),
    ),
  };
  const reader = { read: jest.fn(() => Promise.resolve(SOURCE)) };
  const rewriter = { rewrite: jest.fn(() => Promise.resolve(GENERATED)) };
  const config = { get: jest.fn(() => 'https://site.test') };
  const wordpress = {
    deposit: jest.fn((): Promise<WordpressDeposit> =>
      Promise.resolve({
        postId: '77',
        permalink: 'https://site.test/le-couscous',
        imageWarning: null,
      }),
    ),
  };
  const service = new IngestService(
    prisma as unknown as PrismaService,
    config as unknown as ConfigService,
    reader as unknown as SourceReaderService,
    rewriter as unknown as RewriterService,
    wordpress as unknown as WordpressWriterService,
  );
  return {
    service,
    prisma,
    claimRow,
    reader,
    rewriter,
    wordpress,
    config,
    current: () => row,
  };
}

describe('resumeStatus', () => {
  // Une reprise abandonnée ne doit pas refaire ce qui est déjà payé.
  it('repart de la réécriture déjà obtenue', () => {
    expect(
      resumeStatus({ generated: GENERATED, sourceText: 'x', fbCaption: 'y' }),
    ).toBe(IngestStatus.REWRITTEN);
  });

  it('repart de la page déjà lue', () => {
    expect(
      resumeStatus({ generated: null, sourceText: 'x', fbCaption: 'y' }),
    ).toBe(IngestStatus.REWRITING);
  });

  it('repart de la collecte déjà faite', () => {
    expect(
      resumeStatus({ generated: null, sourceText: null, fbCaption: 'y' }),
    ).toBe(IngestStatus.SCRAPED);
  });

  it('retourne attendre la collecte quand rien n’est arrivé', () => {
    expect(
      resumeStatus({ generated: null, sourceText: null, fbCaption: null }),
    ).toBe(IngestStatus.PENDING_SCRAPE);
  });
});

describe('IngestService.advance', () => {
  it('enchaîne lecture, réécriture puis dépôt depuis la collecte', async () => {
    const { service, reader, rewriter, current } = setup(
      ingest({ status: IngestStatus.SCRAPED, fbCaption: 'Légende d’origine' }),
    );
    await service.advance('ing_1');
    expect(reader.read).toHaveBeenCalledWith(SOURCE.url);
    // La légende d'origine sert d'indication de ton au modèle.
    expect(rewriter.rewrite).toHaveBeenCalledWith(
      expect.objectContaining({
        fbCaption: 'Légende d’origine',
        language: 'fr',
      }),
    );
    // Une seule avancée traverse toute la chaîne jusqu'à l'attente du renvoi.
    expect(current()).toMatchObject({
      status: IngestStatus.AWAITING_ECHO,
      sourceTitle: 'Titre lu',
      generated: GENERATED,
      lastError: null,
    });
  });

  /** « auto » se résout à la lecture : la fiche dit ensuite dans quelle
   * langue l'article a été écrit, et une relance ne la redemande pas. */
  it('retient la langue déclarée par la page source', async () => {
    const { service, rewriter, current } = setup(
      ingest({
        status: IngestStatus.SCRAPED,
        fbCaption: 'x',
        language: 'auto',
      }),
    );
    await service.advance('ing_1');
    expect(current().language).toBe('en');
    expect(rewriter.rewrite).toHaveBeenCalledWith(
      expect.objectContaining({ language: 'en' }),
    );
  });

  // Une langue demandée explicitement est une décision, pas un défaut.
  it('respecte une langue imposée malgré celle de la page', async () => {
    const { service, current } = setup(
      ingest({ status: IngestStatus.SCRAPED, fbCaption: 'x', language: 'fr' }),
    );
    await service.advance('ing_1');
    expect(current().language).toBe('fr');
  });

  it('n’enchaîne rien tant que la collecte n’est pas arrivée', async () => {
    const { service, reader, current } = setup(ingest());
    await service.advance('ing_1');
    expect(reader.read).not.toHaveBeenCalled();
    expect(current().status).toBe(IngestStatus.PENDING_SCRAPE);
  });

  it('dépose sur WordPress ce qui est déjà réécrit, sans le refaire', async () => {
    const { service, rewriter, wordpress, current } = setup(
      ingest({ status: IngestStatus.REWRITTEN, generated: GENERATED }),
    );
    await service.advance('ing_1');
    expect(rewriter.rewrite).not.toHaveBeenCalled();
    expect(wordpress.deposit).toHaveBeenCalledWith(
      expect.objectContaining({
        siteUrl: 'https://site.test',
        ingestRef: 'ing_1',
        article: GENERATED,
      }),
    );
    // C'est le renvoi du plugin, pas le dépôt, qui referme la reprise.
    expect(current()).toMatchObject({
      status: IngestStatus.AWAITING_ECHO,
      wpPostId: '77',
      wpPermalink: 'https://site.test/le-couscous',
    });
  });

  it('transmet l’image du post d’origine au dépôt', async () => {
    const { service, wordpress } = setup(
      ingest({
        status: IngestStatus.REWRITTEN,
        generated: GENERATED,
        fbImageUrl: 'https://cdn.test/i.jpg',
      }),
    );
    await service.advance('ing_1');
    expect(wordpress.deposit).toHaveBeenCalledWith(
      expect.objectContaining({ imageUrl: 'https://cdn.test/i.jpg' }),
    );
  });

  // Un article en ligne sans image reste un article en ligne : le signaler
  // suffit, refuser le dépôt serait pire.
  it('n’échoue pas parce que l’image n’a pas suivi', async () => {
    const { service, wordpress, current } = setup(
      ingest({ status: IngestStatus.REWRITTEN, generated: GENERATED }),
    );
    wordpress.deposit.mockResolvedValueOnce({
      postId: '78',
      permalink: 'https://site.test/x',
      imageWarning: 'Image trop volumineuse.',
    });
    await service.advance('ing_1');
    expect(current()).toMatchObject({
      status: IngestStatus.AWAITING_ECHO,
      lastError: null,
    });
  });

  it('garde la réécriture quand le dépôt échoue', async () => {
    const { service, wordpress, current } = setup(
      ingest({ status: IngestStatus.REWRITTEN, generated: GENERATED }),
    );
    wordpress.deposit.mockRejectedValueOnce(new Error('WordPress injoignable'));
    await service.advance('ing_1');
    expect(current()).toMatchObject({
      status: IngestStatus.REWRITTEN,
      generated: GENERATED,
      attempts: 1,
      lastError: 'WordPress injoignable',
    });
  });

  // AWAITING_ECHO attend le plugin : rien à faire, et surtout pas un second
  // dépôt qui créerait un deuxième article.
  it('ne redépose pas une reprise qui attend le renvoi', async () => {
    const { service, wordpress } = setup(
      ingest({ status: IngestStatus.AWAITING_ECHO, generated: GENERATED }),
    );
    await service.advance('ing_1');
    expect(wordpress.deposit).not.toHaveBeenCalled();
  });

  /** Une étape ratée garde son statut : la relance ne recommence pas depuis
   * le début, et la lecture déjà faite n'est pas refaite. */
  it('conserve l’étape à refaire et compte l’échec', async () => {
    const { service, reader, current } = setup(
      ingest({ status: IngestStatus.SCRAPED, fbCaption: 'x' }),
    );
    reader.read.mockRejectedValueOnce(new Error('page injoignable'));
    await service.advance('ing_1');
    expect(current()).toMatchObject({
      status: IngestStatus.SCRAPED,
      attempts: 1,
      lastError: 'page injoignable',
    });
  });

  // Rendre l'état d'avant l'échec annoncerait une reprise en bonne santé :
  // l'appelant ne verrait ni le compteur, ni la raison.
  it('rend l’état écrit par l’échec, pas celui d’avant', async () => {
    const { service, reader } = setup(
      ingest({ status: IngestStatus.SCRAPED, fbCaption: 'x' }),
    );
    reader.read.mockRejectedValueOnce(new Error('page injoignable'));
    await expect(service.advance('ing_1')).resolves.toMatchObject({
      attempts: 1,
      lastError: 'page injoignable',
    });
  });

  it('abandonne après cinq échecs plutôt que de tourner en boucle', async () => {
    const { service, reader, current } = setup(
      ingest({ status: IngestStatus.SCRAPED, fbCaption: 'x', attempts: 4 }),
    );
    reader.read.mockRejectedValueOnce(new Error('toujours rien'));
    await service.advance('ing_1');
    expect(current()).toMatchObject({
      status: IngestStatus.FAILED,
      attempts: 5,
    });
  });

  // La réécriture est payante : une panne après la lecture ne doit pas la
  // faire refaire au passage suivant.
  it('garde la page lue quand la réécriture échoue', async () => {
    const { service, rewriter, current } = setup(
      ingest({ status: IngestStatus.SCRAPED, fbCaption: 'x' }),
    );
    rewriter.rewrite.mockRejectedValueOnce(new Error('modèle indisponible'));
    await service.advance('ing_1');
    expect(current()).toMatchObject({
      status: IngestStatus.REWRITING,
      sourceText: SOURCE.text,
      attempts: 1,
    });
  });
});

describe('IngestService.retry', () => {
  it('replace une reprise abandonnée à l’étape que ses données permettent', async () => {
    const { service, rewriter, current } = setup(
      ingest({
        status: IngestStatus.FAILED,
        fbCaption: 'x',
        sourceText: SOURCE.text,
        sourceTitle: SOURCE.title,
        attempts: 5,
        lastError: 'modèle indisponible',
      }),
    );
    await service.retry('ing_1', null);
    expect(rewriter.rewrite).toHaveBeenCalledTimes(1);
    // Reprise à la réécriture, puis dépôt dans la foulée.
    expect(current()).toMatchObject({
      status: IngestStatus.AWAITING_ECHO,
      attempts: 0,
      lastError: null,
    });
  });
});

describe('IngestService.submitScrape', () => {
  it('enregistre le texte et l’image relevés', async () => {
    const { service, current } = setup(ingest());
    await service.submitScrape('ing_1', {
      caption: 'Texte du post',
      imageUrl: 'https://cdn.test/i.jpg',
    });
    expect(current()).toMatchObject({
      status: IngestStatus.SCRAPED,
      fbCaption: 'Texte du post',
      fbImageUrl: 'https://cdn.test/i.jpg',
    });
  });

  it('refuse un dépôt sur une reprise déjà réécrite', async () => {
    const { service } = setup(ingest({ status: IngestStatus.REWRITTEN }));
    await expect(
      service.submitScrape('ing_1', { caption: 'Trop tard' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('IngestService.findOne', () => {
  // Une fiche absente est un 404 : `findUniqueOrThrow` rendrait un 500.
  it('signale une reprise absente comme introuvable', async () => {
    const { service, prisma } = setup(ingest());
    prisma.sourceIngest.findFirst.mockResolvedValueOnce(null);
    await expect(service.findOne('inconnu', null)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});

describe('IngestService.create', () => {
  it('normalise le site de destination', async () => {
    const { service, prisma } = setup(ingest());
    await service.create({
      facebookUrl: 'https://www.facebook.com/x/posts/1',
      sourceUrl: SOURCE.url,
      siteUrl: 'https://site.test/blog/',
      language: 'fr',
    });
    const [[args]] = prisma.sourceIngest.create.mock.calls;
    expect(args.data.siteUrl).toBe('https://site.test/blog');
  });

  it('refuse un site porteur de paramètres', async () => {
    const { service } = setup(ingest());
    await expect(
      service.create({
        facebookUrl: 'https://www.facebook.com/x/posts/1',
        sourceUrl: SOURCE.url,
        siteUrl: 'https://site.test/?token=secret',
        language: 'fr',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  // Un groupe non rattaché ne recevrait jamais le post : le dire tout de
  // suite vaut mieux qu'une diffusion silencieusement vide.
  it('refuse un groupe qui n’est pas rattaché au profil retenu', async () => {
    const { service, prisma } = setup(ingest());
    prisma.profile.count.mockResolvedValueOnce(1);
    prisma.group.count.mockResolvedValueOnce(0);
    await expect(
      service.create({
        facebookUrl: 'https://www.facebook.com/x/posts/1',
        sourceUrl: SOURCE.url,
        language: 'fr',
        profileIds: ['p1'],
        groupIds: ['g1'],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('accepte une portée vide : tous les profils actifs', async () => {
    const { service, prisma } = setup(ingest());
    await service.create({
      facebookUrl: 'https://www.facebook.com/x/posts/1',
      sourceUrl: SOURCE.url,
      language: 'fr',
    });
    expect(prisma.profile.count).not.toHaveBeenCalled();
    expect(prisma.group.count).not.toHaveBeenCalled();
  });
});

describe('IngestService.claimScrape', () => {
  it('réserve la collecte et rend l’URL du post d’origine', async () => {
    const { service, current } = setup(ingest());
    const claimed = await service.claimScrape('profil-demo');
    expect(claimed.scrape).toMatchObject({
      scrapeId: 'ing_1',
      facebookUrl: 'https://www.facebook.com/x/posts/1',
    });
    expect(current().status).toBe(IngestStatus.SCRAPING);
  });

  it('le dit quand la file est vide', async () => {
    const { service, claimRow } = setup(ingest());
    claimRow.length = 0;
    await expect(service.claimScrape()).resolves.toMatchObject({
      scrape: null,
    });
  });

  /** Une réservation expirée doit revenir dans la file d'elle-même : une
   * extension qui disparaît en cours de route ne doit rien bloquer. Le
   * filtre est dans la requête, il n'y a pas de balayage séparé. */
  it('reprend aussi les réservations expirées', async () => {
    const { service, prisma } = setup(ingest());
    await service.claimScrape();
    const [sql] = prisma.$queryRaw.mock.calls[0] as unknown as [
      { strings: string[] },
    ];
    const text = sql.strings.join('');
    expect(text).toContain("status = 'PENDING_SCRAPE'");
    expect(text).toContain('claim_expires_at < NOW()');
    // Deux extensions qui interrogent ensemble repartent avec deux reprises.
    expect(text).toContain('FOR UPDATE SKIP LOCKED');
  });
});

describe('IngestService.failScrape', () => {
  it('remet la reprise dans la file et libère la réservation', async () => {
    const { service, current } = setup(
      ingest({ status: IngestStatus.SCRAPING, claimedAt: new Date() }),
    );
    await service.failScrape('ing_1', 'Publication supprimée');
    expect(current()).toMatchObject({
      status: IngestStatus.PENDING_SCRAPE,
      attempts: 1,
      lastError: 'Publication supprimée',
      claimedAt: null,
      claimExpiresAt: null,
    });
  });

  it('abandonne après cinq collectes ratées', async () => {
    const { service, current } = setup(
      ingest({ status: IngestStatus.SCRAPING, attempts: 4 }),
    );
    await service.failScrape('ing_1', 'Toujours introuvable');
    expect(current().status).toBe(IngestStatus.FAILED);
  });

  // La collecte est faite : elle est reçue même si la réservation a expiré
  // entre-temps, sinon le travail de l'extension serait perdu.
  it('accepte un résultat déposé après l’expiration', async () => {
    const { service, current } = setup(
      ingest({
        status: IngestStatus.SCRAPING,
        claimExpiresAt: new Date(Date.now() - 60_000),
      }),
    );
    await service.submitScrape('ing_1', { caption: 'Texte relevé' });
    expect(current()).toMatchObject({
      status: IngestStatus.SCRAPED,
      claimExpiresAt: null,
    });
  });
});

describe('IngestService : le site de destination', () => {
  /** Sans cette vérification, la clé d'automatisation suffirait à faire
   * déposer nos articles sur n'importe quel domaine. */
  it('refuse un site qui n’est pas déclaré dans la plateforme', async () => {
    const { service, prisma } = setup(ingest());
    prisma.contentSource.findUnique.mockResolvedValueOnce(null);
    await expect(
      service.create({
        facebookUrl: 'https://www.facebook.com/x/posts/1',
        sourceUrl: SOURCE.url,
        siteUrl: 'https://site-inconnu.test',
        language: 'auto',
      }),
    ).rejects.toThrow(/Site inconnu/);
  });

  it('refuse un site désactivé', async () => {
    const { service, prisma } = setup(ingest());
    prisma.contentSource.findUnique.mockResolvedValueOnce({
      id: 'site_1',
      name: 'Ancien site',
      originUrl: 'https://site.test',
      depositKey: null,
      status: 'INACTIVE',
    });
    await expect(
      service.create({
        facebookUrl: 'https://www.facebook.com/x/posts/1',
        sourceUrl: SOURCE.url,
        siteUrl: 'https://site.test',
        language: 'auto',
      }),
    ).rejects.toThrow(/désactivé/);
  });

  // Sans cela, une installation neuve refuserait sa propre destination.
  it('déclare tout seul le site par défaut la première fois', async () => {
    const { service, prisma } = setup(ingest());
    prisma.contentSource.findUnique.mockResolvedValueOnce(null);
    await service.create({
      facebookUrl: 'https://www.facebook.com/x/posts/1',
      sourceUrl: SOURCE.url,
      language: 'auto',
    });
    const [[args]] = prisma.contentSource.create.mock.calls;
    expect(args.data).toMatchObject({ originUrl: 'https://site.test' });
  });

  /** Deux sites n'ont aucune raison de partager la même clé de plugin. */
  it('dépose avec la clé du site visé', async () => {
    const { service, wordpress } = setup(
      ingest({ status: IngestStatus.REWRITTEN, generated: GENERATED }),
    );
    await service.advance('ing_1');
    expect(wordpress.deposit).toHaveBeenCalledWith(
      expect.objectContaining({ apiKey: 'cle-du-site' }),
    );
  });
});
