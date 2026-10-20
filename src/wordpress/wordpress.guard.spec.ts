import { ExecutionContext } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { WordpressGuard } from './wordpress.guard';
import {
  KeyVault,
  generateSiteKey,
  parseSiteKey,
  signedHeaders,
} from './site-key';

const config = (values: Record<string, string>) =>
  ({ get: (name: string) => values[name] }) as unknown as ConfigService;

const context = (request: Record<string, unknown>) =>
  ({ switchToHttp: () => ({ getRequest: () => request }) }) as ExecutionContext;

describe('WordPress authentication — plugin 1.x (transition)', () => {
  const legacy = (key?: string, siteUrl?: string) =>
    context({
      headers: { 'x-api-key': key },
      body: siteUrl ? { siteUrl } : undefined,
    });
  const prisma = {
    contentSource: {
      findUnique: jest.fn(({ where }: { where: { originUrl: string } }) =>
        Promise.resolve(
          where.originUrl === 'https://tera.test'
            ? { depositKey: 'cle-du-site' }
            : null,
        ),
      ),
    },
  };
  const guard = (values: Record<string, string>) =>
    new WordpressGuard(config(values), prisma as never);

  it('accepte la clé propre du site qui envoie', async () =>
    expect(
      await guard({ WORDPRESS_API_KEY: 'globale' }).canActivate(
        legacy('cle-du-site', 'https://tera.test/'),
      ),
    ).toBe(true));
  it('refuse la clé d’un autre site', () =>
    expect(
      guard({ WORDPRESS_API_KEY: 'globale' }).canActivate(
        legacy('cle-du-site', 'https://autre.test'),
      ),
    ).rejects.toThrow('Clé WordPress invalide'));
  it('la clé globale vaut pour un site sans clé propre', async () =>
    expect(
      await guard({ WORDPRESS_API_KEY: 'globale' }).canActivate(
        legacy('globale', 'https://autre.test'),
      ),
    ).toBe(true));
  it('mais plus pour un site qui a sa propre clé : c’était l’usurpation', () =>
    expect(
      guard({ WORDPRESS_API_KEY: 'globale' }).canActivate(
        legacy('globale', 'https://tera.test'),
      ),
    ).rejects.toThrow('Clé WordPress invalide'));
  it('refuse une clé absente', () =>
    expect(
      guard({ WORDPRESS_API_KEY: 'globale' }).canActivate(legacy()),
    ).rejects.toThrow('Clé WordPress invalide'));
  it('ferme le mode 1.x quand WORDPRESS_LEGACY_KEYS=false', () =>
    expect(
      guard({
        WORDPRESS_API_KEY: 'globale',
        WORDPRESS_LEGACY_KEYS: 'false',
      }).canActivate(legacy('globale', 'https://autre.test')),
    ).rejects.toThrow('2.x'));
});

describe('WordPress authentication — plugin 2.x (requêtes signées)', () => {
  const secret = 'secret-maitre-de-test-assez-long';
  const vault = new KeyVault(secret);
  const key = generateSiteKey('clsite0001');
  const parts = parseSiteKey(key)!;
  const sites: Record<
    string,
    { id: string; originUrl: string; depositKey: string }
  > = {
    clsite0001: {
      id: 'clsite0001',
      originUrl: 'https://tera.test',
      depositKey: vault.seal(key),
    },
  };
  const prisma = {
    contentSource: {
      findUnique: jest.fn(
        ({ where }: { where: { id?: string; originUrl?: string } }) =>
          Promise.resolve(
            where.id
              ? (sites[where.id] ?? null)
              : (Object.values(sites).find(
                  (s) => s.originUrl === where.originUrl,
                ) ?? null),
          ),
      ),
    },
  };
  const guard = new WordpressGuard(
    config({ AUTH_SECRET: secret, WORDPRESS_API_KEY: 'globale' }),
    prisma as never,
  );
  const signed = (
    body: object,
    override: Record<string, string> = {},
    signWith = parts,
  ) => {
    const raw = Buffer.from(JSON.stringify(body));
    return {
      method: 'POST',
      headers: { ...signedHeaders(signWith, 'POST', raw), ...override },
      body,
      rawBody: raw,
    } as Record<string, unknown>;
  };

  it('accepte une requête signée et désigne le site par la clé', async () => {
    const request = signed({ siteUrl: 'https://tera.test/', title: 'x' });
    expect(await guard.canActivate(context(request))).toBe(true);
    expect(request.dfbSite).toEqual({
      id: 'clsite0001',
      originUrl: 'https://tera.test',
      signed: true,
    });
  });
  it('refuse de la rejouer', async () => {
    const request = signed({ siteUrl: 'https://tera.test', title: 'x' });
    await guard.canActivate(context(request));
    await expect(guard.canActivate(context({ ...request }))).rejects.toThrow(
      'rejeu',
    );
  });
  it('refuse un corps modifié après signature', async () => {
    const request = signed({ siteUrl: 'https://tera.test', title: 'x' });
    request.rawBody = Buffer.from(
      JSON.stringify({ siteUrl: 'https://tera.test', title: 'y' }),
    );
    await expect(guard.canActivate(context(request))).rejects.toThrow(
      'Signature WordPress invalide',
    );
  });
  it('refuse d’écrire au nom d’un autre site', () =>
    expect(
      guard.canActivate(
        context(signed({ siteUrl: 'https://autre.test', title: 'x' })),
      ),
    ).rejects.toThrow('appartient à https://tera.test'));
  it('refuse une clé révoquée (régénérée depuis)', () => {
    const revoked = parseSiteKey(generateSiteKey('clsite0001'))!;
    return expect(
      guard.canActivate(
        context(signed({ siteUrl: 'https://tera.test' }, {}, revoked)),
      ),
    ).rejects.toThrow('Signature WordPress invalide');
  });
  it('refuse un site inconnu', () =>
    expect(
      guard.canActivate(
        context(
          signed(
            { siteUrl: 'https://tera.test' },
            { 'x-dfb-site': 'clinconnu99' },
          ),
        ),
      ),
    ).rejects.toThrow('inconnue'));
  it('un site passé en 2.x n’accepte plus de clé en clair, même globale', () =>
    expect(
      guard.canActivate(
        context({
          headers: { 'x-api-key': 'globale' },
          body: { siteUrl: 'https://tera.test' },
        }),
      ),
    ).rejects.toThrow('2.x'));
});
