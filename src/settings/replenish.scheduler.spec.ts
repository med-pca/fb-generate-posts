import { ReplenishScheduler } from './replenish.scheduler';

function makeScheduler(
  env: Record<string, string | undefined>,
  replenishAll: jest.Mock,
) {
  const config = { get: (key: string) => env[key] };
  const prisma: any = { activityLog: { create: jest.fn(async () => ({})) } };
  const settings: any = { replenishAll };
  const scheduler = new ReplenishScheduler(config as any, settings, prisma);
  return { scheduler, prisma };
}

const result = (generated: number, reused = 0) => ({
  profileId: 'p1',
  generated,
  reused,
});

describe('ReplenishScheduler — cadence', () => {
  it('prend la valeur de l’environnement', () => {
    const { scheduler } = makeScheduler(
      { REPLENISH_INTERVAL_MINUTES: '30' },
      jest.fn(),
    );
    expect(scheduler.intervalMinutes()).toBe(30);
  });

  it('retombe sur 15 minutes sans valeur, et ignore une valeur illisible', () => {
    expect(makeScheduler({}, jest.fn()).scheduler.intervalMinutes()).toBe(15);
    expect(
      makeScheduler(
        { REPLENISH_INTERVAL_MINUTES: 'jamais' },
        jest.fn(),
      ).scheduler.intervalMinutes(),
    ).toBe(15);
  });

  it('0 désactive le minuteur, et aucun intervalle n’est armé', () => {
    const { scheduler } = makeScheduler(
      { REPLENISH_INTERVAL_MINUTES: '0' },
      jest.fn(),
    );
    expect(scheduler.intervalMinutes()).toBe(0);

    const setInterval = jest.spyOn(global, 'setInterval');
    scheduler.onModuleInit();
    expect(setInterval).not.toHaveBeenCalled();
    setInterval.mockRestore();
  });
});

describe('ReplenishScheduler — passage', () => {
  it('additionne ce que chaque profil a produit', async () => {
    const { scheduler, prisma } = makeScheduler(
      {},
      jest.fn(async () => [result(3, 1), result(2)]),
    );

    expect(await scheduler.run()).toEqual({
      profiles: 2,
      generated: 5,
      reused: 1,
    });
    expect(prisma.activityLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ eventType: 'REPLENISH_SCHEDULED' }),
      }),
    );
  });

  // Un passage toutes les 15 minutes qui n'a rien à faire écrirait 96 lignes
  // par jour et noierait les journaux utiles.
  it('n’écrit rien en base quand il n’y avait rien à faire', async () => {
    const { scheduler, prisma } = makeScheduler(
      {},
      jest.fn(async () => [result(0), result(0)]),
    );

    await scheduler.run();
    expect(prisma.activityLog.create).not.toHaveBeenCalled();
  });

  it('saute le tour si le précédent n’est pas fini', async () => {
    let release!: (value: unknown) => void;
    const enCours = new Promise((resolve) => (release = resolve));
    const replenishAll = jest.fn(async () => {
      await enCours;
      return [result(1)];
    });
    const { scheduler } = makeScheduler({}, replenishAll);

    const premier = scheduler.run();
    expect(await scheduler.run()).toEqual({ skipped: 'already_running' });
    release([]);
    await premier;

    expect(replenishAll).toHaveBeenCalledTimes(1);
    // Le verrou est bien relâché : le tour suivant repart.
    await scheduler.run();
    expect(replenishAll).toHaveBeenCalledTimes(2);
  });

  // Une exception qui remonte tuerait le minuteur : les profils se videraient
  // ensuite en silence.
  it('avale l’erreur, la trace, et reste utilisable', async () => {
    const replenishAll = jest
      .fn()
      .mockRejectedValueOnce(new Error('base injoignable'))
      .mockResolvedValueOnce([result(1)]);
    const { scheduler, prisma } = makeScheduler({}, replenishAll);

    expect(await scheduler.run()).toEqual({ error: 'base injoignable' });
    expect(prisma.activityLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          eventType: 'REPLENISH_FAILED',
          level: 'ERROR',
        }),
      }),
    );
    expect(await scheduler.run()).toMatchObject({ generated: 1 });
  });
});
