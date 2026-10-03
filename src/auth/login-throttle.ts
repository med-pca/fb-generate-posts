/** Freiner les essais de mot de passe.
 *
 * - 5 échecs en 15 minutes pour un même identifiant depuis une même adresse
 *   → bloqué 15 minutes ;
 * - 20 échecs en 15 minutes depuis une même adresse, tous identifiants
 *   confondus → l'adresse est bloquée 15 minutes.
 *
 * En mémoire : un redémarrage remet à zéro, ce qui reste acceptable (un
 * attaquant ne choisit pas quand le serveur redémarre). */
export const WINDOW_MS = 15 * 60_000;
export const MAX_PER_USER = 5;
export const MAX_PER_IP = 20;

export class LoginThrottle {
  private readonly failures = new Map<string, number[]>();

  private recent(key: string, now: number) {
    const kept = (this.failures.get(key) || []).filter((t) => now - t < WINDOW_MS);
    if (kept.length) this.failures.set(key, kept);
    else this.failures.delete(key);
    return kept;
  }

  /** null si l'essai est permis, sinon les secondes à attendre. */
  blockedFor(ip: string, username: string, now = Date.now()) {
    const user = this.recent(`u:${ip}:${username.toLowerCase()}`, now);
    const byIp = this.recent(`ip:${ip}`, now);
    const over = [
      user.length >= MAX_PER_USER ? user[user.length - MAX_PER_USER] : null,
      byIp.length >= MAX_PER_IP ? byIp[byIp.length - MAX_PER_IP] : null,
    ].filter((t): t is number => t !== null);
    if (!over.length) return null;
    return Math.max(1, Math.ceil((Math.max(...over) + WINDOW_MS - now) / 1000));
  }

  fail(ip: string, username: string, now = Date.now()) {
    for (const key of [`u:${ip}:${username.toLowerCase()}`, `ip:${ip}`]) {
      this.failures.set(key, [...this.recent(key, now), now]);
    }
  }

  succeed(ip: string, username: string) {
    this.failures.delete(`u:${ip}:${username.toLowerCase()}`);
  }
}
