import { LogLevel } from '@prisma/client';
import { LogsService } from './logs.service';

function row(eventType: string, level: LogLevel, count: number) {
  return { eventType, level, _count: { _all: count } };
}

function profileRow(profileId: string | null, level: LogLevel, count: number) {
  return { profileId, level, _count: { _all: count } };
}

function makeHarness(scenario: {
  byEvent: ReturnType<typeof row>[];
  byProfile?: ReturnType<typeof profileRow>[];
  incidents?: unknown[];
  total?: number;
  pendingLinks?: number;
  oldestPending?: { id: string; completedAt: Date } | null;
}) {
  const groupBy = jest.fn(async ({ by }: any) =>
    by[0] === 'eventType' ? scenario.byEvent : (scenario.byProfile ?? []),
  );
  const prisma: any = {
    activityLog: {
      groupBy,
      findMany: jest.fn(async () => scenario.incidents ?? []),
      count: jest.fn(async () => scenario.total ?? 0),
    },
    profile: {
      findMany: jest.fn(async () => [
        { id: 'profile_1', name: 'Profil A', status: 'ACTIVE' },
        { id: 'profile_2', name: 'Profil B', status: 'INACTIVE' },
      ]),
    },
    // Commentaires en attente d'URL : compté hors fenêtre d'observation.
    publicationJobItem: {
      count: jest.fn(async () => scenario.pendingLinks ?? 0),
    },
    publicationJob: {
      findFirst: jest.fn(async () => scenario.oldestPending ?? null),
    },
  };
  return { service: new LogsService(prisma), prisma };
}

describe('LogsService — synthèse décisionnelle', () => {
  it('agrège les niveaux et isole les réservations perdues', async () => {
    const { service } = makeHarness({
      total: 130,
      byEvent: [
        row('JOB_CLAIMED', LogLevel.INFO, 100),
        row('POST_PUBLISHED', LogLevel.INFO, 25),
        row('POST_FAILED', LogLevel.ERROR, 3),
        row('CLAIM_LOST', LogLevel.ERROR, 2),
      ],
    });

    const summary = await service.summary({ hours: 24 }, null);

    expect(summary.levels).toEqual({ DEBUG: 0, INFO: 125, WARN: 0, ERROR: 5 });
    // CLAIM_LOST est le seul compteur qui impose une vérification manuelle.
    expect(summary.claimLost).toBe(2);
    expect(summary.total).toBe(130);
    expect(summary.eventTypes[0]).toEqual({
      eventType: 'JOB_CLAIMED',
      total: 100,
      errors: 0,
      domain: 'publication',
    });
    expect(summary.eventTypes).toContainEqual({
      eventType: 'POST_FAILED',
      total: 3,
      errors: 3,
      domain: 'publication',
    });
  });

  it('compte chaque domaine pour les onglets', async () => {
    const { service } = makeHarness({
      byEvent: [
        row('POST_PUBLISHED', LogLevel.INFO, 10),
        row('POST_FAILED', LogLevel.ERROR, 2),
        row('INGEST_FAILED', LogLevel.ERROR, 1),
        row('WORDPRESS_ARTICLE_NO_POST', LogLevel.WARN, 4),
        row('SITE_PLUGIN_CHANGED', LogLevel.WARN, 1),
        row('GROUP_JOIN_UPDATED', LogLevel.INFO, 3),
        row('EXTENSION_PING', LogLevel.INFO, 7),
      ],
    });
    const { domains } = await service.summary({ hours: 24 }, null);
    const by = Object.fromEntries(domains.map((d) => [d.domain, [d.total, d.errors, d.warns]]));
    expect(by).toEqual({
      publication: [12, 2, 0],
      capture: [1, 1, 0],
      security: [0, 0, 0],
      sync: [5, 0, 5],
      groups: [3, 0, 0],
      other: [7, 0, 0],
    });
  });

  it('un domaine choisi borne compteurs et incidents', async () => {
    const { service, prisma } = makeHarness({ byEvent: [] });
    await service.summary({ hours: 24, domain: 'sync' }, null);
    // Le premier groupBy (les onglets) reste sur tous les domaines.
    const [first, second] = prisma.activityLog.groupBy.mock.calls.map(([args]: any) => args.where);
    expect(JSON.stringify(first)).not.toContain('WORDPRESS_');
    expect(JSON.stringify(second)).toContain('WORDPRESS_');
  });

  it('classe les profils par nombre d’erreurs et les nomme', async () => {
    const { service } = makeHarness({
      byEvent: [],
      byProfile: [
        profileRow('profile_1', LogLevel.INFO, 40),
        profileRow('profile_1', LogLevel.ERROR, 1),
        profileRow('profile_2', LogLevel.ERROR, 9),
        profileRow(null, LogLevel.INFO, 5),
      ],
    });

    const summary = await service.summary({ hours: 24 }, null);

    expect(summary.profiles).toEqual([
      {
        profileId: 'profile_2',
        name: 'Profil B',
        status: 'INACTIVE',
        total: 9,
        errors: 9,
      },
      {
        profileId: 'profile_1',
        name: 'Profil A',
        status: 'ACTIVE',
        total: 41,
        errors: 1,
      },
      {
        profileId: null,
        name: 'Hors profil',
        status: null,
        total: 5,
        errors: 0,
      },
    ]);
  });

  it('remonte les commentaires qui attendent encore leur URL', async () => {
    const pendingSince = new Date('2026-09-13T08:00:00.000Z');
    const { service, prisma } = makeHarness({
      byEvent: [],
      pendingLinks: 4,
      oldestPending: { id: 'job_bloque', completedAt: pendingSince },
    });

    const summary = await service.summary({ hours: 24 }, null);

    expect(summary.pendingLinkUpdates).toEqual({
      total: 4,
      oldestJobId: 'job_bloque',
      pendingSince,
    });
    // Le stock ne doit pas être restreint à la fenêtre : un commentaire bloqué
    // depuis trois jours disparaîtrait d'une vue sur 24 h.
    const [[{ where }]] = prisma.publicationJobItem.count.mock.calls;
    expect(where).not.toHaveProperty('createdAt');
    // Un job expiré sans `complete` cache lui aussi des commentaires sans URL.
    expect(where.job.status).toEqual({ not: 'CLAIMED' });
  });

  it('borne la fenêtre demandée', async () => {
    const { service, prisma } = makeHarness({ byEvent: [] });

    const before = Date.now();
    const summary = await service.summary({ hours: 6 }, null);

    expect(summary.hours).toBe(6);
    expect(before - summary.since.getTime()).toBeGreaterThanOrEqual(
      6 * 3600000,
    );
    expect(prisma.activityLog.count).toHaveBeenCalledWith({
      where: { createdAt: { gte: summary.since } },
    });
  });
});

describe('LogsService — filtres de suivi et export', () => {
  const harness = (rows: any[] = []) => {
    const prisma: any = {
      activityLog: {
        findMany: jest.fn(async () => rows),
        count: jest.fn(async () => rows.length),
        create: jest.fn(async (args: any) => args),
      },
      $transaction: jest.fn(async (ops: any[]) => Promise.all(ops)),
    };
    return { service: new LogsService(prisma), prisma };
  };
  const base = { page: 1, limit: 25, onlyIncidents: false, withUrl: false };

  it('filtre par lien Facebook, groupe, catégorie, publication et « avec lien »', async () => {
    const { service, prisma } = harness();
    await service.search(
      {
        ...base,
        domain: 'publication',
        groupId: 'g1',
        categoryId: 'c1',
        postTargetId: 't1',
        withUrl: true,
        facebookUrl: 'https://m.facebook.com/groups/1/posts/9/?__cft__=x',
        search: 'introuvable',
      } as any,
      null,
    );
    const where = prisma.activityLog.findMany.mock.calls[0][0].where;
    expect(where).toMatchObject({ groupId: 'g1', postTargetId: 't1', group: { categoryId: 'c1' } });
    const and = JSON.stringify(where.AND);
    expect(and).toContain('https://www.facebook.com/groups/1/posts/9');
    expect(and).toContain('"facebookUrl":{"not":null}');
    expect(and).toContain('introuvable');
  });

  it('le domaine et les incidents se combinent sans s’écraser', async () => {
    const { service, prisma } = harness();
    await service.search({ ...base, domain: 'publication', onlyIncidents: true, search: 'x' } as any, null);
    const where = prisma.activityLog.findMany.mock.calls[0][0].where;
    expect(where.AND).toHaveLength(3);
  });

  it('exporte en CSV lisible par Excel, avec le lien et l’URL de l’article', async () => {
    const { service } = harness([
      {
        createdAt: new Date('2026-10-03T10:00:00Z'),
        level: 'ERROR',
        eventType: 'VERIFY_MISSING_LINK',
        message: 'sans le lien; à supprimer',
        profile: { name: 'Modo' },
        group: { name: 'Recettes', category: { name: 'Cuisine' } },
        post: { title: 'Tajine', url: 'https://site.test/tajine' },
        facebookUrl: 'https://www.facebook.com/groups/1/posts/9',
        postTargetId: 't1',
        jobId: null,
      },
    ]);
    const csv = await service.exportCsv(base as any, null);
    expect(csv.startsWith('﻿date;niveau')).toBe(true);
    expect(csv).toContain('VERIFY_MISSING_LINK;"sans le lien; à supprimer";Modo;Recettes;Cuisine;Tajine;https://www.facebook.com/groups/1/posts/9;https://site.test/tajine;t1;');
  });

  it('un lien écrit par l’extension est enregistré sous sa forme stable', async () => {
    const { service, prisma } = harness();
    await service.create({ eventType: 'WORKER_PUBLISHED', level: 'INFO', message: 'ok', facebookUrl: 'https://web.facebook.com/groups/1/posts/9/?mibextid=1' } as any);
    expect(prisma.activityLog.create.mock.calls[0][0].data.facebookUrl).toBe('https://www.facebook.com/groups/1/posts/9');
  });
});
