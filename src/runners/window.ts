/** La fenêtre de publication d'un profil, à l'heure de ce profil.
 *
 * Isolé du service parce que c'est la seule partie du pilotage qui se trompe
 * silencieusement : un fuseau mal lu ou une fenêtre de nuit mal découpée fait
 * publier à 3 h du matin, ou plus jamais, sans rien signaler.
 */

export type Clock = { minutes: number; isoDay: number };

export type Window = {
  /** Minutes depuis minuit. NULL des deux côtés = aucune limite d'heure. */
  windowStart: number | null;
  windowEnd: number | null;
  /** Jours ISO autorisés ("1,2,3,4,5"). Vide ou NULL = tous les jours. */
  days: string | null;
};

const DAYS: Record<string, number> = {
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
  Sun: 7,
};

const DAY_NAMES = [
  '',
  'lundi',
  'mardi',
  'mercredi',
  'jeudi',
  'vendredi',
  'samedi',
  'dimanche',
];

/** L'heure qu'il est pour ce profil, pas pour le serveur.
 *
 * Un fuseau inconnu ne doit pas faire tomber la décision : on retombe sur UTC
 * et l'appelant le dit dans sa raison, plutôt que de renvoyer une erreur à un
 * worker qui n'y peut rien. */
export function localClock(
  now: Date,
  timeZone: string,
): Clock & { fallback: boolean } {
  for (const zone of [timeZone, 'UTC']) {
    try {
      const parts = new Intl.DateTimeFormat('en-GB', {
        timeZone: zone,
        hour12: false,
        hour: '2-digit',
        minute: '2-digit',
        weekday: 'short',
      }).formatToParts(now);
      const get = (type: string) =>
        parts.find((part) => part.type === type)?.value ?? '';
      // "24" existe en hour12:false pour minuit : 24:10 veut dire 00:10.
      const hour = Number(get('hour')) % 24;
      return {
        minutes: hour * 60 + Number(get('minute')),
        isoDay: DAYS[get('weekday')] ?? 1,
        fallback: zone !== timeZone,
      };
    } catch {
      // Fuseau refusé par Intl : on réessaie en UTC.
    }
  }
  return { minutes: 0, isoDay: 1, fallback: true };
}

export function parseDays(days: string | null | undefined): number[] {
  if (!days) return [];
  return [
    ...new Set(
      String(days)
        .split(/[,\s]+/)
        .map((part) => Number(part))
        .filter((day) => Number.isInteger(day) && day >= 1 && day <= 7),
    ),
  ].sort();
}

const hhmm = (minutes: number) =>
  `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;

export const formatWindow = (window: Window) => {
  const hours =
    window.windowStart === null || window.windowEnd === null
      ? '24 h/24'
      : `${hhmm(window.windowStart)}–${hhmm(window.windowEnd)}`;
  const days = parseDays(window.days);
  return days.length && days.length < 7
    ? `${hours}, ${days.map((day) => DAY_NAMES[day]).join(', ')}`
    : hours;
};

/** Ce profil est-il dans sa fenêtre, et pourquoi.
 *
 * Deux détails qui ne se voient qu'à l'usage :
 *
 *  - des bornes égales valent « toute la journée », pas « jamais » : c'est ce
 *    qu'un opérateur veut dire en tapant 08:00–08:00 ;
 *  - une fenêtre de nuit (22:00–06:00) appartient au jour où elle commence,
 *    donc la partie d'après minuit se juge sur la veille. Sans cela, une
 *    fenêtre « lundi 22 h → 6 h » s'arrêterait à minuit pile.
 */
export function insideWindow(
  clock: Clock,
  window: Window,
): { inside: boolean; reason: string } {
  const { windowStart: start, windowEnd: end } = window;
  const allowed = parseDays(window.days);
  const overnight = start !== null && end !== null && start > end;
  // Une fenêtre de nuit vue après minuit est celle de la veille.
  const owningDay =
    overnight && clock.minutes < (end as number)
      ? ((clock.isoDay + 5) % 7) + 1
      : clock.isoDay;

  if (allowed.length && !allowed.includes(owningDay)) {
    return {
      inside: false,
      reason:
        `${DAY_NAMES[owningDay]} n’est pas un jour autorisé ` +
        `(${allowed.map((day) => DAY_NAMES[day]).join(', ')})`,
    };
  }
  if (start === null || end === null || start === end) {
    return { inside: true, reason: 'aucune limite d’heure' };
  }
  const inside = overnight
    ? clock.minutes >= start || clock.minutes < end
    : clock.minutes >= start && clock.minutes < end;
  return {
    inside,
    reason: inside
      ? `dans la fenêtre ${hhmm(start)}–${hhmm(end)}`
      : `hors de la fenêtre ${hhmm(start)}–${hhmm(end)} (il est ${hhmm(clock.minutes)} sur place)`,
  };
}
