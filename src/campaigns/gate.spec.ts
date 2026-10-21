import { campaignGate, inWindow } from './period';

describe('campaignGate — plage horaire et objectif étalé', () => {
  // 15 h 00 à Paris (UTC+2 en octobre).
  const at3pm = new Date('2026-10-21T13:00:00Z');
  const base = { now: at3pm, timezone: 'Europe/Paris', windowStart: 8 * 60, windowEnd: 22 * 60, target: 100 };

  it('dans la plage et dans le rythme : ouverte', () =>
    expect(campaignGate({ ...base, published: 50, expected: 50 })).toBeNull());
  it('hors de la plage : fermée', () =>
    expect(campaignGate({ ...base, windowStart: 18 * 60, published: 0, expected: 0 })).toContain('hors de sa plage horaire (18:00 → 22:00)'));
  it('objectif atteint : fermée', () =>
    expect(campaignGate({ ...base, published: 100, expected: 50 })).toContain('objectif atteint'));
  it('en avance sur le rythme : elle attend que l’heure rattrape', () => {
    expect(campaignGate({ ...base, published: 56, expected: 50 })).toContain('en avance');
    // Une petite marge (5 %) : pas de coupure au moindre post d'avance.
    expect(campaignGate({ ...base, published: 54, expected: 50 })).toBeNull();
  });
  it('en retard : ouverte', () => expect(campaignGate({ ...base, published: 10, expected: 50 })).toBeNull());
  it('une plage qui passe minuit', () => {
    expect(inWindow(23 * 60, 22 * 60, 6 * 60)).toBe(true);
    expect(inWindow(3 * 60, 22 * 60, 6 * 60)).toBe(true);
    expect(inWindow(12 * 60, 22 * 60, 6 * 60)).toBe(false);
    expect(inWindow(12 * 60, 0, 0)).toBe(true);
  });
});
