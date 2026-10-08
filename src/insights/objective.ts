/** Où en est-on de l'objectif du jour, à cette heure-ci ?
 *
 * L'objectif s'étale sur une plage horaire (8 h → 22 h par défaut) : à 15 h,
 * la moitié de la plage est passée, on attend donc la moitié de l'objectif.
 * C'est cet écart — pas le total brut — qui dit si l'on est bien ou pas.
 */

export type PaceStatus =
  | 'no_target' // aucun objectif réglé
  | 'not_started' // la plage n'a pas commencé
  | 'ahead' // au-dessus de l'attendu
  | 'on_track' // un peu en dessous (moins de 10 %)
  | 'late' // nettement en dessous
  | 'reached' // objectif atteint
  | 'missed'; // plage finie, objectif manqué

export type Pace = {
  status: PaceStatus;
  target: number;
  published: number;
  /** Ce qu'on devrait avoir publié à cette heure. */
  expected: number;
  /** Publié − attendu : négatif = retard. */
  delta: number;
  remaining: number;
  /** Part de la plage écoulée, 0 → 1. */
  elapsed: number;
  minutesLeft: number;
  /** Rythme de la dernière heure, et celui qu'il faudrait tenir d'ici la fin. */
  ratePerHour: number;
  neededPerHour: number;
  /** Où l'on finira au rythme actuel. */
  projection: number;
};

/** Minutes de la plage entre `start` et `end`. Une plage qui traverse minuit
 * (22 h → 6 h) est prise d'un seul tenant ; des bornes égales = 24 h. */
export function windowLength(start: number, end: number) {
  if (start === end) return 1440;
  return end > start ? end - start : 1440 - start + end;
}

/** Minutes écoulées dans la plage, bornées à [0, longueur]. */
export function minutesIntoWindow(now: number, start: number, end: number) {
  const length = windowLength(start, end);
  if (start === end) return now;
  if (end > start) return Math.min(length, Math.max(0, now - start));
  // Traverse minuit : 22 h → 6 h. Avant 22 h mais après 6 h : fini ou à venir.
  if (now >= start) return now - start;
  if (now < end) return 1440 - start + now;
  return length;
}

export function pace(input: {
  target: number;
  start: number;
  end: number;
  nowMinutes: number;
  published: number;
  lastHour: number;
}): Pace {
  const { target, start, end, nowMinutes, published, lastHour } = input;
  const length = windowLength(start, end);
  const into = minutesIntoWindow(nowMinutes, start, end);
  const elapsed = length ? into / length : 1;
  const minutesLeft = Math.max(0, length - into);
  const expected = Math.round(target * elapsed);
  const remaining = Math.max(0, target - published);
  const ratePerHour = lastHour;
  const neededPerHour = minutesLeft
    ? Math.ceil((remaining / minutesLeft) * 60)
    : remaining;
  const projection = published + Math.round((ratePerHour * minutesLeft) / 60);

  let status: PaceStatus;
  if (target <= 0) status = 'no_target';
  else if (published >= target) status = 'reached';
  else if (into <= 0 && end > start) status = 'not_started';
  else if (minutesLeft === 0) status = 'missed';
  else if (published >= expected) status = 'ahead';
  else if (published >= expected * 0.9) status = 'on_track';
  else status = 'late';

  return {
    status,
    target,
    published,
    expected,
    delta: published - expected,
    remaining,
    elapsed,
    minutesLeft,
    ratePerHour,
    neededPerHour,
    projection,
  };
}

/** Temps moyen d'une publication (ouvrir le groupe, écrire, publier). */
export const PUBLISH_MINUTES = 3;

/** La cadence adaptative : combien de minutes un profil attend entre deux
 * posts pour tenir le rythme nécessaire.
 *
 * Il faut `neededPerHour` posts/h, partagés entre `profiles` profils au
 * travail : chacun publie toutes les 60 × profils ÷ besoin minutes, temps de
 * publication compris. Jamais sous `minGap` (un compte qui poste trop vite se
 * fait limiter par Facebook), jamais au-dessus du délai prévu par le post :
 * on accélère pour rattraper, on ne ralentit pas.
 * `null` = rien à adapter (pas d'objectif, en avance, personne au travail). */
export function adaptiveGap(input: { neededPerHour: number; ratePerHour: number; profiles: number; minGap: number; status: PaceStatus }) {
  const { neededPerHour, ratePerHour, profiles, minGap, status } = input;
  if (!neededPerHour || profiles < 1) return null;
  if (!['late', 'on_track', 'ahead'].includes(status)) return null;
  if (status === 'ahead' && ratePerHour >= neededPerHour) return null;
  const every = (60 * profiles) / neededPerHour;
  return Math.max(minGap, Math.floor(every - PUBLISH_MINUTES));
}
