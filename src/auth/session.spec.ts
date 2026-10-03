import { SessionService, IDLE_MINUTES } from './session.service';
import { LoginThrottle, MAX_PER_USER } from './login-throttle';
import { sameOrigin } from './admin-auth.guard';
import { parseCookies, sessionCookie, sessionTokenFrom } from './cookies';

const NOW = new Date('2026-10-03T12:00:00Z');

function sessions(row: any) {
  const prisma: any = {
    session: {
      create: jest.fn(async (args: any) => args),
      findUnique: jest.fn(async () => row),
      update: jest.fn(async (args: any) => args),
      updateMany: jest.fn(async () => ({ count: 2 })),
      deleteMany: jest.fn(async () => ({ count: 0 })),
    },
  };
  return { service: new SessionService(prisma), prisma };
}
const user = { id: 'u1', username: 'admin', role: 'ADMIN', status: 'ACTIVE' };

describe('SessionService', () => {
  it('ne garde que l’empreinte du jeton, jamais le jeton', async () => {
    const { service, prisma } = sessions(null);
    const s = await service.create('u1', { ip: '1.2.3.4', userAgent: 'x' }, NOW);
    const stored = prisma.session.create.mock.calls[0][0].data;
    expect(s.token).toHaveLength(43);
    expect(stored.tokenHash).not.toContain(s.token);
    expect(stored.tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(stored.expiresAt).toEqual(new Date('2026-10-04T00:00:00Z'));
  });

  it('accepte une session vivante', async () => {
    const { service } = sessions({ id: 's1', user, expiresAt: new Date('2026-10-03T20:00:00Z'), lastSeenAt: new Date('2026-10-03T11:30:00Z'), revokedAt: null });
    expect((await service.validate('jeton', NOW))?.user.id).toBe('u1');
  });

  it('refuse une session révoquée, expirée, inactive trop longtemps, ou d’un compte coupé', async () => {
    const base = { id: 's1', user, expiresAt: new Date('2026-10-03T20:00:00Z'), lastSeenAt: new Date('2026-10-03T11:59:00Z'), revokedAt: null };
    expect(await sessions({ ...base, revokedAt: NOW }).service.validate('t', NOW)).toBeNull();
    expect(await sessions({ ...base, expiresAt: new Date('2026-10-03T11:00:00Z') }).service.validate('t', NOW)).toBeNull();
    const idle = sessions({ ...base, lastSeenAt: new Date(NOW.getTime() - (IDLE_MINUTES + 1) * 60_000) });
    expect(await idle.service.validate('t', NOW)).toBeNull();
    expect(idle.prisma.session.update.mock.calls[0][0].data).toEqual({ revokedAt: NOW });
    expect(await sessions({ ...base, user: { ...user, status: 'INACTIVE' } }).service.validate('t', NOW)).toBeNull();
    expect(await sessions(null).service.validate('', NOW)).toBeNull();
  });
});

describe('LoginThrottle', () => {
  it('bloque après 5 échecs pour un identifiant, puis libère', () => {
    const t = new LoginThrottle();
    const now = 1_000_000;
    for (let i = 0; i < MAX_PER_USER; i += 1) t.fail('1.1.1.1', 'Admin', now + i);
    expect(t.blockedFor('1.1.1.1', 'admin', now + 10)).toBeGreaterThan(800);
    // Une autre adresse n'est pas bloquée pour cet identifiant.
    expect(t.blockedFor('2.2.2.2', 'admin', now + 10)).toBeNull();
    expect(t.blockedFor('1.1.1.1', 'admin', now + 16 * 60_000)).toBeNull();
  });

  it('bloque une adresse qui essaie beaucoup d’identifiants', () => {
    const t = new LoginThrottle();
    for (let i = 0; i < 20; i += 1) t.fail('3.3.3.3', `user${i}`, 1000 + i);
    expect(t.blockedFor('3.3.3.3', 'nouveau', 2000)).not.toBeNull();
  });
});

describe('protection CSRF', () => {
  it('accepte la plateforme, refuse un autre site', () => {
    expect(sameOrigin({ host: 'post.pulserecipe.com', origin: 'https://post.pulserecipe.com' } as any)).toBe(true);
    expect(sameOrigin({ host: 'post.pulserecipe.com', origin: 'https://evil.test' } as any)).toBe(false);
    expect(sameOrigin({ host: 'post.pulserecipe.com', referer: 'https://post.pulserecipe.com/posts' } as any)).toBe(true);
    expect(sameOrigin({ host: 'post.pulserecipe.com' } as any)).toBe(false);
    expect(sameOrigin({ host: 'post.pulserecipe.com', 'x-requested-with': 'PostFlow' } as any)).toBe(true);
  });
});

describe('cookie de session', () => {
  it('HttpOnly, SameSite=Strict, Secure et __Host- en HTTPS', () => {
    const c = sessionCookie('abc', 3600, true);
    expect(c).toMatch(/^__Host-pf_session=abc; Path=\/; HttpOnly; SameSite=Strict; Max-Age=3600; Secure$/);
    expect(sessionCookie('abc', 3600, false)).not.toMatch(/Secure/);
    expect(parseCookies('a=1; pf_session=xyz')).toEqual({ a: '1', pf_session: 'xyz' });
    expect(sessionTokenFrom({ cookie: '__Host-pf_session=sec; pf_session=old' })).toBe('sec');
  });
});
