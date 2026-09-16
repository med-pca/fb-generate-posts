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
    publicationJobItem: { count: jest.fn(async () => scenario.pendingLinks ?? 0) },
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

    const summary = await service.summary({ hours: 24 });

    expect(summary.levels).toEqual({ DEBUG: 0, INFO: 125, WARN: 0, ERROR: 5 });
    // CLAIM_LOST est le seul compteur qui impose une vérification manuelle.
    expect(summary.claimLost).toBe(2);
    expect(summary.total).toBe(130);
    expect(summary.eventTypes[0]).toEqual({
      eventType: 'JOB_CLAIMED',
      total: 100,
      errors: 0,
    });
    expect(summary.eventTypes).toContainEqual({
      eventType: 'POST_FAILED',
      total: 3,
      errors: 3,
    });
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

    const summary = await service.summary({ hours: 24 });

    expect(summary.profiles).toEqual([
      { profileId: 'profile_2', name: 'Profil B', status: 'INACTIVE', total: 9, errors: 9 },
      { profileId: 'profile_1', name: 'Profil A', status: 'ACTIVE', total: 41, errors: 1 },
      { profileId: null, name: 'Hors profil', status: null, total: 5, errors: 0 },
    ]);
  });

  it('remonte les commentaires qui attendent encore leur URL', async () => {
    const pendingSince = new Date('2026-09-13T08:00:00.000Z');
    const { service, prisma } = makeHarness({
      byEvent: [],
      pendingLinks: 4,
      oldestPending: { id: 'job_bloque', completedAt: pendingSince },
    });

    const summary = await service.summary({ hours: 24 });

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
    const summary = await service.summary({ hours: 6 });

    expect(summary.hours).toBe(6);
    expect(before - summary.since.getTime()).toBeGreaterThanOrEqual(6 * 3600000);
    expect(prisma.activityLog.count).toHaveBeenCalledWith({
      where: { createdAt: { gte: summary.since } },
    });
  });
});
