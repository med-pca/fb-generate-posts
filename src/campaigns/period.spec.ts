import { campaignPace, periodBounds, rotationTeamOf } from './period';

// Jeudi 15 octobre 2026, 14 h à Paris (12 h UTC).
const now = new Date('2026-10-15T12:00:00Z');

describe('periodBounds', () => {
  it('jour : de minuit à minuit, à l’heure de Paris', () => {
    const b = periodBounds('day', now, 'Europe/Paris');
    expect(b.from.toISOString()).toBe('2026-10-14T22:00:00.000Z');
    expect(b.to.toISOString()).toBe('2026-10-15T22:00:00.000Z');
    expect(b.days).toBe(1);
  });

  it('semaine : du lundi au lundi suivant ; jeudi = 4e jour', () => {
    const b = periodBounds('week', now, 'Europe/Paris');
    expect(b.from.toISOString()).toBe('2026-10-11T22:00:00.000Z'); // lundi 12 octobre, minuit Paris
    expect(b.days).toBe(7);
    expect(b.dayIndex).toBe(3);
  });

  it('mois : du 1er au 1er suivant (31 jours en octobre, changement d’heure compris)', () => {
    const b = periodBounds('month', now, 'Europe/Paris');
    expect(b.from.toISOString()).toBe('2026-09-30T22:00:00.000Z');
    expect(b.to.toISOString()).toBe('2026-10-31T23:00:00.000Z'); // 1er novembre, heure d’hiver
    expect(b.days).toBe(31);
  });
});

describe('campaignPace', () => {
  const base = { now, timezone: 'Europe/Paris', windowStart: 480, windowEnd: 1320, lastHour: 5 };

  it('jour : 14 h sur une plage 8 h → 22 h = 6/14 de l’objectif attendu', () => {
    const p = campaignPace({ ...base, period: 'day', target: 140, published: 40 });
    expect(p.expected).toBe(60);
    expect(p.status).toBe('late');
    expect(p.remaining).toBe(100);
    expect(p.neededPerHour).toBe(13); // 100 en 8 h
  });

  it('semaine : 3 jours pleins + 6 h sur 7 × 14 h', () => {
    const p = campaignPace({ ...base, period: 'week', target: 980, published: 500 });
    // (3 × 840 + 360) / (7 × 840) × 980 = 480
    expect(p.expected).toBe(480);
    expect(p.status).toBe('ahead');
  });

  it('objectif atteint', () => {
    expect(campaignPace({ ...base, period: 'day', target: 10, published: 12 }).status).toBe('reached');
  });
});

describe('rotationTeamOf', () => {
  const start = new Date('2026-10-14T06:00:00Z');
  it('sans rotation : null', () => {
    expect(rotationTeamOf([], start, start, 'Europe/Paris')).toBeNull();
  });
  it('une équipe par jour, en boucle, au jour local', () => {
    const teams = ['A', 'B', 'C'];
    expect(rotationTeamOf(teams, start, new Date('2026-10-14T21:59:00Z'), 'Europe/Paris')?.team).toBe('A');
    // 22:30 UTC = 00:30 à Paris le 15 : déjà le jour 1.
    expect(rotationTeamOf(teams, start, new Date('2026-10-14T22:30:00Z'), 'Europe/Paris')?.team).toBe('B');
    expect(rotationTeamOf(teams, start, new Date('2026-10-16T10:00:00Z'), 'Europe/Paris')?.team).toBe('C');
    expect(rotationTeamOf(teams, start, new Date('2026-10-17T10:00:00Z'), 'Europe/Paris')).toEqual({ team: 'A', index: 0, day: 3 });
  });
  it('avant le début : la première équipe', () => {
    expect(rotationTeamOf(['A', 'B'], start, new Date('2026-10-10T10:00:00Z'), 'Europe/Paris')?.team).toBe('A');
  });
});
