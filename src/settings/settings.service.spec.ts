import { ArticlesService } from '../articles/articles.service';
import { SettingsService } from './settings.service';

type Article = {
  id: string;
  title: string;
  articleUrl: string;
  coverImageUrl: string | null;
  hashtags: string[];
  captions: Array<{ text: string; angle?: string }>;
};

type Scenario = {
  /** Cibles disponibles par groupe. */
  stock: Record<string, number>;
  /** Posts du profil visibles au compteur global. */
  profileAvailable: number;
  articles: Article[];
  /** `externalId` des posts déjà écrits pour ce profil. */
  existing?: Array<{ articleId: string; externalId: string }>;
  /** Posts disponibles ne ciblant pas encore le groupe demandé. */
  reusable?: Record<string, string[]>;
  minimumAvailablePerGroup?: number;
  minimumAvailablePerProfile?: number;
  /** Seuils portés par le profil lui-même ; null suit le réglage global. */
  profileMinimumAvailable?: number | null;
  profileMinimumAvailablePerGroup?: number | null;
};

const GROUPS = [
  { id: 'group_1', name: 'Groupe 1' },
  { id: 'group_2', name: 'Groupe 2' },
];

function article(id: string, captions: number): Article {
  return {
    id,
    title: `Article ${id}`,
    articleUrl: `https://exemple.test/${id}`,
    coverImageUrl: null,
    hashtags: ['cuisine'],
    captions: Array.from({ length: captions }, (_, i) => ({
      text: `Légende ${i} de ${id}`,
    })),
  };
}

function makeHarness(scenario: Scenario) {
  const createdPosts: any[] = [];
  const createdTargets: any[] = [];
  const prisma: any = {
    automationSetting: {
      upsert: jest.fn(async () => ({
        autoReplenishEnabled: true,
        minimumAvailablePerProfile: scenario.minimumAvailablePerProfile ?? 10,
        minimumAvailablePerGroup: scenario.minimumAvailablePerGroup ?? 8,
      })),
    },
    profile: {
      findFirst: jest.fn(async () => ({
        id: 'profile_1',
        minimumAvailable: scenario.profileMinimumAvailable ?? null,
        minimumAvailablePerGroup:
          scenario.profileMinimumAvailablePerGroup ?? null,
      })),
    },
    group: { findMany: jest.fn(async () => GROUPS) },
    article: { findMany: jest.fn(async () => scenario.articles) },
    postTarget: {
      groupBy: jest.fn(async () =>
        Object.entries(scenario.stock).map(([groupId, total]) => ({
          groupId,
          _count: { _all: total },
        })),
      ),
      createMany: jest.fn(async ({ data }: any) => {
        createdTargets.push(...data);
        return { count: data.length };
      }),
    },
    post: {
      count: jest.fn(async () => scenario.profileAvailable),
      // Deux appels distincts passent par ici : la recherche de posts
      // réutilisables et le relevé des slots déjà écrits.
      findMany: jest.fn(async ({ where }: any) => {
        if (where.sourceType === 'JSON') return scenario.existing ?? [];
        const groupId = where.targets.none.groupId;
        const ids = scenario.reusable?.[groupId] ?? [];
        return ids.map((id) => ({ id }));
      }),
      create: jest.fn(async ({ data }: any) => {
        createdPosts.push(data);
        return data;
      }),
    },
    activityLog: { create: jest.fn(async () => ({})) },
  };
  const articles = new ArticlesService(prisma);
  return {
    service: new SettingsService(prisma, articles),
    prisma,
    createdPosts,
    createdTargets,
  };
}

describe('SettingsService — alimentation par groupe', () => {
  it('réalimente un groupe presque vide même si le profil est fourni', async () => {
    const { service, createdPosts } = makeHarness({
      // group_2 est à 3 cibles : c'est lui, et lui seul, qui doit être servi.
      stock: { group_1: 8, group_2: 3 },
      profileAvailable: 40,
      articles: [article('art_1', 2), article('art_2', 2)],
    });

    const result = await service.replenishProfile('profile_1');

    expect(result.generated).toBe(5);
    expect(createdPosts).toHaveLength(5);
    for (const post of createdPosts) {
      expect(post.targets.create).toEqual([{ groupId: 'group_2' }]);
    }
    expect(result.groups).toEqual([
      { groupId: 'group_1', name: 'Groupe 1', available: 8, missing: 0 },
      { groupId: 'group_2', name: 'Groupe 2', available: 8, missing: 0 },
    ]);
  });

  it('rejoue le même article en variantes quand le catalogue est épuisé', async () => {
    const { service, createdPosts } = makeHarness({
      stock: { group_1: 8, group_2: 6 },
      profileAvailable: 40,
      minimumAvailablePerGroup: 8,
      articles: [article('art_1', 2)],
      // Les deux légendes de l'article ont déjà servi pour ce profil.
      existing: [
        { articleId: 'art_1', externalId: 'art_1:profile_1:0' },
        { articleId: 'art_1', externalId: 'art_1:profile_1:1' },
      ],
    });

    const result = await service.replenishProfile('profile_1');

    expect(result.generated).toBe(2);
    expect(createdPosts.map((post) => post.externalId)).toEqual([
      'art_1:profile_1:0:v1',
      'art_1:profile_1:1:v1',
    ]);
    expect(createdPosts[0].description).toContain('Légende 0 de art_1');
    expect(createdPosts[0].articleId).toBe('art_1');
  });

  it('rattache d’abord les posts existants avant d’en écrire de nouveaux', async () => {
    const { service, createdPosts, createdTargets } = makeHarness({
      stock: { group_1: 8, group_2: 6 },
      profileAvailable: 40,
      articles: [article('art_1', 2)],
      reusable: { group_2: ['post_a', 'post_b'] },
    });

    const result = await service.replenishProfile('profile_1');

    expect(result.reused).toBe(2);
    expect(result.generated).toBe(0);
    expect(createdPosts).toHaveLength(0);
    expect(createdTargets).toEqual([
      { postId: 'post_a', groupId: 'group_2' },
      { postId: 'post_b', groupId: 'group_2' },
    ]);
  });

  it('ne touche à rien quand chaque groupe est au-dessus du seuil', async () => {
    const { service, prisma } = makeHarness({
      stock: { group_1: 12, group_2: 9 },
      profileAvailable: 40,
      articles: [article('art_1', 2)],
    });

    const result = await service.replenishProfile('profile_1');

    expect(result.generated).toBe(0);
    expect(result.reused).toBe(0);
    expect(prisma.post.create).not.toHaveBeenCalled();
  });

  it('préfère le seuil porté par le profil à celui des réglages', async () => {
    const { service, createdPosts } = makeHarness({
      stock: { group_1: 8, group_2: 8 },
      profileAvailable: 40,
      minimumAvailablePerGroup: 8,
      // Ce profil-ci en veut 12 par groupe : il manque 4 partout.
      profileMinimumAvailablePerGroup: 12,
      articles: [article('art_1', 2)],
    });

    const result = await service.replenishProfile('profile_1');

    expect(result.thresholds).toEqual({ perProfile: 10, perGroup: 12 });
    expect(result.generated).toBe(4);
    for (const post of createdPosts) {
      expect(post.targets.create).toEqual([
        { groupId: 'group_1' },
        { groupId: 'group_2' },
      ]);
    }
  });

  it('retombe sur les réglages globaux quand le profil ne fixe rien', async () => {
    const { service } = makeHarness({
      stock: { group_1: 8, group_2: 8 },
      profileAvailable: 40,
      minimumAvailablePerProfile: 10,
      minimumAvailablePerGroup: 8,
      articles: [article('art_1', 2)],
    });

    const result = await service.replenishProfile('profile_1');

    expect(result.thresholds).toEqual({ perProfile: 10, perGroup: 8 });
    expect(result.generated).toBe(0);
  });

  it('sert tous les groupes actifs quand seul le seuil du profil manque', async () => {
    const { service, createdPosts } = makeHarness({
      stock: { group_1: 8, group_2: 8 },
      profileAvailable: 7,
      minimumAvailablePerProfile: 10,
      articles: [article('art_1', 2)],
    });

    const result = await service.replenishProfile('profile_1');

    expect(result.generated).toBe(3);
    for (const post of createdPosts) {
      expect(post.targets.create).toEqual([
        { groupId: 'group_1' },
        { groupId: 'group_2' },
      ]);
    }
  });
});
