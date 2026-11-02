import { AsyncLocalStorage } from 'node:async_hooks';

/** Ce qu'un appel de l'API a coûté en base : nombre de requêtes SQL et leur
 * temps. Ouvert par le hook `onRequest` (PerfService), rempli par
 * PrismaService à chaque requête — y compris celles des gardes
 * d'authentification et des transactions. */
export type PerfContext = { sql: number; sqlMs: number };

export const perfContext = new AsyncLocalStorage<PerfContext>();

/** Une requête SQL terminée, comptée pour l'appel en cours (s'il y en a un). */
export function countSql(ms: number) {
  const ctx = perfContext.getStore();
  if (ctx) {
    ctx.sql += 1;
    ctx.sqlMs += ms;
  }
}
