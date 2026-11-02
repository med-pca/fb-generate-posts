import Fastify from 'fastify';
import { countSql } from './perf-context';
import { callerOf, percentile, readRoute } from './perf-report';
import { PerfService } from './perf.service';

const sum = (over: Partial<Parameters<typeof readRoute>[0]> = {}) => ({
  method: 'GET', route: '/api/campaigns', count: 600, errors: 0, totalMs: 600 * 300, maxMs: 2500, sqlCount: 600 * 4, sqlMs: 600 * 100,
  bytes: 600 * 5000, gets: 600, repeats: 540, buckets: [0, 0, 0, 100, 500, 0, 0, 0, 0, 0], ...over,
});

describe('Performance — lecture d’une route', () => {
  it('percentiles d’après la répartition des durées', () => {
    expect(percentile([0, 0, 0, 100, 500, 0, 0, 0, 0, 0], 0.5)).toBe(500);
    expect(percentile([90, 0, 0, 0, 0, 0, 0, 0, 0, 10], 0.95)).toBe(10_000);
  });

  it('réponses souvent identiques et fréquentes : cache conseillé', () => {
    const r = readRoute(sum(), 60);
    expect(r.repeatRatio).toBe(90);
    expect(r.advice.find((a) => a.kind === 'cache')?.text).toContain('cache de 30 s');
  });

  it('beaucoup de requêtes SQL par appel : N+1 ; lent en base : index', () => {
    const r = readRoute(sum({ sqlCount: 600 * 40, sqlMs: 600 * 900, totalMs: 600 * 1000, buckets: [0, 0, 0, 0, 0, 0, 600, 0, 0, 0] }), 60);
    expect(r.advice.map((a) => a.kind)).toEqual(expect.arrayContaining(['n+1', 'db']));
  });

  it('qui appelle : page d’un compte, extension, agent', () => {
    expect(callerOf({ route: '/api/campaigns', hasApiKey: false, user: { username: 'ayoub', role: 'MANAGER' } })).toBe('page gestionnaire · ayoub');
    expect(callerOf({ route: '/api/verify/control', hasApiKey: true })).toBe('extension Modérateur');
    expect(callerOf({ route: '/api/runners/plan', hasApiKey: true })).toBe('agent NSTBrowser');
  });
});

describe('Performance — mesure de vrais appels', () => {
  it('compte durée, requêtes SQL (contexte par appel) et réponses identiques', async () => {
    const created: any[] = [];
    const prisma: any = {
      automationSetting: { findUnique: jest.fn(async () => ({ perfEnabled: true })) },
      apiMetric: { createMany: jest.fn(async ({ data }: any) => created.push(...data)), deleteMany: jest.fn() },
      apiSlowCall: { createMany: jest.fn(), deleteMany: jest.fn() },
    };
    const perf = new PerfService(prisma);
    const app = Fastify();
    perf.register(app);
    app.get('/api/things', async () => {
      // Deux « requêtes SQL » pendant l'appel.
      countSql(3);
      await new Promise((r) => setTimeout(r, 2));
      countSql(4);
      return { same: true };
    });
    for (let i = 0; i < 3; i += 1) await app.inject({ method: 'GET', url: '/api/things' });
    await perf.flush();
    expect(created).toHaveLength(1);
    expect(created[0]).toMatchObject({ method: 'GET', route: '/api/things', caller: 'sans compte', count: 3, sqlCount: 6, gets: 3, repeats: 2 });
    expect(created[0].sqlMs).toBeCloseTo(21);
  });
});
