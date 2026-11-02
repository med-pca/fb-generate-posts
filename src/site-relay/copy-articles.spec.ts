import { SiteRelayService } from './site-relay.service';

const site = (id: string, extra: Record<string, unknown> = {}) => ({ id, name: id.toUpperCase(), originUrl: `https://${id}.com`, depositKey: 'k', status: 'ACTIVE', pausedAt: null, relayId: null, ...extra });

describe('copyArticles — copier des articles choisis vers un autre site', () => {
  const setup = (articles: unknown[]) => {
    const prisma = {
      contentSource: { findFirst: jest.fn(async ({ where }: any) => site(where.id)) },
      article: { findMany: jest.fn(async () => articles) },
      articleCopy: { upsert: jest.fn(async ({ create }: any) => ({ id: `copy-${create.sourceArticleId}` })) },
      activityLog: { create: jest.fn(async () => ({})) },
    };
    global.fetch = jest.fn(async () => new Response(JSON.stringify({ version: '1.6.0' }), { status: 200 })) as any;
    const svc = new SiteRelayService(prisma as any, { get: () => '' } as any, {} as any);
    const start = jest.fn();
    (svc as any).startManual = start;
    return { svc, prisma, start };
  };

  it('copie les articles WordPress, saute le reste en disant pourquoi', async () => {
    const { svc, prisma, start } = setup([
      { id: 'a1', title: 'Gâteau', externalId: 'wordpress:1', source: site('old'), copies: [] },
      { id: 'a2', title: 'Importé', externalId: 'json:2', source: site('old'), copies: [] },
      { id: 'a3', title: 'Déjà là', externalId: 'wordpress:3', source: site('new'), copies: [] },
      { id: 'a4', title: 'Déjà copié', externalId: 'wordpress:4', source: site('old'), copies: [{ id: 'c4', status: 'done', newArticleId: 'n4' }] },
    ]);
    const r = await svc.copyArticles({ articleIds: ['a1', 'a2', 'a3', 'a4'], targetSiteId: 'new' }, null);
    expect(r.planned).toBe(1);
    expect(r.postsMode).toBe('new');
    expect(r.skipped.map((s) => s.reason)).toEqual(['pas un article WordPress : rien à copier', 'déjà sur ce site', 'déjà copié vers NEW']);
    expect(prisma.articleCopy.upsert.mock.calls[0][0].create).toMatchObject({ sourceArticleId: 'a1', targetSiteId: 'new', postsMode: 'new' });
    expect(start).toHaveBeenCalledWith(['copy-a1']);
  });

  it('réaffecter : les posts en attente passent sur la copie', async () => {
    const { svc, prisma } = setup([{ id: 'a1', title: 'Gâteau', externalId: 'wordpress:1', source: site('old'), copies: [{ id: 'c1', status: 'failed', newArticleId: null }] }]);
    await svc.copyArticles({ articleIds: ['a1'], targetSiteId: 'new', posts: 'move' }, null);
    expect(prisma.articleCopy.upsert.mock.calls[0][0].update).toMatchObject({ status: 'pending', postsMode: 'move' });
  });
});
