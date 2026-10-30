import { distribute, type RadarArticle } from './distribute';

const art = (n: number): RadarArticle => ({ url: `https://c.com/a${n}/`, title: `A${n}`, image: null, domain: 'c.com', views: 1000 - n, viral: false });
const pool = Array.from({ length: 100 }, (_, i) => art(i + 1));
const urls = (xs: RadarArticle[] | undefined) => (xs ?? []).map((x) => x.url);

describe('distribute — Top 10 articles par gestionnaire', () => {
  it('10 chacun, en serpent, sans article partagé le même jour', () => {
    const out = distribute(pool, ['a', 'b', 'c'], [], '2026-10-30');
    expect(urls(out.get('a')).slice(0, 2)).toEqual([art(1).url, art(6).url]);
    expect(urls(out.get('c')).slice(0, 2)).toEqual([art(3).url, art(4).url]);
    const all = [...out.values()].flatMap(urls);
    expect(all).toHaveLength(30);
    expect(new Set(all).size).toBe(30);
  });

  it('un gestionnaire ne revoit jamais un article déjà reçu', () => {
    const past = Array.from({ length: 10 }, (_, i) => ({ userId: 'a', url: art(i + 1).url, day: '2026-10-29' }));
    const out = distribute(pool, ['a'], past, '2026-10-30');
    expect(urls(out.get('a'))[0]).toBe(art(11).url);
  });

  it('un article donné à un autre il y a moins de 7 jours ne passe pas (sauf pénurie)', () => {
    const past = [{ userId: 'b', url: art(1).url, day: '2026-10-28' }];
    expect(urls(distribute(pool, ['a'], past, '2026-10-30').get('a'))).not.toContain(art(1).url);
    // Il y a plus de 7 jours : de nouveau permis.
    expect(urls(distribute(pool, ['a'], [{ ...past[0], day: '2026-10-20' }], '2026-10-30').get('a'))[0]).toBe(art(1).url);
    // Pénurie : la règle se relâche plutôt que de laisser une liste vide.
    expect(urls(distribute([art(1)], ['a'], past, '2026-10-30').get('a'))).toEqual([art(1).url]);
  });

  it('le nombre se règle (20), et par gestionnaire pour compléter une liste', () => {
    expect(distribute(pool, ['a'], [], '2026-10-30', new Set(), 20).get('a')).toHaveLength(20);
    const out = distribute(pool, ['a', 'b'], [], '2026-10-30', new Set(), new Map([['a', 10], ['b', 0]]));
    expect(out.get('a')).toHaveLength(10);
    expect(out.get('b')).toHaveLength(0);
  });

  it('ce qui est déjà pris aujourd’hui reste aux autres', () => {
    const out = distribute(pool, ['d'], [], '2026-10-30', new Set([art(1).url, art(2).url]));
    expect(urls(out.get('d'))[0]).toBe(art(3).url);
  });
});
