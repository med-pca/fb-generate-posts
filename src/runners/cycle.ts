/** Le rythme d'un profil : au plus N posts, puis une pause de X heures.
 *
 * La règle générale (Pilotage → Règles) vaut pour tous ; un profil peut avoir
 * la sienne (ses Réglages) : vide = la règle générale, 0 = jamais de pause. */
export type CycleRule = { max: number | null; hours: number };

export function cycleRule(
  settings: { cycleMaxPosts?: number | null; cyclePauseHours?: number | null } | null | undefined,
  runner: { cycleMaxPosts?: number | null; cyclePauseHours?: number | null } | null | undefined,
): CycleRule {
  const own = runner?.cycleMaxPosts;
  const max = own != null ? (own > 0 ? own : null) : settings?.cycleMaxPosts && settings.cycleMaxPosts > 0 ? settings.cycleMaxPosts : null;
  const hours = Math.max(1, runner?.cyclePauseHours ?? settings?.cyclePauseHours ?? 12);
  return { max, hours };
}

/** Depuis quand les posts du cycle comptent : la fin de la dernière pause,
 * sinon les dernières 24 h (règle tout juste activée). */
export function cycleSince(runner: { cycleStartedAt?: Date | null } | null | undefined, now: Date) {
  const day = new Date(now.getTime() - 24 * 3_600_000);
  const start = runner?.cycleStartedAt;
  return start && start > day ? start : day;
}
