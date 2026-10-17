import { cycleRule, cycleSince } from './cycle';

describe('Rythme des profils : N posts puis X heures de pause', () => {
  it('règle générale, ou celle du profil, ou jamais (0)', () => {
    expect(cycleRule({ cycleMaxPosts: null, cyclePauseHours: 12 }, null)).toEqual({ max: null, hours: 12 });
    expect(cycleRule({ cycleMaxPosts: 10, cyclePauseHours: 12 }, { cycleMaxPosts: null })).toEqual({ max: 10, hours: 12 });
    expect(cycleRule({ cycleMaxPosts: 10, cyclePauseHours: 12 }, { cycleMaxPosts: 4, cyclePauseHours: 6 })).toEqual({ max: 4, hours: 6 });
    expect(cycleRule({ cycleMaxPosts: 10, cyclePauseHours: 12 }, { cycleMaxPosts: 0 })).toEqual({ max: null, hours: 12 });
  });
  it('le cycle compte depuis la fin de la dernière pause (au plus 24 h)', () => {
    const now = new Date('2026-10-17T12:00:00Z');
    expect(cycleSince({ cycleStartedAt: new Date('2026-10-17T08:00:00Z') }, now).toISOString()).toBe('2026-10-17T08:00:00.000Z');
    expect(cycleSince({ cycleStartedAt: null }, now).toISOString()).toBe('2026-10-16T12:00:00.000Z');
    expect(cycleSince({ cycleStartedAt: new Date('2026-10-01T00:00:00Z') }, now).toISOString()).toBe('2026-10-16T12:00:00.000Z');
  });
});
