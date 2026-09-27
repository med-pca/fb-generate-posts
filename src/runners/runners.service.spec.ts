import { BrowserState, RunnerMode } from '@prisma/client';
import { RunnersService } from './runners.service';

/** Un faux Prisma réduit à ce que le service touche : un profil, sa ligne de
 * pilotage, et le réglage global. Assez pour vérifier les décisions, qui sont
 * la seule chose ici dont une erreur ne se voit pas tout de suite. */
function harness(options: {
  profiles?: Array<{
    id: string;
    name: string;
    externalId: string | null;
    status?: 'ACTIVE' | 'INACTIVE';
    runner?: any;
  }>;
  publishingEnabled?: boolean;
} = {}) {
  const profiles = (options.profiles ?? []).map((profile) => ({
    status: 'ACTIVE' as const,
    runner: null,
    ...profile,
  }));
  const upserts: any[] = [];
  const prisma = {
    automationSetting: {
      upsert: async () => ({
        id: 'global',
        publishingEnabled: options.publishingEnabled ?? true,
      }),
    },
    profile: {
      findFirst: async ({ where }: any) =>
        profiles.find(
          (profile) =>
            (where.id === undefined || profile.id === where.id) &&
            (where.externalId === undefined ||
              profile.externalId === where.externalId),
        ) ?? null,
      findMany: async () => profiles,
    },
    profileRunner: {
      upsert: async ({ where, create, update }: any) => {
        upserts.push({ where, create, update });
        const profile = profiles.find((p) => p.id === where.profileId);
        const merged = {
          mode: RunnerMode.OFF,
          windowStart: null,
          windowEnd: null,
          days: null,
          timezone: 'Europe/Paris',
          settings: null,
          running: false,
          lastSeenAt: null,
          browserState: BrowserState.STOPPED,
          ...(profile?.runner ?? {}),
          ...(profile?.runner ? update : create),
        };
        if (profile) profile.runner = merged;
        return merged;
      },
    },
  };
  return {
    service: new RunnersService(prisma as any),
    upserts,
    profiles,
  };
}

const runner = (over: Partial<Record<string, any>> = {}) => ({
  mode: RunnerMode.AUTO,
  windowStart: null,
  windowEnd: null,
  days: null,
  timezone: 'Europe/Paris',
  settings: null,
  running: false,
  lastSeenAt: null,
  browserState: BrowserState.STOPPED,
  ...over,
});

describe('decide', () => {
  const { service } = harness();

  it('un profil jamais piloté reste à l’arrêt', () => {
    const decision = service.decide(null, true, true);
    expect(decision.run).toBe(false);
    expect(decision.mode).toBe(RunnerMode.OFF);
    expect(decision.reason).toContain('jamais piloté');
  });

  it('le coupe-circuit global passe avant tout le reste', () => {
    const decision = service.decide(runner({ mode: RunnerMode.ON }), true, false);
    expect(decision.run).toBe(false);
    expect(decision.reason).toContain('globalement');
  });

  it('un profil inactif ne publie pas, même en marche forcée', () => {
    expect(service.decide(runner({ mode: RunnerMode.ON }), false, true).run).toBe(false);
  });

  it('la marche forcée ignore la fenêtre horaire', () => {
    const decision = service.decide(
      runner({ mode: RunnerMode.ON, windowStart: 0, windowEnd: 1 }),
      true,
      true,
      new Date('2026-09-27T12:00:00Z'),
    );
    expect(decision.run).toBe(true);
    expect(decision.reason).toContain('forcée');
  });

  it('en AUTO, la fenêtre horaire décide, à l’heure du profil', () => {
    // 12:00 UTC = 14:00 à Paris, 08:00 à New York.
    const now = new Date('2026-09-27T12:00:00Z');
    const window = { windowStart: 13 * 60, windowEnd: 15 * 60 };
    expect(service.decide(runner(window), true, true, now).run).toBe(true);
    expect(
      service.decide(runner({ ...window, timezone: 'America/New_York' }), true, true, now).run,
    ).toBe(false);
  });

  it('un fuseau inconnu ne bloque pas la décision, il est signalé', () => {
    const decision = service.decide(
      runner({ timezone: 'Mars/Olympus', windowStart: 11 * 60, windowEnd: 13 * 60 }),
      true,
      true,
      new Date('2026-09-27T12:00:00Z'),
    );
    expect(decision.run).toBe(true);
    expect(decision.reason).toContain('inconnu');
  });

  it('les réglages poussés voyagent avec l’ordre, même à l’arrêt', () => {
    const settings = { staggerSeconds: 300 };
    expect(service.decide(runner({ mode: RunnerMode.OFF, settings }), true, true).settings).toEqual(settings);
  });
});

describe('heartbeat', () => {
  it('enregistre l’état et renvoie l’ordre dans le même appel', async () => {
    const { service, upserts } = harness({
      profiles: [{ id: 'p1', name: 'Profil A', externalId: 'ext-1', runner: runner({ mode: RunnerMode.ON }) }],
    });
    const answer = await service.heartbeat('ext-1', {
      running: true,
      phase: 'publication',
      published: 3,
      agent: 'extension 1.0.0',
    });
    expect(answer.run).toBe(true);
    expect(upserts[0].update).toMatchObject({ running: true, phase: 'publication', published: 3 });
    expect(upserts[0].update.lastSeenAt).toBeInstanceOf(Date);
  });

  it('fait naître la ligne de pilotage d’un profil inconnu, à l’arrêt', async () => {
    const { service, upserts } = harness({
      profiles: [{ id: 'p1', name: 'Profil A', externalId: 'ext-1' }],
    });
    const answer = await service.heartbeat('ext-1', { running: false });
    expect(answer.run).toBe(false);
    expect(answer.mode).toBe(RunnerMode.OFF);
    expect(upserts[0].create).toMatchObject({ profileId: 'p1' });
  });

  it('refuse un profil que l’appelant ne voit pas', async () => {
    const { service } = harness({ profiles: [] });
    await expect(service.heartbeat('ext-inconnu', {})).rejects.toThrow('Profil introuvable');
  });
});

describe('launcherPlan', () => {
  const now = new Date('2026-09-27T12:00:00Z');

  it('dit quoi ouvrir, et ne referme pas un navigateur au travail', async () => {
    const { service } = harness({
      profiles: [
        { id: 'p1', name: 'A ouvrir', externalId: 'ext-1', runner: runner({ mode: RunnerMode.ON }) },
        {
          id: 'p2',
          name: 'A fermer plus tard',
          externalId: 'ext-2',
          // L'ordre vient de passer à OFF, mais son extension publie encore.
          runner: runner({ mode: RunnerMode.OFF, running: true, lastSeenAt: new Date(now.getTime() - 30_000) }),
        },
        {
          id: 'p3',
          name: 'A fermer',
          externalId: 'ext-3',
          runner: runner({ mode: RunnerMode.OFF, running: true, lastSeenAt: new Date(now.getTime() - 600_000) }),
        },
      ],
    });
    const plan = await service.launcherPlan(null, now);
    expect(plan.profiles.map((p) => [p.externalId, p.shouldRun, p.mayClose])).toEqual([
      ['ext-1', true, false],
      ['ext-2', false, false],
      ['ext-3', false, true],
    ]);
  });

  it('écarte les profils sans externalId : il n’y a pas de profil à ouvrir', async () => {
    const { service } = harness({
      profiles: [{ id: 'p1', name: 'Sans identifiant', externalId: null }],
    });
    // findMany est filtré par l'API ; le plan ne doit de toute façon pas
    // renvoyer une ligne sans identifiant de profil NSTBrowser.
    const plan = await service.launcherPlan(null, now);
    expect(plan.profiles.every((p) => p.externalId !== null)).toBe(true);
  });
});

describe('list', () => {
  const now = new Date('2026-09-27T12:00:00Z');

  it('distingue « il dit travailler » de « il travaille vraiment »', async () => {
    const { service } = harness({
      profiles: [
        {
          id: 'p1',
          name: 'Muet',
          externalId: 'ext-1',
          // running: true mais plus vu depuis dix minutes : un worker mort
          // reste `running` à jamais, donc l'admin doit le voir comme tel.
          runner: runner({ mode: RunnerMode.ON, running: true, lastSeenAt: new Date(now.getTime() - 600_000) }),
        },
      ],
    });
    const { profiles } = await service.list(null, now);
    expect(profiles[0].running).toBe(true);
    expect(profiles[0].atWork).toBe(false);
  });
});
