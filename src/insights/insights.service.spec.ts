import { InsightsService, startOfLocalDay } from './insights.service';

const now = new Date('2026-09-30T13:00:00Z'); // 15 h à Paris
const published = (n: number, groupId: string, profileId: string, minutesAgo = 90) =>
  Array.from({ length: n }, () => ({
    publishedAt: new Date(now.getTime() - minutesAgo * 60_000),
    job: { profileId },
    postTarget: { groupId },
  }));
const group = (
  id: string,
  category: string | null,
  profiles: Array<{ id: string; mode: string }>,
  pendingJoins = 0,
) => ({
  id,
  name: id,
  category: category ? { id: category, name: category } : null,
  profiles: profiles.map((p) => ({ profile: { id: p.id, name: p.id, runner: { mode: p.mode } } })),
  _count: { profiles: pendingJoins },
});

function setup() {
  const prisma: any = {
    automationSetting: {
      upsert: async () => ({ dailyTarget: 200, objectiveStart: 480, objectiveEnd: 1320, objectiveTimezone: 'Europe/Paris' }),
    },
    publicationJobItem: {
      findMany: async () => [...published(40, 'g1', 'salim'), ...published(20, 'g2', 'nadia', 30)],
    },
    postTarget: {
      count: async () => 0,
      groupBy: async () => [
        { groupId: 'g1', _count: { _all: 30 } },
        { groupId: 'g2', _count: { _all: 10 } },
        { groupId: 'g3', _count: { _all: 25 } },
      ],
    },
    group: {
      findMany: async () => [
        group('g1', 'Recettes', [{ id: 'salim', mode: 'AUTO' }]),
        group('g2', 'Recettes', [{ id: 'nadia', mode: 'ON' }]),
        group('g3', 'Recettes', [], 4),
      ],
    },
    profile: {
      findMany: async () => [
        { id: 'salim', name: 'Salim', runner: { mode: 'AUTO', running: true, lastSeenAt: now }, _count: { profileGroups: 1 } },
        { id: 'nadia', name: 'Nadia', runner: { mode: 'ON', running: false, lastSeenAt: null }, _count: { profileGroups: 1 } },
        { id: 'omar', name: 'Omar', runner: { mode: 'OFF' }, _count: { profileGroups: 0 } },
      ],
    },
    article: { count: async () => 3 },
  };
  return new InsightsService(prisma);
}

describe('InsightsService.objective', () => {
  it('dit où l’on en est, ce qu’il manque et où ça coince', async () => {
    const o = await setup().objective(null, now);
    // 60 publiés, 15 h = 7/14 de la plage : on en attend 100.
    expect(o.pace).toMatchObject({ published: 60, expected: 100, status: 'late', remaining: 140 });
    // Dernière heure : les 20 de Nadia.
    expect(o.pace.ratePerHour).toBe(20);
    // g3 n'a aucun profil : son stock ne partira pas.
    expect(o.stock).toEqual({ publishable: 40, blocked: 25, deficit: 100 });
    // Aucun profil « Rejoint », mais 4 demandes en attente.
    expect(o.groups.find((g) => g.id === 'g3')).toMatchObject({ blocked: 'requests_pending', pendingJoins: 4 });
    // 2 groupes prêts dans « Recettes » : 1 article = 2 posts → 50 articles.
    expect(o.articles.needed).toBe(50);
    expect(o.categories[0]).toMatchObject({ name: 'Recettes', groups: 3, publishableGroups: 2, articlesNeeded: 50 });
    // Deux profils participent : 100 chacun.
    expect(o.profiles).toMatchObject({ participating: 2, share: 100, atWork: 1 });
    expect(o.profiles.rows.find((p) => p.id === 'salim')?.publishedToday).toBe(40);
    // Les publications tombent dans l'heure locale (13 h 30 UTC → 13 h 30... Paris = 13 h ou 14 h).
    expect(o.hourly.reduce((a, b) => a + b, 0)).toBe(60);
    const texts = o.advice.map((a) => a.text).join(' | ');
    expect(texts).toMatch(/Stock insuffisant/);
    expect(texts).toMatch(/ne partiront pas/);
    expect(texts).toMatch(/demandes d’adhésion y sont en attente/);
    expect(texts).toMatch(/En retard de 40/);
  });

  it('le début de journée suit le fuseau de l’objectif', () => {
    // 13 h UTC = 15 h à Paris : minuit à Paris = 22 h UTC la veille.
    expect(startOfLocalDay(now, 'Europe/Paris').toISOString()).toBe('2026-09-29T22:00:00.000Z');
  });
});

/** L'exemple de l'équipe : 20 groupes, objectif 300 posts → 15 articles. */
describe('InsightsService.objective — plan du jour en articles', () => {
  it('300 posts ÷ 20 groupes = 15 articles, avec terminés, en cours, prêts et à importer', async () => {
    const groups = Array.from({ length: 20 }, (_, i) => group(`g${i}`, 'Recettes', [{ id: 'salim', mode: 'AUTO' }]));
    // Aujourd'hui : A dans les 20 groupes (terminé), B dans 5 (en cours).
    const items = [
      ...groups.map((g) => ({ publishedAt: new Date(now.getTime() - 3_600_000), job: { profileId: 'salim' }, postTarget: { groupId: g.id, postId: 'A' } })),
      ...groups.slice(0, 5).map((g) => ({ publishedAt: new Date(now.getTime() - 600_000), job: { profileId: 'salim' }, postTarget: { groupId: g.id, postId: 'B' } })),
    ];
    const prisma: any = {
      automationSetting: { upsert: async () => ({ dailyTarget: 300, objectiveStart: 480, objectiveEnd: 1320, objectiveTimezone: 'Europe/Paris' }) },
      publicationJobItem: { findMany: async () => items },
      postTarget: {
        count: async () => 0,
        groupBy: async (args: any) =>
          args.by[0] === 'postId'
            ? [{ postId: 'B', _count: { _all: 15 } }, { postId: 'C', _count: { _all: 20 } }, { postId: 'D', _count: { _all: 20 } }]
            : groups.map((g) => ({ groupId: g.id, _count: { _all: 3 } })),
      },
      group: { findMany: async () => groups },
      profile: { findMany: async () => [{ id: 'salim', name: 'Salim', runner: { mode: 'AUTO', running: true, lastSeenAt: now }, _count: { profileGroups: 20 } }] },
      article: { count: async () => 0 },
    };
    const o: any = await new InsightsService(prisma).objective(null, now);
    expect(o.plan).toMatchObject({ postsPerArticle: 20, articlesPerDay: 15, done: 1, inProgress: 1, ready: 2, missing: 11 });
    // Plage 8 h → 22 h = 840 min : un article toutes les 56 min.
    expect(o.plan.everyMinutes).toBe(56);
    expect(o.advice.map((a: any) => a.text).join(' | ')).toMatch(/il manque 11 article\(s\) à importer/);
  });
});

import { adaptiveGap } from './objective';

/** Le cas vu en production : 7/h, il faut 19/h, 7 profils au travail. */
describe('adaptiveGap — cadence selon les profils au travail', () => {
  const base = { ratePerHour: 7, minGap: 5, status: 'late' as const };

  it('7 profils, besoin 19/h → un post toutes les ~22 min par profil (19 min d’attente + publication)', () => {
    expect(adaptiveGap({ ...base, neededPerHour: 19, profiles: 7 })).toBe(19);
  });

  it('moins de profils au travail → chacun attend moins ; plus de profils → chacun attend plus', () => {
    const three = adaptiveGap({ ...base, neededPerHour: 19, profiles: 3 })!;
    const ten = adaptiveGap({ ...base, neededPerHour: 19, profiles: 10 })!;
    expect(three).toBeLessThan(19);
    expect(ten).toBeGreaterThan(19);
  });

  it('jamais sous le minimum de sécurité', () => {
    expect(adaptiveGap({ ...base, neededPerHour: 200, profiles: 2 })).toBe(5);
  });

  it('rien à adapter : en avance et au rythme, aucun profil, pas d’objectif, plage finie', () => {
    expect(adaptiveGap({ ...base, neededPerHour: 10, ratePerHour: 15, profiles: 5, status: 'ahead' })).toBeNull();
    expect(adaptiveGap({ ...base, neededPerHour: 19, profiles: 0 })).toBeNull();
    expect(adaptiveGap({ ...base, neededPerHour: 0, profiles: 7 })).toBeNull();
    expect(adaptiveGap({ ...base, neededPerHour: 19, profiles: 7, status: 'missed' })).toBeNull();
  });
});

describe('InsightsService.objective — plage de 24 h', () => {
  it('le plan donne une vraie cadence quand la plage va de minuit à minuit', async () => {
    const groups = Array.from({ length: 10 }, (_, i) => group(`g${i}`, 'Recettes', [{ id: 'salim', mode: 'AUTO' }]));
    const prisma: any = {
      automationSetting: { upsert: async () => ({ dailyTarget: 200, objectiveStart: 0, objectiveEnd: 0, objectiveTimezone: 'Europe/Paris', adaptivePacing: true, minPostGapMinutes: 5 }) },
      publicationJobItem: { findMany: async () => [] },
      postTarget: { count: async () => 0, groupBy: async () => [] },
      group: { findMany: async () => groups },
      profile: { findMany: async () => [{ id: 'salim', name: 'Salim', runner: { mode: 'AUTO', running: true, lastSeenAt: now }, _count: { profileGroups: 10 } }] },
      article: { count: async () => 0 },
    };
    const o: any = await new InsightsService(prisma).objective(null, now);
    expect(o.plan.articlesPerDay).toBe(20);
    expect(o.plan.everyMinutes).toBe(72); // 1440 min ÷ 20
    expect(o.plan.expectedNow).toBeGreaterThan(0); // 15 h à Paris
    expect(o.pacing).toMatchObject({ enabled: true, profiles: 1, minGap: 5 });
    expect(o.pacing.gapMinutes).not.toBeNull();
  });
});
