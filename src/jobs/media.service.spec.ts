import { BadGatewayException, ForbiddenException } from '@nestjs/common';
import { MediaService } from './media.service';
import { assertSafeRemoteUrl } from '../common/safe-fetch';

jest.mock('../common/safe-fetch', () => ({
  assertSafeRemoteUrl: jest.fn(async (url: string) => new URL(url)),
}));

const IMAGE = 'https://medaut.test/wp-content/uploads/photo.jpg';

function setup(used = 1) {
  const prisma: any = {
    post: { count: jest.fn(async () => used) },
    profile: { count: jest.fn(async () => 0) },
  };
  return new MediaService(prisma);
}
const reply = (status: number, headers: Record<string, string>, body = 'img') =>
  ({
    status,
    ok: status >= 200 && status < 300,
    headers: new Headers(headers),
    arrayBuffer: async () => new TextEncoder().encode(body).buffer,
  }) as unknown as Response;

describe('MediaService — l’image d’un post, relayée par l’API', () => {
  const realFetch = global.fetch;
  afterEach(() => {
    global.fetch = realFetch;
    jest.clearAllMocks();
  });

  it('sert l’image d’un post, avec son type', async () => {
    global.fetch = jest.fn(async () => reply(200, { 'content-type': 'image/jpeg' })) as any;
    const { buffer, type } = await setup().fetchPostImage(IMAGE);
    expect(type).toBe('image/jpeg');
    expect(buffer.toString()).toBe('img');
  });

  it('n’est pas un proxy ouvert : une image d’aucun post est refusée', async () => {
    global.fetch = jest.fn() as any;
    await expect(setup(0).fetchPostImage('https://ailleurs.test/x.jpg')).rejects.toBeInstanceOf(ForbiddenException);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('revérifie l’adresse à chaque redirection', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce(reply(302, { location: 'https://cdn.medaut.test/photo.jpg' }))
      .mockResolvedValueOnce(reply(200, { 'content-type': 'image/jpeg' })) as any;
    await setup().fetchPostImage(IMAGE);
    expect((assertSafeRemoteUrl as jest.Mock).mock.calls.map(([u]) => u)).toEqual([
      IMAGE,
      'https://cdn.medaut.test/photo.jpg',
    ]);
  });

  it('refuse ce qui n’est pas une image', async () => {
    global.fetch = jest.fn(async () => reply(200, { 'content-type': 'text/html' })) as any;
    await expect(setup().fetchPostImage(IMAGE)).rejects.toBeInstanceOf(BadGatewayException);
  });
});
