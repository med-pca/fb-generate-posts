import { InsightsService, startOfLocalDay } from './insights.service';

const now = new Date('2026-09-30T13:00:00Z'); // 15 h à Paris
const published = (n: number, groupId: string, profileId: string, minutesAgo = 90) =>
  Array.from({ length: n }, () => ({
    publishedAt: new Date(now.getTime() - minutesAgo * 60_000),
    job: { profileId },
    postTarget: { groupId },
  }));
const group = (id: string, category: string | null, profiles: Array<{ id: string; mode: string }>) => ({
  id,
  name: id,
  category: category ? { id: category, name: category } : null,
  profiles: profiles.map((p) => ({ profile: { id: p.id, name: p.id, runner: { mode: p.mode } } })),
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
        group('g3', 'Recettes', []),
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
    expect(o.groups.find((g) => g.id === 'g3')?.blocked).toBe('no_profile');
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
    expect(texts).toMatch(/En retard de 40/);
  });

  it('le début de journée suit le fuseau de l’objectif', () => {
    // 13 h UTC = 15 h à Paris : minuit à Paris = 22 h UTC la veille.
    expect(startOfLocalDay(now, 'Europe/Paris').toISOString()).toBe('2026-09-29T22:00:00.000Z');
  });
});
