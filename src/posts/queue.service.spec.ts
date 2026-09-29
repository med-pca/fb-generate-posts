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
        { id: 't-a', post: post('a', 5), group: { ...group, profiles: [{ profile }] } },
        { id: 't-b', post: post('b'), group: { ...group, profiles: [] } },
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
    expect(q.counts).toEqual({ running: 7, upcoming: 7, published: 7 });

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
