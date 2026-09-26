import {
  BadGatewayException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { WordpressWriterService } from './wordpress-writer.service';

jest.mock('node:dns/promises', () => ({
  lookup: jest.fn(() =>
    Promise.resolve([{ address: '93.184.216.34', family: 4 }]),
  ),
}));

const ARTICLE = {
  title: 'Le couscous réécrit',
  slug: 'le-couscous-reecrit',
  excerpt: 'Un extrait',
  metaDescription: 'Une description',
  contentHtml: '<h2>Origines</h2><p>Semoule.</p>',
  caption: 'Découvrez le couscous',
  hashtags: ['couscous'],
};

const ok = (body: unknown) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
const image = (bytes = 'jpeg-bytes', type = 'image/jpeg') =>
  new Response(bytes, { status: 200, headers: { 'content-type': type } });

let fetchMock: jest.Mock;
beforeEach(() => {
  fetchMock = jest.fn();
  global.fetch = fetchMock;
});

// Pas de valeur par défaut ici : `writer(undefined)` retomberait dessus et
// le cas « aucune clé » ne serait jamais joué.
const writer = (key?: string) =>
  new WordpressWriterService({ get: () => key } as unknown as ConfigService);

const deposit = (imageUrl: string | null = null) =>
  writer('cle-wp').deposit({
    siteUrl: 'https://site.test',
    ingestRef: 'ing_1',
    article: ARTICLE,
    imageUrl,
  });

describe('WordpressWriterService', () => {
  it('dépose sur la route du plugin, avec la clé et la référence', async () => {
    fetchMock.mockResolvedValue(
      ok({ postId: '42', permalink: 'https://site.test/x' }),
    );
    await expect(deposit()).resolves.toEqual({
      postId: '42',
      permalink: 'https://site.test/x',
      imageWarning: null,
    });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://site.test/wp-json/dfb/v1/articles');
    expect((init.headers as Record<string, string>)['x-api-key']).toBe(
      'cle-wp',
    );
    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(body).toMatchObject({
      title: ARTICLE.title,
      slug: ARTICLE.slug,
      contentHtml: ARTICLE.contentHtml,
      ingestRef: 'ing_1',
      image: null,
    });
  });

  // L'URL d'un CDN Facebook est signée et expire : le site WordPress n'a ni
  // à la suivre, ni de raison d'y avoir accès.
  it('joint l’image en base64 plutôt que son URL', async () => {
    fetchMock
      .mockResolvedValueOnce(image())
      .mockResolvedValueOnce(
        ok({ postId: '42', permalink: 'https://site.test/x' }),
      );
    await deposit('https://cdn.test/photo-post.jpg');
    const [, init] = fetchMock.mock.calls[1] as [string, RequestInit];
    const body = JSON.parse(init.body as string) as {
      image: { data: string; mimeType: string; filename: string };
    };
    expect(Buffer.from(body.image.data, 'base64').toString()).toBe(
      'jpeg-bytes',
    );
    expect(body.image.mimeType).toBe('image/jpeg');
    expect(body.image.filename).toBe('photo-post.jpg');
  });

  it('remonte l’avertissement d’image sans en faire un échec', async () => {
    fetchMock.mockResolvedValue(
      ok({
        postId: '42',
        permalink: 'https://site.test/x',
        imageWarning: 'Image trop volumineuse.',
      }),
    );
    await expect(deposit()).resolves.toMatchObject({
      imageWarning: 'Image trop volumineuse.',
    });
  });

  it('refuse de partir sans clé WordPress', async () => {
    await expect(
      writer().deposit({
        siteUrl: 'https://site.test',
        ingestRef: 'ing_1',
        article: ARTICLE,
        imageUrl: null,
      }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('signale un refus du plugin avec son statut', async () => {
    fetchMock.mockResolvedValue(new Response('interdit', { status: 401 }));
    await expect(deposit()).rejects.toThrow(/HTTP 401/);
  });

  // Une réponse HTML est le signe habituel d'un plugin absent ou trop ancien.
  it('oriente vers le plugin quand la réponse n’est pas du JSON', async () => {
    fetchMock.mockResolvedValue(
      new Response('<html>404</html>', {
        status: 200,
        headers: { 'content-type': 'text/html' },
      }),
    );
    await expect(deposit()).rejects.toThrow(/plugin 1\.2\.0/);
  });

  it('refuse une réponse sans postId ni permalink', async () => {
    fetchMock.mockResolvedValue(ok({ ok: true }));
    await expect(deposit()).rejects.toThrow(/postId et permalink/);
  });

  it('traite un site injoignable comme une panne du site', async () => {
    fetchMock.mockRejectedValue(new Error('ECONNREFUSED'));
    await expect(deposit()).rejects.toBeInstanceOf(BadGatewayException);
  });

  it('refuse une image qui n’en est pas une', async () => {
    fetchMock.mockResolvedValueOnce(image('<html>', 'text/html'));
    await expect(deposit('https://cdn.test/page.html')).rejects.toThrow(
      /Type d’image non accepté/,
    );
  });

  it('refuse une image trop volumineuse', async () => {
    fetchMock.mockResolvedValueOnce(image('x'.repeat(10_000_001)));
    await expect(deposit('https://cdn.test/gros.jpg')).rejects.toThrow(
      /trop volumineuse/,
    );
  });

  // L'image passe par le même garde-fou que toute lecture distante.
  it('refuse une image qui n’est pas en HTTPS', async () => {
    await expect(deposit('http://cdn.test/photo.jpg')).rejects.toThrow(/HTTPS/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
