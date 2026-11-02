import { ArticlesService } from './articles.service';

/** Un article WordPress : un post par groupe. g1 publié (post p1), g2 déjà en
 * file (post p2), g3 jamais parti. */
function setup(targets = [
  { id: 't1', postId: 'p1', groupId: 'g1', status: 'PUBLISHED', publishedAt: new Date(), repeatRound: 0, facebookUrl: 'https://fb/1' },
  { id: 't2', postId: 'p2', groupId: 'g2', status: 'AVAILABLE', publishedAt: null, repeatRound: 0, facebookUrl: null },
]) {
  const prisma: any = {
    article: {
      findFirst: jest.fn(async () => ({ id: 'a' })),
      findUnique: jest.fn(async () => ({ id: 'a', title: 'Gâteau', archivedAt: null, status: 'ACTIVE', source: { categoryId: 'c', category: { name: 'Cuisine' } } })),
      update: jest.fn(),
    },
    post: { findMany: jest.fn(async () => [{ id: 'p1', title: 'Gâteau' }, { id: 'p2', title: 'Gâteau' }]), updateMany: jest.fn() },
    group: { findMany: jest.fn(async () => ['g1', 'g2', 'g3'].map((id) => ({ id, name: id }))) },
    postTarget: { findMany: jest.fn(async () => targets), createMany: jest.fn() },
    publicationTrace: { createMany: jest.fn() },
    activityLog: { create: jest.fn() },
    $executeRaw: jest.fn(),
  };
  prisma.$transaction = jest.fn(async (fn: any) => fn(prisma));
  return { svc: new ArticlesService(prisma), prisma };
}

describe('Recréer les posts', () => {
  it('cherche chaque groupe dans TOUS les posts : pas de doublon d’un groupe déjà en file', async () => {
    const { svc, prisma } = setup();
    const r = await svc.recreatePosts('a', {}, null);
    expect(r).toMatchObject({ requeued: 1, created: 1, alreadyQueued: 1 });
    // Seul g3 (jamais parti) est ajouté ; g2, en file sur p2, n'est pas recréé.
    expect(prisma.postTarget.createMany.mock.calls[0][0].data).toEqual([{ postId: 'p1', groupId: 'g3' }]);
  });

  it('en masse : chaque article est recréé, une erreur n’arrête pas les autres', async () => {
    const { svc, prisma } = setup();
    prisma.article.findFirst.mockImplementation(async ({ where }: any) => (where.id === 'missing' ? null : { id: where.id }));
    const r = await svc.recreateMany(['a', 'missing'], null);
    expect(r).toMatchObject({ articles: 1, failed: 1, requeued: 1, created: 1, alreadyQueued: 1 });
    expect(r.results[1].error).toContain('introuvable');
  });
});
