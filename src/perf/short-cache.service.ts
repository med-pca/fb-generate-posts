import { Injectable } from '@nestjs/common';
import type { FastifyInstance } from 'fastify';
import type { CurrentUser } from '../auth/current-user';

type Entry = { at: number; value: Promise<unknown> };

const MAX_ENTRIES = 2000;

/** 🧊 Un cache très court (10 à 30 s), par compte, pour les lectures que les
 * pages refont en boucle et dont la réponse ne change presque jamais
 * (compteurs du menu, bilan de vérification, file…).
 *
 * - Deux appels simultanés partagent le même calcul.
 * - Toute modification faite depuis une page (POST, PUT, PATCH, DELETE sans
 *   clé d'API) vide le cache : on revoit tout de suite ce qu'on vient de
 *   faire. Les extensions, elles, écrivent sans cesse : leurs changements
 *   apparaissent à l'expiration, au plus 30 s après.
 * - En mémoire : une seule instance de l'API tourne. */
@Injectable()
export class ShortCacheService {
  private entries = new Map<string, Entry>();

  /** Le résultat de `compute`, relu au plus une fois par `ttlMs` pour ce
   * compte et cette clé. Une erreur n'est jamais gardée. */
  get<T>(acting: CurrentUser | null, key: string, ttlMs: number, compute: () => Promise<T>): Promise<T> {
    const full = `${acting?.id ?? 'global'}|${key}`;
    const now = Date.now();
    const hit = this.entries.get(full);
    if (hit && now - hit.at < ttlMs) return hit.value as Promise<T>;
    if (this.entries.size >= MAX_ENTRIES) this.sweep(now);
    const value = compute();
    this.entries.set(full, { at: now, value });
    value.catch(() => {
      if (this.entries.get(full)?.value === value) this.entries.delete(full);
    });
    return value;
  }

  clear() {
    this.entries.clear();
  }

  /** Vider le cache après chaque modification réussie faite depuis une page. */
  register(fastify: FastifyInstance) {
    fastify.addHook('onResponse', (request, reply, done) => {
      if (
        request.method !== 'GET' &&
        request.method !== 'HEAD' &&
        request.method !== 'OPTIONS' &&
        !request.headers['x-api-key'] &&
        reply.statusCode < 400
      ) {
        this.clear();
      }
      done();
    });
  }

  private sweep(now: number) {
    for (const [key, entry] of this.entries) if (now - entry.at > 60_000) this.entries.delete(key);
    if (this.entries.size >= MAX_ENTRIES) this.entries.clear();
  }
}
