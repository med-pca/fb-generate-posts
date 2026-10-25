import { poolOf, unavailableReason, type PoolCandidate } from './period';
import { CampaignsService, type DayPlan } from './campaigns.service';

const now = new Date('2026-10-25T12:00:00Z');
const p = (id: string, over: Partial<PoolCandidate> = {}, runner: Partial<NonNullable<PoolCandidate['runner']>> = {}): PoolCandidate => ({
  id,
  name: id,
  // Créés dans l'ordre alphabétique : a le plus ancien.
  createdAt: new Date(Date.UTC(2026, 0, id.charCodeAt(0) - 96)),
  status: 'ACTIVE',
  externalId: `ext-${id}`,
  facebookSuspension: null,
  runner: { mode: 'AUTO', pausedUntil: null, running: false, lastSeenAt: null, browserState: 'STOPPED', ...runner },
  ...over,
});

describe('Pool de profils', () => {
  it('N actifs, les autres en réserve, du plus ancien au plus récent', () => {
    const pool = poolOf([p('a'), p('b'), p('c'), p('d')], 2, now);
    expect(pool.active.map((x) => x.id)).toEqual(['a', 'b']);
    expect(pool.standby.map((x) => x.id)).toEqual(['c', 'd']);
    expect(pool.missing).toBe(0);
  });

  it('un profil déjà au travail garde sa place (pas de va-et-vient)', () => {
    const pool = poolOf([p('a'), p('b'), p('c', {}, { running: true, lastSeenAt: now })], 2, now);
    expect(pool.active.map((x) => x.id)).toEqual(['c', 'a']);
  });

  it('un profil tombé est remplacé par le suivant de la réserve, et dit pourquoi', () => {
    const pool = poolOf(
      [
        p('a', { facebookSuspension: 'disabled' }),
        p('b', {}, { pausedUntil: new Date('2026-10-30T00:00:00Z') }),
        p('c', { facebookSuspension: 'logged_out' }),
        p('d', { status: 'INACTIVE' }),
        p('e'),
        p('f'),
      ],
      2,
      now,
    );
    expect(pool.active.map((x) => x.id)).toEqual(['e', 'f']);
    expect(pool.unavailable.map((u) => [u.id, u.why])).toEqual([
      ['a', 'compte suspendu par Facebook'],
      ['b', expect.stringContaining('limité par Facebook')],
      ['c', 'déconnecté de Facebook'],
      ['d', 'désactivé dans la plateforme'],
    ]);
  });

  it('pas assez de profils en état : il dit combien il en manque', () => {
    const pool = poolOf([p('a'), p('b', { facebookSuspension: 'checkpoint' })], 3, now);
    expect(pool.active.length).toBe(1);
    expect(pool.missing).toBe(2);
  });

  it('arrêté dans le Pilotage ou navigateur en erreur : hors service', () => {
    expect(unavailableReason(p('a', {}, { mode: 'OFF' }), now)).toBe('arrêté dans le Pilotage');
    expect(unavailableReason(p('a', {}, { browserState: 'ERROR' }), now)).toContain('NSTBrowser');
  });

  it('un profil en réserve se repose (son navigateur ne s’ouvre pas)', () => {
    const svc = new CampaignsService({} as any);
    const c: DayPlan['campaigns'][number] = {
      id: 'c', name: 'Tera', closed: null, ownerId: null, ownerIsAdmin: true, managed: true,
      profileIds: ['a', 'b'], standby: ['r'], teamToday: null, max: null, used: new Map(), where: { post: { article: { sourceId: 's' } } },
    };
    const day = svc.profileDay({ id: 'r', ownerId: null, team: null }, { campaigns: [c] });
    expect(day.resting).toBe(true);
    expect(day.reason).toContain('en réserve pour « Tera »');
    expect(svc.profileDay({ id: 'a', ownerId: null, team: null }, { campaigns: [c] }).resting).toBe(false);
  });
});
