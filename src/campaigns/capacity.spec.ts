import { campaignCapacity, type PoolCandidate } from './period';

const now = new Date('2026-11-02T12:00:00Z');
const p = (id: string, runner: Partial<NonNullable<PoolCandidate['runner']>> | null = {}, extra: Partial<PoolCandidate> = {}): PoolCandidate => ({
  id, name: id, createdAt: now, status: 'ACTIVE', externalId: `x-${id}`, facebookSuspension: null,
  runner: runner === null ? null : { mode: 'AUTO', pausedUntil: null, running: false, lastSeenAt: null, browserState: 'STOPPED', ...runner },
  ...extra,
});
const working = (id: string) => p(id, { running: true, lastSeenAt: now, browserState: 'RUNNING' });
const base = { now, minGap: 5, publishMinutes: 3, ratePerHour: 10, remaining: 100, stock: 200, status: 'late' };

describe('campaignCapacity — pourquoi l’objectif n’est pas atteint', () => {
  it('pas assez de profils au travail : combien il en faudrait', () => {
    // 2 profils × 7,5/h = 15/h ; il faut 60/h → 8 profils.
    const r = campaignCapacity({ ...base, candidates: [working('a'), working('b')], neededPerHour: 60 });
    expect(r).toMatchObject({ working: 2, perHour: 15, neededProfiles: 8, missingProfiles: 6 });
    expect(r.reasons[0]).toContain('il faudrait ~8 profils au travail (6 de plus)');
  });

  it('stock trop court, profils arrêtés ou limités : chacun dit pourquoi', () => {
    const r = campaignCapacity({
      ...base,
      stock: 20,
      neededPerHour: 5,
      candidates: [working('a'), p('b'), p('c', { mode: 'OFF' }), p('d', { pausedUntil: new Date(now.getTime() + 3_600_000) })],
    });
    expect(r.reasons.join(' | ')).toContain('pas assez de posts en file : 20 pour 100');
    expect(r.reasons.join(' | ')).toContain('1 profil(s) en état mais pas au travail');
    expect(r.unavailable.map((u) => u.why)).toEqual(expect.arrayContaining(['arrêté dans le Pilotage', 'limité par Facebook']));
  });

  it('objectif atteint : aucune raison', () => {
    expect(campaignCapacity({ ...base, remaining: 0, status: 'reached', candidates: [working('a')], neededPerHour: 0 }).reasons).toEqual([]);
  });
});
