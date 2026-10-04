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

describe('WordPress authentication — clé propre d’un site', () => {
  const ctx = (key: string, siteUrl: string) =>
    ({
      switchToHttp: () => ({ getRequest: () => ({ headers: { 'x-api-key': key }, body: { siteUrl } }) }),
    }) as ExecutionContext;
  const prisma = {
    contentSource: {
      findUnique: jest.fn(({ where }: { where: { originUrl: string } }) =>
        Promise.resolve(where.originUrl === 'https://tera.test' ? { depositKey: 'cle-du-site' } : null),
      ),
    },
  };
  const guard = new WordpressGuard({ get: () => 'globale' } as unknown as ConfigService, prisma as never);

  it('accepte la clé propre du site qui envoie', async () =>
    expect(await guard.canActivate(ctx('cle-du-site', 'https://tera.test/'))).toBe(true));
  it('refuse la clé d’un autre site', async () =>
    expect(() => guard.canActivate(ctx('cle-du-site', 'https://autre.test'))).rejects.toThrow('Clé WordPress invalide'));
  it('la clé globale passe toujours', () => expect(guard.canActivate(ctx('globale', 'https://autre.test'))).toBe(true));
});
