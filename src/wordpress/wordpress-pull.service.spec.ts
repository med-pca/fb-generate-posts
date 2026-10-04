import { WordpressPullService } from './wordpress-pull.service';

const SITE = { id: 's1', name: 'Tera', originUrl: 'https://tera.test', depositKey: null };
const payload = (postId: string, title = 'Tarte au citron') => ({
  siteUrl: 'https://tera.test',
  siteName: 'Tera',
  postId,
  title,
  content: 'Corps',
  articleUrl: `https://tera.test/article-${postId}/`,
  publishedAt: '2026-10-04T20:00:00+00:00',
});

function setup(responses: Array<{ status: number; body?: unknown }>, publish = jest.fn(() => Promise.resolve({ articleId: 'a' }))) {
  const calls: Array<{ url: string; init: any }> = [];
  global.fetch = jest.fn((url: string, init: any) => {
    calls.push({ url, init });
    const r = responses.shift() ?? { status: 200, body: {} };
    return Promise.resolve(new Response(JSON.stringify(r.body ?? {}), { status: r.status }));
  }) as never;
  const prisma = {
    contentSource: { findMany: jest.fn(() => Promise.resolve([SITE])) },
    activityLog: { create: jest.fn(() => Promise.resolve({})) },
  };
  const service = new WordpressPullService(prisma as never, { get: (k: string) => (k === 'WORDPRESS_API_KEY' ? 'cle-globale' : undefined) } as never, { publish } as never);
  return { service, calls, publish, prisma };
}

describe('WordpressPullService : la plateforme va chercher les articles', () => {
  it('reçoit chaque article en attente, puis l’acquitte avec la version reçue', async () => {
    const t = setup([
      { status: 200, body: { articles: [{ payload: payload('55'), hash: 'h55', error: 'Réponse API invalide (HTTP 401). Vérifier URL et clé.' }] } },
      { status: 200, body: { acknowledged: ['55'] } },
    ]);
    const [result] = await t.service.pullAll();
    expect(result).toMatchObject({ site: 'Tera', received: 1 });
    expect(t.calls[0].url).toBe('https://tera.test/wp-json/dfb/v1/pending');
    expect(t.calls[0].init.headers['x-api-key']).toBe('cle-globale');
    expect(t.publish).toHaveBeenCalledWith(expect.objectContaining({ postId: '55', title: 'Tarte au citron' }));
    expect(t.calls[1].url).toBe('https://tera.test/wp-json/dfb/v1/ack');
    expect(JSON.parse(t.calls[1].init.body)).toEqual({ articles: [{ postId: '55', hash: 'h55' }] });
    const log = (t.prisma.activityLog.create.mock.calls[0] as any)[0].data;
    expect(log.eventType).toBe('WORDPRESS_PULLED');
    expect(log.message).toMatch(/HTTP 401/);
  });

  it('un article refusé n’est pas acquitté : le site le garde en attente', async () => {
    const publish = jest.fn((dto: any) => (dto.postId === '2' ? Promise.reject(new Error('domaine différent')) : Promise.resolve({})));
    const t = setup([{ status: 200, body: { articles: [{ payload: payload('1'), hash: 'h1' }, { payload: payload('2'), hash: 'h2' }] } }, { status: 200 }], publish);
    const [result] = await t.service.pullAll();
    expect(result).toMatchObject({ received: 1, failed: 1 });
    expect(JSON.parse(t.calls[1].init.body).articles).toEqual([{ postId: '1', hash: 'h1' }]);
  });

  it('un article mal formé est écarté sans être reçu', async () => {
    const t = setup([{ status: 200, body: { articles: [{ payload: { ...payload('3'), articleUrl: 'pas une url' }, hash: 'h3' }] } }]);
    const [result] = await t.service.pullAll();
    expect(t.publish).not.toHaveBeenCalled();
    expect(result).toMatchObject({ received: 0, failed: 1 });
  });

  it('plugin plus ancien (pas de route) : le site est passé, sans erreur', async () => {
    const t = setup([{ status: 404 }]);
    const [result] = await t.service.pullAll();
    expect(result).toMatchObject({ received: 0, skipped: 'plugin < 1.4.1' });
    expect(t.publish).not.toHaveBeenCalled();
  });

  it('rien en attente : aucun journal', async () => {
    const t = setup([{ status: 200, body: { articles: [] } }]);
    await t.service.pullAll();
    expect(t.prisma.activityLog.create).not.toHaveBeenCalled();
  });
});
