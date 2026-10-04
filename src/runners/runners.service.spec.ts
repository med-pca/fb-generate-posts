import { BrowserState, RunnerMode } from '@prisma/client';
import { RunnersService, sleepUntilOf } from './runners.service';
import { keyHash } from './pairing';

/** Un faux Prisma réduit à ce que le service touche : un profil, sa ligne de
 * pilotage, et le réglage global. Assez pour vérifier les décisions, qui sont
 * la seule chose ici dont une erreur ne se voit pas tout de suite. */
function harness(options: {
  profiles?: Array<{
    id: string;
    name: string;
    externalId: string | null;
    status?: 'ACTIVE' | 'INACTIVE';
    /** Le propriétaire décide de la clé remise à l'appairage. */
    ownerId?: string | null;
    /** Ce que `launcherPlan` lit du propriétaire : sa clé NSTBrowser. */
    owner?: { nstApiKey: string | null; status: string } | null;
    runner?: any;
  }>;
  publishingEnabled?: boolean;
  owners?: Array<{ id: string; status: string; automationKey: string }>;
} = {}) {
  const profiles = (options.profiles ?? []).map((profile) => ({
    status: 'ACTIVE' as const,
    ownerId: null as string | null,
    runner: null as any,
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
    user: {
      findFirst: async ({ where }: any) =>
        (options.owners ?? []).find(
          (owner: any) => owner.id === where.id && owner.status === where.status,
        ) ?? null,
    },
    profileRunner: {
      findUnique: async ({ where }: any) => {
        const profile = profiles.find(
          (p) => p.runner && p.runner.pairCode && p.runner.pairCode === where.pairCode,
        );
        if (!profile) return null;
        return {
          profileId: profile.id,
          pairCodeExpiresAt: profile.runner.pairCodeExpiresAt ?? null,
          profile: {
            name: profile.name,
            externalId: profile.externalId,
            status: profile.status,
            ownerId: profile.ownerId ?? null,
          },
        };
      },
      update: async ({ where, data }: any) => {
        const profile = profiles.find((p) => p.id === where.profileId);
        if (profile) profile.runner = { ...(profile.runner ?? {}), ...data };
        return profile?.runner;
      },
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
  const config = {
    get: (key: string) => (key === 'AUTOMATION_API_KEY' ? 'cle-globale' : undefined),
  };
  return {
    service: new RunnersService(prisma as any, config as any),
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

  it('remet à chaque profil la clé NSTBrowser de son propriétaire', async () => {
    const { service } = harness({
      profiles: [
        { id: 'p1', name: 'A', externalId: 'ext-1', owner: { nstApiKey: 'nst-a', status: 'ACTIVE' } },
        { id: 'p2', name: 'B', externalId: 'ext-2', owner: { nstApiKey: 'nst-b', status: 'ACTIVE' } },
        // Pas de propriétaire, pas de clé, ou un compte désactivé : l'agent
        // garde la clé de sa machine.
        { id: 'p3', name: 'Orphelin', externalId: 'ext-3', owner: null },
        { id: 'p4', name: 'Sans clé', externalId: 'ext-4', owner: { nstApiKey: null, status: 'ACTIVE' } },
        { id: 'p5', name: 'Désactivé', externalId: 'ext-5', owner: { nstApiKey: 'nst-x', status: 'INACTIVE' } },
      ],
    });
    const plan = await service.launcherPlan(null, now);
    expect(plan.profiles.map((p) => [p.externalId, p.nstApiKey])).toEqual([
      ['ext-1', 'nst-a'],
      ['ext-2', 'nst-b'],
      ['ext-3', null],
      ['ext-4', null],
      ['ext-5', null],
    ]);
  });
});

describe('veille du navigateur entre deux lots', () => {
  const now = new Date('2026-09-27T12:00:00Z');

  it('le battement note l’heure de réveil et l’accuse en retour', async () => {
    const { service, upserts } = harness({
      profiles: [{ id: 'p1', name: 'A', externalId: 'ext-1', runner: runner({ mode: RunnerMode.ON }) }],
    });
    const wake = new Date(Date.now() + 20 * 60_000).toISOString();
    const answer = await service.heartbeat('ext-1', { running: true, sleepUntil: wake });
    expect(upserts[0].update.sleepUntil.toISOString()).toBe(wake);
    expect(answer.sleepUntil).toBe(wake);
  });

  it('un battement sans veille l’efface (navigateur rouvert)', async () => {
    const { service, upserts } = harness({
      profiles: [{ id: 'p1', name: 'A', externalId: 'ext-1', runner: runner({ mode: RunnerMode.ON, sleepUntil: new Date(Date.now() + 600_000) }) }],
    });
    const answer = await service.heartbeat('ext-1', { running: true });
    expect(upserts[0].update.sleepUntil).toBeNull();
    expect(answer.sleepUntil).toBeNull();
  });

  it('l’agent ne rouvre pas un navigateur en veille avant l’heure, et ne le referme pas non plus', async () => {
    const { service } = harness({
      profiles: [
        { id: 'p1', name: 'Endormi', externalId: 'ext-1', runner: runner({ mode: RunnerMode.ON, running: true, lastSeenAt: new Date(now.getTime() - 3600_000), sleepUntil: new Date(now.getTime() + 600_000) }) },
        { id: 'p2', name: 'Réveillé', externalId: 'ext-2', runner: runner({ mode: RunnerMode.ON, running: true, lastSeenAt: new Date(now.getTime() - 3600_000), sleepUntil: new Date(now.getTime() - 60_000) }) },
      ],
    });
    const plan = await service.launcherPlan(null, now);
    const [asleep, awake] = plan.profiles;
    expect([asleep.shouldRun, asleep.mayClose]).toEqual([false, false]);
    expect(asleep.reason).toMatch(/en veille jusqu'à 14:10/);
    expect(awake.shouldRun).toBe(true);
    expect(awake.sleepUntil).toBeNull();
  });

  it('une heure de réveil passée ou aberrante est ramenée à du raisonnable', () => {
    expect(sleepUntilOf(undefined, now)).toBeNull();
    expect(sleepUntilOf('2026-09-27T11:00:00Z', now)).toBeNull();
    expect(sleepUntilOf('2026-10-30T11:00:00Z', now)?.toISOString()).toBe('2026-09-28T12:00:00.000Z');
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


describe('appairage', () => {
  const profile = (over: any = {}) => ({
    id: 'p1',
    name: 'Salim',
    externalId: 'ext-1',
    ...over,
  });

  it('émet un code lisible, sans caractères qu’on recopie de travers', async () => {
    const { service } = harness({ profiles: [profile()] });
    const issued = await service.createPairCode('p1');
    expect(issued.code).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$/);
    expect(issued.profileName).toBe('Salim');
    expect(new Date(issued.expiresAt).getTime()).toBeGreaterThan(Date.now());
  });

  it('refuse d’appairer un profil sans identifiant externe', async () => {
    // Le navigateur n'aurait pas de quoi se nommer : l'appairage marcherait et
    // rien ne fonctionnerait ensuite.
    const { service } = harness({ profiles: [profile({ externalId: null })] });
    await expect(service.createPairCode('p1')).rejects.toThrow(/identifiant externe/);
  });

  it('échange le code contre l’adresse, la clé du propriétaire et le profil', async () => {
    const { service } = harness({
      profiles: [profile({ ownerId: 'u1' })],
      owners: [{ id: 'u1', status: 'ACTIVE', automationKey: 'cle-du-compte' }],
    });
    const { code } = await service.createPairCode('p1');
    const paired = await service.pair(code, 'https://post.exemple.test/api', '10.0.0.1');
    expect(paired).toMatchObject({
      apiBaseUrl: 'https://post.exemple.test/api',
      apiKey: 'cle-du-compte',
      profileExternalId: 'ext-1',
      profileName: 'Salim',
    });
  });

  it('retombe sur la clé globale quand le profil n’a pas de propriétaire', async () => {
    const { service } = harness({ profiles: [profile()] });
    const { code } = await service.createPairCode('p1');
    const paired = await service.pair(code, 'https://x/api', '10.0.0.1');
    expect(paired.apiKey).toBe('cle-globale');
  });

  it('un code ne sert qu’une fois', async () => {
    const { service } = harness({ profiles: [profile()] });
    const { code } = await service.createPairCode('p1');
    await service.pair(code, 'https://x/api', '10.0.0.1');
    await expect(service.pair(code, 'https://x/api', '10.0.0.1')).rejects.toThrow(
      /inconnu ou déjà utilisé/,
    );
  });

  it('le code est accepté en minuscules et avec des espaces autour', async () => {
    // Recopié à la main : il arrivera comme cela.
    const { service } = harness({ profiles: [profile()] });
    const { code } = await service.createPairCode('p1');
    const paired = await service.pair(`  ${code.toLowerCase()} `, 'https://x/api', '10.0.0.1');
    expect(paired.profileExternalId).toBe('ext-1');
  });

  it('un code périmé est refusé, et retiré pour ne plus être essayé', async () => {
    const { service, profiles } = harness({ profiles: [profile()] });
    const { code } = await service.createPairCode('p1');
    (profiles[0] as any).runner.pairCodeExpiresAt = new Date(Date.now() - 1000);
    await expect(service.pair(code, 'https://x/api', '10.0.0.1')).rejects.toThrow(/expiré/);
    expect((profiles[0] as any).runner.pairCode).toBeNull();
  });

  it('les codes forcés depuis une même adresse finissent par être refusés', async () => {
    const { service } = harness({ profiles: [profile()] });
    for (let attempt = 0; attempt < 10; attempt += 1) {
      await expect(service.pair('MAUVAIS1', 'https://x/api', '10.0.0.9')).rejects.toThrow(
        /inconnu/,
      );
    }
    await expect(service.pair('MAUVAIS1', 'https://x/api', '10.0.0.9')).rejects.toThrow(
      /Trop de codes/,
    );
    // Une autre adresse n'est pas punie pour autant.
    await expect(service.pair('MAUVAIS1', 'https://x/api', '10.0.0.10')).rejects.toThrow(
      /inconnu/,
    );
  });

  it('un appairage réussi remet le compteur de cette adresse à zéro', async () => {
    const { service } = harness({ profiles: [profile()] });
    for (let attempt = 0; attempt < 9; attempt += 1) {
      await service.pair('MAUVAIS1', 'https://x/api', '10.0.0.11').catch(() => null);
    }
    const { code } = await service.createPairCode('p1');
    await service.pair(code, 'https://x/api', '10.0.0.11');
    // Le compteur est reparti : il reste de la marge pour se tromper.
    await expect(service.pair('MAUVAIS1', 'https://x/api', '10.0.0.11')).rejects.toThrow(
      /inconnu/,
    );
  });

  it('la liste admin dit si un profil est appairé et s’il a un code en attente', async () => {
    const { service } = harness({ profiles: [profile()] });
    let listed = (await service.list(null)).profiles[0];
    expect(listed.pairedAt).toBeNull();
    expect(listed.pairCodePending).toBe(false);

    const { code } = await service.createPairCode('p1');
    listed = (await service.list(null)).profiles[0];
    expect(listed.pairCodePending).toBe(true);

    await service.pair(code, 'https://x/api', '10.0.0.1');
    listed = (await service.list(null)).profiles[0];
    expect(listed.pairCodePending).toBe(false);
    expect(listed.pairedAt).toBeInstanceOf(Date);
  });
});

describe('syncProfiles', () => {
  /** Un faux Prisma qui ne connaît que ces externalId, et garde ce qu'on crée. */
  function syncing(known: string[]) {
    const created: any[] = [];
    const traces: any[] = [];
    const prisma = {
      activityLog: { create: async ({ data }: any) => traces.push(data) },
      profile: {
        findMany: async ({ where }: any) =>
          known
            .filter((id) => where.externalId.in.includes(id))
            .map((externalId) => ({ externalId })),
        createMany: async ({ data, skipDuplicates }: any) => {
          expect(skipDuplicates).toBe(true);
          created.push(...data);
          return { count: data.length };
        },
      },
    };
    const service = new RunnersService(prisma as any, { get: () => '' } as any);
    return { service, created, traces };
  }

  const sofia = { id: 'u1', username: 'sofia', role: 'MANAGER', status: 'ACTIVE' } as any;

  it('crée seulement les profils absents, au nom du compte de la clé', async () => {
    const { service, created } = syncing(['ext-1']);
    const result = await service.syncProfiles(
      [
        { externalId: 'ext-1', name: 'Déjà là' },
        { externalId: 'ext-2', name: 'Nouveau' },
        { externalId: ' ext-2 ', name: 'Doublon' },
        { externalId: 'ext-3', name: '  ' },
      ],
      sofia,
    );
    expect(created).toEqual([
      { externalId: 'ext-2', name: 'Nouveau', ownerId: 'u1' },
      // Sans nom dans NSTBrowser : l'identifiant, plutôt qu'un nom vide.
      { externalId: 'ext-3', name: 'ext-3', ownerId: 'u1' },
    ]);
    expect(result).toMatchObject({ existing: 1, received: 3 });
  });

  it('trace les profils ajoutés dans la synchronisation', async () => {
    const { service, traces } = syncing([]);
    await service.syncProfiles([{ externalId: 'ext-9', name: 'Salim' }], null);
    expect(traces[0]).toMatchObject({ eventType: 'PROFILES_SYNCED' });
    expect(traces[0].message).toContain('Salim');
  });

  it('avec la clé globale, les profils naissent sans propriétaire', async () => {
    const { service, created } = syncing([]);
    await service.syncProfiles([{ externalId: 'ext-1', name: 'A' }], null);
    expect(created[0].ownerId).toBeNull();
  });

  it('une liste vide ne crée rien', async () => {
    const { service, created } = syncing([]);
    expect(await service.syncProfiles([], sofia)).toEqual({ created: [], existing: 0, received: 0 });
    expect(created).toEqual([]);
  });
});

describe('appairage — ce que le serveur retient pour le vérifier', () => {
  it('l’échange du code retient l’empreinte de la clé et l’identifiant remis', async () => {
    const { service, profiles } = harness({
      profiles: [
        {
          id: 'p1',
          name: 'Salim',
          externalId: 'ext-1',
          ownerId: 'u1',
          runner: { pairCode: 'ABCD2345', pairCodeExpiresAt: new Date(Date.now() + 60_000) },
        },
      ],
      owners: [{ id: 'u1', status: 'ACTIVE', automationKey: 'cle-du-compte' }],
    });
    await service.pair('ABCD2345', 'https://api.test/api', '1.2.3.4');
    const { runner } = profiles[0];
    expect(runner.pairedKeyHash).toBe(keyHash('cle-du-compte'));
    expect(runner.pairedExternalId).toBe('ext-1');
    expect(runner.keyRejectedAt).toBeNull();
  });

  it('un battement réussi relit la clé du navigateur et efface un refus', async () => {
    const { service, upserts } = harness({
      profiles: [{ id: 'p1', name: 'Salim', externalId: 'ext-1' }],
    });
    await service.heartbeat('ext-1', {}, null, 'cle-du-navigateur');
    expect(upserts[0].update).toMatchObject({
      pairedKeyHash: keyHash('cle-du-navigateur'),
      keyRejectedAt: null,
    });
  });
});

describe('autoPair — l’extension s’appaire seule', () => {
  function setup(existing: { inScope?: boolean; elsewhere?: boolean } = {}) {
    const upserts: any[] = [];
    const created: any[] = [];
    const prisma: any = {
      profile: {
        findFirst: jest.fn(async ({ where }: any) => {
          const scoped = Object.keys(where).length > 1;
          if (existing.inScope) return { id: 'p1', name: 'Salim', externalId: 'ext-1', status: 'ACTIVE' };
          if (!scoped && existing.elsewhere) return { id: 'p9' };
          return null;
        }),
        create: jest.fn(async ({ data }: any) => {
          created.push(data);
          return { id: 'new', name: data.name, externalId: data.externalId, status: 'ACTIVE' };
        }),
      },
      profileRunner: { upsert: jest.fn(async (args: any) => upserts.push(args)) },
      activityLog: { create: jest.fn(async () => ({})) },
    };
    return { service: new RunnersService(prisma, { get: () => '' } as any), upserts, created };
  }
  const sofia: any = { id: 'u1', username: 'sofia', role: 'MANAGER' };

  it('un profil connu : appairé, avec l’empreinte de la clé', async () => {
    const { service, upserts, created } = setup({ inScope: true });
    const r = await service.autoPair('ext-1', 'Salim', sofia, 'cle-du-compte');
    expect(r).toMatchObject({ profileExternalId: 'ext-1', profileName: 'Salim', created: false });
    expect(created).toEqual([]);
    expect(upserts[0].update).toMatchObject({
      pairedExternalId: 'ext-1',
      pairedKeyHash: keyHash('cle-du-compte'),
      keyRejectedAt: null,
    });
    expect(upserts[0].update.pairedAt).toBeInstanceOf(Date);
  });

  it('un profil absent : créé au nom du compte, avec son nom NSTBrowser', async () => {
    const { service, created } = setup();
    const r = await service.autoPair('ext-2', 'Nadia', sofia, 'k');
    expect(r.created).toBe(true);
    expect(created[0]).toEqual({ externalId: 'ext-2', name: 'Nadia', ownerId: 'u1' });
  });

  it('un profil d’un autre compte est refusé', async () => {
    const { service, created } = setup({ elsewhere: true });
    await expect(service.autoPair('ext-3', 'X', sofia, 'k')).rejects.toThrow('autre compte');
    expect(created).toEqual([]);
  });
});
