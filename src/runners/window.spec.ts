import { formatWindow, insideWindow, localClock, parseDays } from './window';

describe('localClock', () => {
  const noon = new Date('2026-09-27T12:00:00Z'); // un dimanche

  it('rend l’heure du profil, pas celle du serveur', () => {
    expect(localClock(noon, 'Europe/Paris').minutes).toBe(14 * 60);
    expect(localClock(noon, 'UTC').minutes).toBe(12 * 60);
    expect(localClock(noon, 'America/New_York').minutes).toBe(8 * 60);
  });

  it('rend le jour ISO du profil', () => {
    expect(localClock(noon, 'UTC').isoDay).toBe(7); // dimanche
    // 23 h à Paris le lundi, c'est encore lundi là-bas.
    expect(localClock(new Date('2026-09-28T21:00:00Z'), 'Europe/Paris').isoDay).toBe(1);
    // ... et déjà mardi à Tokyo.
    expect(localClock(new Date('2026-09-28T21:00:00Z'), 'Asia/Tokyo').isoDay).toBe(2);
  });

  it('lit minuit comme 00:00 et non 24:00', () => {
    expect(localClock(new Date('2026-09-27T00:30:00Z'), 'UTC').minutes).toBe(30);
  });

  it('retombe sur UTC plutôt que d’échouer sur un fuseau inconnu', () => {
    const clock = localClock(noon, 'Mars/Olympus');
    expect(clock.fallback).toBe(true);
    expect(clock.minutes).toBe(12 * 60);
  });
});

describe('insideWindow', () => {
  const at = (minutes: number, isoDay = 1) => ({ minutes, isoDay });

  it('sans bornes, la fenêtre est ouverte', () => {
    expect(insideWindow(at(180), { windowStart: null, windowEnd: null, days: null }).inside).toBe(true);
  });

  it('une fenêtre de journée exclut ce qui est avant et après', () => {
    const window = { windowStart: 9 * 60, windowEnd: 18 * 60, days: null };
    expect(insideWindow(at(8 * 60 + 59), window).inside).toBe(false);
    expect(insideWindow(at(9 * 60), window).inside).toBe(true);
    expect(insideWindow(at(17 * 60 + 59), window).inside).toBe(true);
    expect(insideWindow(at(18 * 60), window).inside).toBe(false);
  });

  it('une fenêtre de nuit traverse minuit', () => {
    const window = { windowStart: 22 * 60, windowEnd: 6 * 60, days: null };
    expect(insideWindow(at(23 * 60), window).inside).toBe(true);
    expect(insideWindow(at(2 * 60), window).inside).toBe(true);
    expect(insideWindow(at(7 * 60), window).inside).toBe(false);
  });

  it('des bornes égales veulent dire toute la journée', () => {
    const window = { windowStart: 8 * 60, windowEnd: 8 * 60, days: null };
    expect(insideWindow(at(3 * 60), window).inside).toBe(true);
  });

  it('les jours non autorisés ferment la fenêtre, et le disent', () => {
    const window = { windowStart: null, windowEnd: null, days: '1,2,3,4,5' };
    expect(insideWindow(at(600, 5), window).inside).toBe(true);
    const saturday = insideWindow(at(600, 6), window);
    expect(saturday.inside).toBe(false);
    expect(saturday.reason).toContain('samedi');
  });

  it('une fenêtre de nuit appartient au jour où elle commence', () => {
    // Vendredi 22 h → samedi 6 h, avec seulement les jours de semaine cochés :
    // la nuit du vendredi doit rester ouverte jusqu'au bout.
    const window = { windowStart: 22 * 60, windowEnd: 6 * 60, days: '1,2,3,4,5' };
    expect(insideWindow(at(23 * 60, 5), window).inside).toBe(true); // vendredi 23 h
    expect(insideWindow(at(2 * 60, 6), window).inside).toBe(true); // samedi 2 h = nuit du vendredi
    expect(insideWindow(at(23 * 60, 6), window).inside).toBe(false); // samedi 23 h
    expect(insideWindow(at(2 * 60, 7), window).inside).toBe(false); // dimanche 2 h = nuit du samedi
  });
});

describe('parseDays / formatWindow', () => {
  it('ignore ce qui n’est pas un jour ISO', () => {
    expect(parseDays('1, 2,9,,x,7')).toEqual([1, 2, 7]);
    expect(parseDays(null)).toEqual([]);
  });

  it('se lit d’un coup d’œil dans l’admin', () => {
    expect(formatWindow({ windowStart: null, windowEnd: null, days: null })).toBe('24 h/24');
    expect(formatWindow({ windowStart: 540, windowEnd: 1080, days: '1,2,3,4,5' })).toBe(
      '09:00–18:00, lundi, mardi, mercredi, jeudi, vendredi',
    );
    expect(formatWindow({ windowStart: 540, windowEnd: 1080, days: '1,2,3,4,5,6,7' })).toBe('09:00–18:00');
  });
});
