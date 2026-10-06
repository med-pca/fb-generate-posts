import { PublishedService, linkState } from './published.service';
import { PublishedQueryDto } from './dto/queue.dto';

const q = (o: Partial<PublishedQueryDto>) => Object.assign(new PublishedQueryDto(), o);
const service = new PublishedService({} as never);
const admin: any = { id: 'u1', username: 'admin', role: 'ADMIN', status: 'ACTIVE' };

describe('Audit des publications : les filtres', () => {
  const and = (o: Partial<PublishedQueryDto>) => (service.where(q(o), admin).AND as any[]);

  it('entre deux dates-heures : début inclus, fin exclue', () => {
    const range = and({ from: '2026-10-05T08:30:00.000Z', to: '2026-10-05T18:45:00.000Z' }).find((c) => c.publishedAt);
    expect(range.publishedAt).toEqual({ gte: new Date('2026-10-05T08:30:00.000Z'), lt: new Date('2026-10-05T18:45:00.000Z') });
  });

  it('seulement des publications faites', () => {
    expect(and({})).toContainEqual({ status: 'PUBLISHED' });
  });

  it('par profil : celui qui l’a publiée', () => {
    expect(and({ profileId: 'p1' })).toContainEqual({ jobItems: { some: { status: 'PUBLISHED', job: { profileId: 'p1' } } } });
  });

  it('vérification, lien, adresse, recherche', () => {
    expect(and({ verify: 'unverified' })).toContainEqual({ verifyStatus: null });
    expect(and({ link: 'waiting' })).toContainEqual({ linkUpdatedAt: null, commentedAt: { not: null }, post: { url: { not: null } } });
    expect(and({ url: 'without' })).toContainEqual({ facebookUrl: null });
    expect(JSON.stringify(and({ search: 'tarte' }))).toContain('"contains":"tarte"');
  });

  it('l’état du lien, comme dans la file', () => {
    const at = new Date();
    expect(linkState({ linkUpdatedAt: at, commentedAt: at, post: { url: 'x' } })).toBe('placed');
    expect(linkState({ linkUpdatedAt: null, commentedAt: at, post: { url: 'x' } })).toBe('waiting');
    expect(linkState({ linkUpdatedAt: null, commentedAt: null, post: { url: 'x' } })).toBe('missing');
    expect(linkState({ linkUpdatedAt: null, commentedAt: null, post: { url: null } })).toBe('none');
  });
});
