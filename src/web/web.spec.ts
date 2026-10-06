import { Test } from '@nestjs/testing';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { SessionService } from '../auth/session.service';
import { PrismaService } from '../prisma/prisma.service';
import { registerWeb } from './web';
import { legacyTarget, safeNext } from './routes';

describe('adresses', () => {
  it('le retour après connexion reste sur la plateforme', () => {
    expect(safeNext('/posts')).toBe('/posts');
    expect(safeNext('/pilotage?x=1')).toBe('/pilotage?x=1');
    expect(safeNext('//evil.test')).toBe('/');
    expect(safeNext('https://evil.test')).toBe('/');
    expect(safeNext('/\\evil.test')).toBe('/');
    expect(safeNext('/inconnue')).toBe('/');
    expect(safeNext('/profils/cmg1AbC234xyz')).toBe('/profils/cmg1AbC234xyz');
    expect(safeNext('/actions-en-masse')).toBe('/actions-en-masse');
  });
  it('les anciennes adresses /admin vont à la racine', () => {
    expect(legacyTarget('/admin/')).toBe('/');
    expect(legacyTarget('/admin/index.html')).toBe('/');
    expect(legacyTarget('/admin/app.js')).toBe('/');
    expect(legacyTarget('/posts')).toBeNull();
  });
});

describe('pages de la plateforme', () => {
  let app: NestFastifyApplication;
  const valid = new Set(['bon-jeton']);
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      providers: [
        { provide: SessionService, useValue: { validate: async (t: string) => (valid.has(t) ? { user: { id: 'u1' } } : null) } },
        // Les images générées (posts « engagement ») : une seule en base.
        {
          provide: PrismaService,
          useValue: {
            generatedImage: {
              findUnique: async ({ where }: any) =>
                where.token === 'AbCdEfGhIjKlMnOpQrStUv' ? { mimeType: 'image/png', data: Buffer.from('PNGDATA') } : null,
            },
          },
        },
      ],
    }).compile();
    app = module.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    registerWeb(app);
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });
  afterAll(() => app.close());
  const get = (url: string, cookie?: string) =>
    app.inject({ method: 'GET', url, headers: cookie ? { cookie: `pf_session=${cookie}` } : {} });

  it('sans session, chaque rubrique renvoie à /login, qui ramènera ici', async () => {
    const r = await get('/pilotage');
    expect(r.statusCode).toBe(302);
    expect(r.headers.location).toBe('/login?next=%2Fpilotage');
    expect((await get('/')).headers.location).toBe('/login');
  });

  it('l’interface (HTML, JS, CSS) n’est jamais servie sans session', async () => {
    expect((await get('/assets/app.js')).statusCode).toBe(401);
    expect((await get('/assets/styles.css')).statusCode).toBe(401);
    expect((await get('/admin/app.js')).statusCode).toBe(301);
  });

  it('avec une session : la rubrique, sans cache', async () => {
    const r = await get('/posts', 'bon-jeton');
    expect(r.statusCode).toBe(200);
    expect(r.headers['content-type']).toMatch(/text\/html/);
    expect(r.headers['cache-control']).toBe('no-store');
    expect(r.body).toContain('/assets/app.js');
    expect((await get('/assets/app.js', 'bon-jeton')).statusCode).toBe(200);
    expect((await get('/posts', 'faux')).statusCode).toBe(302);
  });

  it('la fiche d’un profil et les actions en masse ont leur adresse', async () => {
    expect((await get('/profils/cmg1abc234xyz', 'bon-jeton')).statusCode).toBe(200);
    expect((await get('/actions-en-masse', 'bon-jeton')).statusCode).toBe(200);
    expect((await get('/moderateurs', 'bon-jeton')).statusCode).toBe(200);
    expect((await get('/moderateurs/cmg1abc234xyz', 'bon-jeton')).statusCode).toBe(200);
    expect((await get('/profils/cmg1abc234xyz')).headers.location).toBe('/login?next=%2Fprofils%2Fcmg1abc234xyz');
    expect((await get('/profils/%3Cscript%3E', 'bon-jeton')).statusCode).toBe(404);
  });

  it('la page de connexion est publique ; connecté, elle renvoie à la page demandée', async () => {
    const r = await get('/login');
    expect(r.statusCode).toBe(200);
    expect(r.body).toContain('login-form');
    expect(r.body).not.toContain('/assets/app.js');
    const back = await get('/login?next=%2Fjournaux', 'bon-jeton');
    expect(back.headers.location).toBe('/journaux');
  });

  it('les anciennes adresses /admin redirigent vers la racine', async () => {
    const r = await get('/admin/');
    expect(r.statusCode).toBe(301);
    expect(r.headers.location).toBe('/');
  });

  it('en-têtes de sécurité : CSP, anti-iframe, nosniff', async () => {
    const r = await get('/login');
    expect(r.headers['content-security-policy']).toContain("script-src 'self'");
    expect(r.headers['content-security-policy']).toContain("frame-ancestors 'none'");
    expect(r.headers['x-frame-options']).toBe('DENY');
    expect(r.headers['x-content-type-options']).toBe('nosniff');
  });

  it('la documentation de l’API est réservée aux comptes connectés', async () => {
    const r = await get('/api/docs');
    expect(r.statusCode).toBe(302);
    expect(r.headers.location).toBe('/login?next=%2Fapi%2Fdocs');
  });

  it('les images générées sont publiques sous leur jeton, et rien d’autre', async () => {
    const ok = await app.getHttpAdapter().getInstance().inject({ method: 'GET', url: '/media/g/AbCdEfGhIjKlMnOpQrStUv.png' });
    expect(ok.statusCode).toBe(200);
    expect(ok.headers['content-type']).toBe('image/png');
    expect(ok.body).toBe('PNGDATA');
    const unknown = await app.getHttpAdapter().getInstance().inject({ method: 'GET', url: '/media/g/ZZZZZZZZZZZZZZZZZZZZZZ.png' });
    expect(unknown.statusCode).toBe(404);
    const bad = await app.getHttpAdapter().getInstance().inject({ method: 'GET', url: '/media/g/..%2Fsecret' });
    expect(bad.statusCode).toBe(404);
  });
});
