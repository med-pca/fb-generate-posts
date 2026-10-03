/** La santé d'un profil : un score sur 100, un niveau, et — quand ça va mal —
 * l'indice qu'il vaudrait mieux le désactiver, avec ses raisons.
 *
 * Calcul pur (pas de base) : testable, et le même partout (cartes, détail,
 * filtre, choix du profil qui reprend les posts). */

/** La période observée. Assez longue pour lisser une mauvaise journée, assez
 * courte pour qu'un profil réparé remonte vite. */
export const HEALTH_WINDOW_DAYS = 14;

export type HealthInput = {
  published: number;
  failed: number;
  /** Publications vérifiées en ligne avec leur lien. */
  verifiedOk: number;
  /** Vérifiées introuvables ou sans lien. */
  verifiedBad: number;
  /** Publications dont le post a une URL d'article, et celles où elle a été
   * posée en commentaire. */
  withLink: number;
  linkPlaced: number;
  /** Échecs d'affilée sur ses dernières tentatives. */
  failStreak: number;
  claimsLost: number;
};

export type HealthLabel = 'good' | 'watch' | 'bad' | 'new';

export type Health = {
  score: number | null;
  label: HealthLabel;
  successRate: number | null;
  verifyRate: number | null;
  linkRate: number | null;
  /** Vrai quand il vaut mieux le désactiver. */
  suggestDeactivate: boolean;
  reasons: string[];
};

export const HEALTH_LABELS: Record<HealthLabel, string> = {
  good: 'Bon',
  watch: 'À surveiller',
  bad: 'Mauvais',
  new: 'Pas assez de données',
};

const MIN_ATTEMPTS = 3;
const pct = (n: number) => `${Math.round(n * 100)} %`;

export function healthOf(input: HealthInput): Health {
  const attempts = input.published + input.failed;
  const verified = input.verifiedOk + input.verifiedBad;
  const successRate = attempts ? input.published / attempts : null;
  const verifyRate = verified ? input.verifiedOk / verified : null;
  const linkRate = input.withLink ? input.linkPlaced / input.withLink : null;

  const reasons: string[] = [];
  if (input.failStreak >= 3) reasons.push(`${input.failStreak} échecs d'affilée sur ses dernières tentatives`);
  if (input.failed >= 5 && successRate !== null && successRate < 0.5) {
    reasons.push(`${input.failed} échecs en ${HEALTH_WINDOW_DAYS} jours (${pct(successRate)} de réussite)`);
  }
  if (input.verifiedBad >= 3 && verifyRate !== null && verifyRate < 0.5) {
    reasons.push(`${input.verifiedBad} publications introuvables ou sans lien au contrôle du vérificateur`);
  }
  if (input.withLink >= 5 && linkRate !== null && linkRate < 0.5) {
    reasons.push(`lien de l'article posé sur ${pct(linkRate)} de ses publications seulement`);
  }
  if (input.claimsLost >= 3) reasons.push(`${input.claimsLost} réservations perdues (navigateur muet en pleine publication)`);

  if (attempts < MIN_ATTEMPTS && verified < MIN_ATTEMPTS) {
    // Trop peu pour noter ; mais une série d'échecs se signale quand même.
    return {
      score: null,
      label: 'new',
      successRate,
      verifyRate,
      linkRate,
      suggestDeactivate: input.failStreak >= 3,
      reasons,
    };
  }

  // Réussir à publier compte le plus ; que le post soit vraiment en ligne avec
  // son lien vient ensuite ; le lien posé, enfin.
  const s = successRate ?? 1;
  const v = verifyRate ?? s;
  const l = linkRate ?? 1;
  let score = 100 * (0.5 * s + 0.3 * v + 0.2 * l);
  if (input.failStreak > 1) score -= Math.min(30, (input.failStreak - 1) * 10);
  score = Math.max(0, Math.min(100, Math.round(score)));
  const label: HealthLabel = score >= 80 ? 'good' : score >= 50 ? 'watch' : 'bad';
  return {
    score,
    label,
    successRate,
    verifyRate,
    linkRate,
    suggestDeactivate: reasons.length > 0 && (label === 'bad' || input.failStreak >= 3),
    reasons,
  };
}

/** Qui reprend les posts d'un profil désactivé : celui qui a rejoint le plus
 * de groupes concernés, puis le meilleur score. Un profil sans assez de
 * données compte pour moyen (60) : nouveau ne veut pas dire mauvais. */
export function rankCandidates<T extends { score: number | null; coverage: number; running: boolean }>(candidates: T[]) {
  const value = (c: T) => c.score ?? 60;
  return [...candidates].sort(
    (a, b) => b.coverage - a.coverage || value(b) - value(a) || Number(b.running) - Number(a.running),
  );
}
