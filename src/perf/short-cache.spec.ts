import { ShortCacheService } from './short-cache.service';

const user = (id: string) => ({ id, username: id, role: 'MANAGER', status: 'ACTIVE' }) as never;

describe('ShortCacheService', () => {
  it('un seul calcul par compte et par clé pendant le délai', async () => {
    const cache = new ShortCacheService();
    let calls = 0;
    const compute = async () => ++calls;
    expect(await cache.get(user('a'), 'k', 10_000, compute)).toBe(1);
    expect(await cache.get(user('a'), 'k', 10_000, compute)).toBe(1);
    expect(await cache.get(user('b'), 'k', 10_000, compute)).toBe(2);
    cache.clear();
    expect(await cache.get(user('a'), 'k', 10_000, compute)).toBe(3);
  });

  it('une erreur n’est pas gardée', async () => {
    const cache = new ShortCacheService();
    await expect(cache.get(null, 'k', 10_000, () => Promise.reject(new Error('x')))).rejects.toThrow('x');
    await new Promise((r) => setImmediate(r));
    expect(await cache.get(null, 'k', 10_000, async () => 'ok')).toBe('ok');
  });
});
