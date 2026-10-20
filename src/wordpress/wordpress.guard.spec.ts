import { ExecutionContext } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { WordpressGuard } from './wordpress.guard';

const context = (key?: string) =>
  ({
    switchToHttp: () => ({
      getRequest: () => ({ headers: { 'x-api-key': key } }),
    }),
  }) as ExecutionContext;
describe('WordPress authentication', () => {
  const guard = (key?: string) =>
    new WordpressGuard({ get: () => key } as unknown as ConfigService);
  it('accepts the dedicated key', () =>
    expect(guard('secret').canActivate(context('secret'))).toBe(true));
  it('rejects missing and wrong keys', () => {
    expect(() => guard('secret').canActivate(context())).toThrow(
      'Clé WordPress invalide',
    );
    expect(() => guard('secret').canActivate(context('wrong'))).toThrow(
      'Clé WordPress invalide',
    );
  });
  it('fails closed when not configured', () =>
    expect(() => guard().canActivate(context('secret'))).toThrow(
      'WORDPRESS_API_KEY',
    ));
});

describe('WordPress authentication — une clé par site', () => {
  const ctx = (key: string, siteUrl: string) =>
    ({
      switchToHttp: () => ({ getRequest: () => ({ headers: { 'x-api-key': key }, body: { siteUrl } }) }),
    }) as ExecutionContext;
  const sites: Record<string, { depositKey: string | null }> = {
    'https://tera.test': { depositKey: 'cle-de-tera' },
    'https://karim.test': { depositKey: 'cle-de-karim' },
    'https://ancien.test': { depositKey: null },
  };
  const prisma = {
    contentSource: {
      findUnique: jest.fn(({ where }: { where: { originUrl: string } }) => Promise.resolve(sites[where.originUrl] ?? null)),
    },
  };
  const guard = (env: Record<string, string> = { WORDPRESS_API_KEY: 'globale' }) =>
    new WordpressGuard({ get: (k: string) => env[k] } as unknown as ConfigService, prisma as never);

  it('accepte la clé du site qui envoie', async () =>
    expect(await guard().canActivate(ctx('cle-de-tera', 'https://tera.test/'))).toBe(true));
  it('une clé n’ouvre que son site', async () =>
    expect(guard().canActivate(ctx('cle-de-karim', 'https://tera.test'))).rejects.toThrow('invalide pour ce site'));
  it('un site qui a sa clé refuse la clé globale', async () =>
    expect(guard().canActivate(ctx('globale', 'https://tera.test'))).rejects.toThrow('invalide pour ce site'));
  it('transition : un site existant sans clé garde la clé globale', async () =>
    expect(await guard().canActivate(ctx('globale', 'https://ancien.test'))).toBe(true));
  it('la clé globale coupée, le site sans clé est refusé', async () =>
    expect(
      guard({ WORDPRESS_API_KEY: 'globale', WORDPRESS_ALLOW_GLOBAL_KEY: 'false' }).canActivate(ctx('globale', 'https://ancien.test')),
    ).rejects.toThrow('pas encore sa clé'));
  it('un site inconnu est refusé, même avec la clé globale', async () =>
    expect(guard().canActivate(ctx('globale', 'https://nouveau.test'))).rejects.toThrow('Site inconnu'));
});
