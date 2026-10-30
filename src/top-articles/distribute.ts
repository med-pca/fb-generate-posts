/** Un article du top Radar (classé par vues sur 7 jours). */
export type RadarArticle = { url: string; title: string; image: string | null; domain: string; views: number; viral: boolean };

/** Ce qui a déjà été donné : à qui, et quel jour (AAAA-MM-JJ). */
export type PastPick = { userId: string; url: string; day: string };

export const PER_USER = 10;
/** Un article donné à un gestionnaire ne va pas à un autre avant N jours. */
export const OTHERS_COOLDOWN_DAYS = 7;

const addDays = (day: string, n: number) => {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

/**
 * Les 10 articles du jour de chaque gestionnaire, pris dans le top (meilleur
 * d'abord), distribués « en serpent » (A, B, C, C, B, A…) pour que personne
 * n'ait toujours les meilleurs :
 *   - jamais le même article à deux gestionnaires le même jour ;
 *   - jamais deux fois le même article au même gestionnaire ;
 *   - pas un article donné à un AUTRE dans les 7 derniers jours — règle
 *     relâchée seulement si le top ne suffit plus.
 * `taken` : ce qui est déjà donné aujourd'hui (un gestionnaire ajouté en
 * cours de journée reçoit sa liste sans toucher à celles des autres).
 */
export function distribute(
  pool: RadarArticle[],
  userIds: string[],
  past: PastPick[],
  today: string,
  taken: Set<string> = new Set(),
  perUser = PER_USER,
): Map<string, RadarArticle[]> {
  const out = new Map(userIds.map((id) => [id, [] as RadarArticle[]]));
  const used = new Set(taken);
  const seenBy = new Map<string, Set<string>>();
  const recentOwners = new Map<string, Set<string>>();
  const since = addDays(today, -OTHERS_COOLDOWN_DAYS);
  for (const p of past) {
    if (!seenBy.has(p.userId)) seenBy.set(p.userId, new Set());
    seenBy.get(p.userId)!.add(p.url);
    if (p.day >= since && p.day < today) {
      if (!recentOwners.has(p.url)) recentOwners.set(p.url, new Set());
      recentOwners.get(p.url)!.add(p.userId);
    }
  }
  const allowed = (userId: string, a: RadarArticle, strict: boolean) =>
    !used.has(a.url) &&
    !seenBy.get(userId)?.has(a.url) &&
    (!strict || ![...(recentOwners.get(a.url) ?? [])].some((u) => u !== userId));

  for (const strict of [true, false]) {
    let round = 0;
    for (;;) {
      const order = round % 2 === 0 ? userIds : [...userIds].reverse();
      let progressed = false;
      for (const userId of order) {
        const list = out.get(userId)!;
        if (list.length >= perUser) continue;
        const a = pool.find((x) => allowed(userId, x, strict));
        if (!a) continue;
        list.push(a);
        used.add(a.url);
        progressed = true;
      }
      if (!progressed) break;
      round += 1;
    }
  }
  return out;
}
