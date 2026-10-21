import { startOfLocalDay } from '../insights/insights.service';
import { localClock } from '../runners/window';
import { minutesIntoWindow, windowLength } from '../insights/objective';

export type Period = 'day' | 'week' | 'month';
const DAY = 86_400_000;

/** Le jour du mois dans ce fuseau (1 → 31). */
function dayOfMonth(now: Date, timeZone: string) {
  try {
    return Number(new Intl.DateTimeFormat('en-GB', { timeZone, day: 'numeric' }).format(now));
  } catch {
    return now.getUTCDate();
  }
}

/** Minuit local d'un jour donné à `days` jours de `now` (en passant par midi,
 * pour qu'un changement d'heure ne fasse pas glisser d'un jour). */
function midnightShift(now: Date, timeZone: string, days: number) {
  const noon = new Date(startOfLocalDay(now, timeZone).getTime() + 12 * 3_600_000 + days * DAY);
  return startOfLocalDay(noon, timeZone);
}

/** La période en cours d'une campagne, dans son fuseau : aujourd'hui, la
 * semaine (du lundi) ou le mois (du 1er). Rend aussi le nombre de jours de
 * la période et combien sont déjà passés. */
export function periodBounds(period: Period, now: Date, timeZone: string) {
  let from: Date;
  if (period === 'week') from = midnightShift(now, timeZone, -(localClock(now, timeZone).isoDay - 1));
  else if (period === 'month') from = midnightShift(now, timeZone, -(dayOfMonth(now, timeZone) - 1));
  else from = startOfLocalDay(now, timeZone);
  let days = 1;
  if (period === 'week') days = 7;
  if (period === 'month') {
    // Le 1er du mois suivant, puis on compte les jours.
    const next = midnightShift(from, timeZone, 32);
    const firstNext = midnightShift(next, timeZone, -(dayOfMonth(next, timeZone) - 1));
    days = Math.round((firstNext.getTime() - from.getTime()) / DAY);
  }
  const to = midnightShift(from, timeZone, days);
  const dayIndex = Math.min(days - 1, Math.max(0, Math.round((startOfLocalDay(now, timeZone).getTime() - from.getTime()) / DAY)));
  return { from, to, days, dayIndex };
}

/** Où l'on devrait en être : la part des heures de travail de la période déjà
 * écoulées (plage horaire de chaque jour), appliquée à l'objectif. */
export function campaignPace(input: {
  period: Period;
  target: number;
  published: number;
  lastHour: number;
  now: Date;
  timezone: string;
  windowStart: number;
  windowEnd: number;
}) {
  const { from, to, days, dayIndex } = periodBounds(input.period, input.now, input.timezone);
  const perDay = windowLength(input.windowStart, input.windowEnd);
  const today = minutesIntoWindow(localClock(input.now, input.timezone).minutes, input.windowStart, input.windowEnd);
  const total = perDay * days;
  const into = Math.min(total, dayIndex * perDay + today);
  const left = Math.max(0, total - into);
  const elapsed = total ? into / total : 1;
  const expected = Math.round(input.target * elapsed);
  const remaining = Math.max(0, input.target - input.published);
  const neededPerHour = left ? Math.ceil((remaining / left) * 60) : remaining;
  // Le rythme réel : la dernière heure, mais pendant la plage de travail.
  const projection = input.published + Math.round((input.lastHour * left) / 60);
  let status: 'reached' | 'not_started' | 'ahead' | 'on_track' | 'late' | 'missed';
  if (input.published >= input.target) status = 'reached';
  else if (into <= 0) status = 'not_started';
  else if (!left) status = 'missed';
  else if (input.published >= expected) status = 'ahead';
  else if (input.published >= expected * 0.9) status = 'on_track';
  else status = 'late';
  return { from, to, days, expected, remaining, neededPerHour, ratePerHour: input.lastHour, projection, minutesLeft: left, elapsed, status };
}

/** La date du jour (AAAA-MM-JJ) dans ce fuseau. */
function localDate(d: Date, timeZone: string) {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
  } catch {
    return d.toISOString().slice(0, 10);
  }
}

/** La rotation : l'équipe (groupe NSTBrowser) de service aujourd'hui. Une
 * équipe par jour, dans l'ordre, en boucle à partir du jour de début de la
 * campagne (jour 0 = la première). `null` sans rotation. */
export function rotationTeamOf(teams: string[], startsAt: Date, now: Date, timeZone: string) {
  if (!teams.length) return null;
  const day = (d: Date) => Date.parse(`${localDate(d, timeZone)}T00:00:00Z`) / 86_400_000;
  const index = Math.max(0, Math.round(day(now) - day(startsAt)));
  return { team: teams[index % teams.length], index: index % teams.length, day: index };
}

/** L'heure locale est-elle dans la plage de publication ? Une plage peut
 * passer minuit (22 h → 6 h) ; des bornes égales = toute la journée. */
export function inWindow(minutes: number, start: number, end: number) {
  if (start === end) return true;
  return end > start ? minutes >= start && minutes < end : minutes >= start || minutes < end;
}

const hhmm = (m: number) => `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

/** Une campagne ferme-t-elle ses publications en ce moment ? Elle respecte
 * sa plage horaire et étale son objectif dessus :
 *   - hors de la plage : rien ne part ;
 *   - objectif de la période atteint : rien de plus ;
 *   - en avance sur le rythme (plus que l'attendu à cette heure, avec une
 *     petite marge) : on attend que l'heure rattrape, au lieu de tout
 *     publier en début de plage.
 * Rend la raison, ou `null` quand elle est ouverte. */
export function campaignGate(input: {
  now: Date;
  timezone: string;
  windowStart: number;
  windowEnd: number;
  target: number;
  published: number;
  expected: number;
}) {
  const minutes = localClock(input.now, input.timezone).minutes;
  if (!inWindow(minutes, input.windowStart, input.windowEnd)) {
    return `hors de sa plage horaire (${hhmm(input.windowStart)} → ${hhmm(input.windowEnd)})`;
  }
  if (input.target > 0 && input.published >= input.target) {
    return `objectif atteint (${input.published}/${input.target})`;
  }
  const slack = Math.max(1, Math.ceil(input.target * 0.05));
  if (input.target > 0 && input.published >= input.expected + slack) {
    return `en avance sur son rythme (${input.published} publiés, ${input.expected} attendus à cette heure)`;
  }
  return null;
}
