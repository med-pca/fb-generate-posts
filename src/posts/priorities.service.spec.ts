import { PrioritiesService, nextPriority } from './priorities.service';

describe('Règles & priorités', () => {
  it('les gestes : en tête, monter, descendre, remettre à zéro, valeur', () => {
    expect(nextPriority(2, 7, 'top')).toBe(8);
    expect(nextPriority(9, 7, 'top')).toBe(10);
    expect(nextPriority(2, 7, 'up')).toBe(3);
    expect(nextPriority(2, 7, 'down')).toBe(1);
    expect(nextPriority(2, 7, 'reset')).toBe(0);
    expect(nextPriority(2, 7, undefined, 42)).toBe(42);
  });

  it('prioriser un article pousse TOUS ses posts encore à publier', async () => {
    const prisma: any = {
      article: {
        findFirst: jest.fn(async () => ({ id: 'a1', title: 'Tarte', priority: 0 })),
        aggregate: jest.fn(async () => ({ _max: { priority: 4 } })),
        update: jest.fn((a: any) => a),
      },
      post: { updateMany: jest.fn(() => ({ count: 11 })) },
      $transaction: jest.fn(async (ops: any[]) => ops),
      activityLog: { create: jest.fn(async (a: any) => a) },
    };
    const r = await new PrioritiesService(prisma).setArticle('a1', { move: 'top' }, null);
    expect(r).toEqual({ id: 'a1', priority: 5, posts: 11 });
    expect(prisma.post.updateMany.mock.calls[0][0]).toMatchObject({ where: { articleId: 'a1', status: 'AVAILABLE' }, data: { priority: 5 } });
  });

  it('prioriser un groupe', async () => {
    const prisma: any = {
      group: {
        findFirst: jest.fn(async () => ({ id: 'g1', name: 'Recettes', priority: 1 })),
        aggregate: jest.fn(async () => ({ _max: { priority: 3 } })),
        update: jest.fn(async (a: any) => a),
      },
      activityLog: { create: jest.fn(async (a: any) => a) },
    };
    expect(await new PrioritiesService(prisma).setGroup('g1', { move: 'up' }, null)).toEqual({ id: 'g1', priority: 2 });
    expect(prisma.group.update.mock.calls[0][0]).toEqual({ where: { id: 'g1' }, data: { priority: 2 } });
  });
});
