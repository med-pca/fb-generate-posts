import { NotFoundException } from '@nestjs/common';
import { QueueService } from './queue.service';

const post = (id: string, priority = 0) => ({
  id,
  title: `Post ${id}`,
  description: 'Texte',
  imageUrl: null,
  priority,
  createdAt: new Date('2026-09-29T10:00:00Z'),
  article: null,
  url: 'https://site.test/article',
});
const group = { id: 'g1', name: 'Recettes FR', url: 'https://fb/g1', category: { id: 'c1', name: 'Recettes' } };
const profile = { id: 'p1', name: 'Salim', externalId: 'ext-1' };

function setup() {
  const findMany = jest.fn(async ({ where }: any) => {
    if (where.status === 'AVAILABLE') {
      return [
        { id: 't-a', forcedProfile: profile, forcedAt: new Date(), post: post('a', 5), group: { ...group, profiles: [{ profile }] } },
        { id: 't-b', forcedProfile: null, forcedAt: null, post: post('b'), group: { ...group, profiles: [] } },
      ];
    }
    if (where.status === 'FAILED') {
      return [
        {
          id: 't-f',
          lastError: 'Groupe fermé aux publications',
          attemptsCount: 2,
          updatedAt: new Date(),
          post: post('f'),
          group: { ...group, profiles: [{ profile }] },
          jobItems: [{ error: 'x', job: { profile } }],
        },
      ];
    }
    if (where.status === 'PUBLISHED') {
      return [
        {
          id: 't-p',
          publishedAt: new Date('2026-09-29T12:00:00Z'),
          commentedAt: new Date(),
          linkUpdatedAt: null,
          post: post('p'),
          group,
          jobItems: [
            { externalPostUrl: 'https://facebook.com/groups/g1/posts/9', publishedAt: null, job: { profile } },
          ],
        },
      ];
    }
    return [
      {
        id: 't-r',
        status: 'CONSUMED',
        claimedAt: new Date(),
        claimExpiresAt: new Date(),
        post: post('r'),
        group,
        jobItems: [{ job: { id: 'job1', profile } }],
      },
    ];
  });
  const prisma: any = {
    postTarget: { findMany, count: jest.fn(async () => 7) },
    post: {
      findFirst: jest.fn(async ({ where }: any) => (where.id === 'a' ? { id: 'a', priority: 2 } : null)),
      aggregate: jest.fn(async () => ({ _max: { priority: 9 } })),
      update: jest.fn(async ({ data }: any) => ({ id: 'a', ...data })),
    },
  };
  return { service: new QueueService(prisma), prisma, findMany };
}

describe('QueueService.queue', () => {
  it('montre en cours, à venir dans l’ordre, et publiés avec groupe et profil', async () => {
    const { service } = setup();
    const q = await service.queue({ limit: 10, publishedLimit: 20 }, null);
    expect(q.counts).toEqual({ running: 7, upcoming: 7, published: 7, failed: 7 });
    expect(q.failed[0]).toMatchObject({
      error: 'Groupe fermé aux publications',
      attempts: 2,
      profile: { name: 'Salim' },
      candidates: [profile],
    });
    expect(q.upcoming[0].forcedProfile).toEqual(profile);

    expect(q.running[0]).toMatchObject({ state: 'publishing', profile: { name: 'Salim' }, group: { name: 'Recettes FR' } });

    expect(q.upcoming.map((u) => [u.rank, u.post.id])).toEqual([[1, 'a'], [2, 'b']]);
    expect(q.upcoming[0].candidates).toEqual([profile]);

    expect(q.published[0]).toMatchObject({
      group: { name: 'Recettes FR', category: { name: 'Recettes' } },
      profile: { name: 'Salim' },
      facebookUrl: 'https://facebook.com/groups/g1/posts/9',
      link: 'waiting',
    });
  });

  it('prend les prochains dans l’ordre de la réservation : priorité puis ancienneté', async () => {
    const { service, findMany } = setup();
    await service.queue({ limit: 10, publishedLimit: 20 }, null);
    const upcoming = findMany.mock.calls.find(([args]: any) => args.where.status === 'AVAILABLE')![0];
    expect(upcoming.orderBy).toEqual([
      { forcedProfileId: { sort: 'asc', nulls: 'last' } },
      { post: { priority: 'desc' } },
      { post: { createdAt: 'asc' } },
      { createdAt: 'asc' },
    ]);
    expect(upcoming.take).toBe(10);
  });

  it('filtre par catégorie', async () => {
    const { service, findMany } = setup();
    await service.queue({ categoryId: 'c1', limit: 10, publishedLimit: 20 }, null);
    for (const [args] of findMany.mock.calls) {
      expect(args.where.group).toMatchObject({ categoryId: 'c1' });
    }
  });
});

describe('QueueService.setPriority', () => {
  it('« en tête » passe devant le plus prioritaire', async () => {
    const { service, prisma } = setup();
    await service.setPriority('a', { move: 'top' }, null);
    expect(prisma.post.update.mock.calls[0][0].data.priority).toBe(10);
  });

  it('monter, descendre, remettre à zéro', async () => {
    const { service, prisma } = setup();
    await service.setPriority('a', { move: 'up' }, null);
    await service.setPriority('a', { move: 'down' }, null);
    await service.setPriority('a', { move: 'reset' }, null);
    expect(prisma.post.update.mock.calls.map(([args]: any) => args.data.priority)).toEqual([3, 1, 0]);
  });

  it('refuse un post hors de portée', async () => {
    const { service } = setup();
    await expect(service.setPriority('zz', { move: 'up' }, null)).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('QueueService — actions sur une publication', () => {
  function actions(target: Record<string, unknown>, extra: Record<string, any> = {}) {
    const prisma: any = {
      postTarget: {
        findFirst: jest.fn(async () => ({
          id: 't1',
          groupId: 'g1',
          postId: 'post1',
          claimExpiresAt: null,
          post: { title: 'Gratin' },
          group: { name: 'Recettes FR' },
          ...target,
        })),
        update: jest.fn((args: any) => args),
        delete: jest.fn((args: any) => ({ deleted: args })),
        count: jest.fn(async () => extra.remaining ?? 1),
      },
      post: {
        delete: jest.fn((args: any) => ({ postDeleted: args })),
        count: jest.fn(async () => extra.allowed ?? 1),
      },
      profile: { findFirst: jest.fn(async () => extra.profile ?? null) },
      activityLog: { create: jest.fn((args: any) => args) },
      $transaction: jest.fn(async (ops: any[]) => ops),
    };
    return { service: new QueueService(prisma), prisma };
  }
  const salim = (over: Record<string, unknown> = {}) => ({
    id: 'p1', name: 'Salim', ownerId: null, runner: { mode: 'AUTO' }, profileGroups: [{ id: 'pg' }], ...over,
  });

  it('relance un échec : il repart en attente, raison effacée', async () => {
    const { service, prisma } = actions({ status: 'FAILED' });
    await service.retry('t1', null);
    expect(prisma.postTarget.update.mock.calls[0][0].data).toMatchObject({ status: 'AVAILABLE', lastError: null });
  });

  it('ne relance que ce qui a échoué', async () => {
    const { service } = actions({ status: 'PUBLISHED' });
    await expect(service.retry('t1', null)).rejects.toThrow('échec');
  });

  it('retire un post d’un seul groupe, sans toucher aux autres', async () => {
    const { service, prisma } = actions({ status: 'AVAILABLE' }, { remaining: 2 });
    expect(await service.removeTarget('t1', null)).toEqual({ removed: true, postDeleted: false });
    expect(prisma.postTarget.delete).toHaveBeenCalledWith({ where: { id: 't1' } });
    expect(prisma.post.delete).not.toHaveBeenCalled();
  });

  it('supprime le post s’il ne visait que ce groupe', async () => {
    const { service, prisma } = actions({ status: 'FAILED' }, { remaining: 0 });
    expect(await service.removeTarget('t1', null)).toEqual({ removed: true, postDeleted: true });
    expect(prisma.post.delete).toHaveBeenCalledWith({ where: { id: 'post1' } });
  });

  it('refuse de retirer une publication faite ou en cours', async () => {
    for (const status of ['PUBLISHED', 'CONSUMED']) {
      const { service } = actions({ status });
      await expect(service.removeTarget('t1', null)).rejects.toThrow('faite ou en cours');
    }
    const live = actions({ status: 'CLAIMED', claimExpiresAt: new Date(Date.now() + 60_000) });
    await expect(live.service.removeTarget('t1', null)).rejects.toThrow('faite ou en cours');
  });

  it('force l’envoi par un profil qui a rejoint le groupe', async () => {
    const { service, prisma } = actions({ status: 'FAILED' }, { profile: salim() });
    const result = await service.force('t1', 'p1', null);
    expect(prisma.postTarget.update.mock.calls[0][0].data).toMatchObject({
      forcedProfileId: 'p1',
      status: 'AVAILABLE',
      lastError: null,
    });
    expect(result).toMatchObject({ forcedProfile: { name: 'Salim' }, warning: null });
  });

  it('prévient quand le profil forcé est à l’arrêt', async () => {
    const { service } = actions({ status: 'AVAILABLE' }, { profile: salim({ runner: null }) });
    const result = await service.force('t1', 'p1', null);
    expect(result.warning).toMatch(/à l'arrêt/);
  });

  it('refuse un profil qui n’a pas rejoint le groupe', async () => {
    const { service } = actions({ status: 'AVAILABLE' }, { profile: salim({ profileGroups: [] }) });
    await expect(service.force('t1', 'p1', null)).rejects.toThrow('rejoint');
  });

  it('refuse un profil qui ne peut pas publier ce post', async () => {
    const { service } = actions({ status: 'AVAILABLE' }, { profile: salim(), allowed: 0 });
    await expect(service.force('t1', 'p1', null)).rejects.toThrow('ne peut pas publier');
  });

  it('annuler rend la publication à la file', async () => {
    const { service, prisma } = actions({ status: 'AVAILABLE' });
    await service.force('t1', null, null);
    expect(prisma.postTarget.update.mock.calls[0][0].data).toEqual({ forcedProfileId: null, forcedAt: null });
  });
});
