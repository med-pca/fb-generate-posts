import { minutesIntoWindow, pace, windowLength } from './objective';

const at = (h: number, m = 0) => h * 60 + m;
const base = { target: 200, start: at(8), end: at(22), lastHour: 14 };

describe('pace — sommes-nous dans les temps ?', () => {
  it('à mi-plage, on attend la moitié de l’objectif', () => {
    const p = pace({ ...base, nowMinutes: at(15), published: 100 });
    expect(p.expected).toBe(100);
    expect(p.status).toBe('ahead');
    expect(p.remaining).toBe(100);
  });

  it('en retard : dit combien, et le rythme qu’il faudrait tenir', () => {
    const p = pace({ ...base, nowMinutes: at(15), published: 60 });
    expect(p).toMatchObject({ status: 'late', delta: -40 });
    // 140 restants sur 7 h = 20/h.
    expect(p.neededPerHour).toBe(20);
    // Au rythme actuel (14/h) : 60 + 14 × 7 = 158.
    expect(p.projection).toBe(158);
  });

  it('un léger retard reste « dans les temps »', () => {
    expect(pace({ ...base, nowMinutes: at(15), published: 92 }).status).toBe('on_track');
  });

  it('avant la plage, après la plage, objectif atteint', () => {
    expect(pace({ ...base, nowMinutes: at(6), published: 0 }).status).toBe('not_started');
    expect(pace({ ...base, nowMinutes: at(23), published: 150 }).status).toBe('missed');
    expect(pace({ ...base, nowMinutes: at(12), published: 210 }).status).toBe('reached');
    expect(pace({ ...base, target: 0, nowMinutes: at(12), published: 3 }).status).toBe('no_target');
  });

  it('une plage de nuit et une journée entière', () => {
    expect(windowLength(at(22), at(6))).toBe(480);
    expect(minutesIntoWindow(at(2), at(22), at(6))).toBe(240);
    expect(windowLength(0, 0)).toBe(1440);
  });
});
