import type { FastifyInstance } from 'fastify';
import type { CurrentUser } from '../auth/current-user';
export declare class ShortCacheService {
    private entries;
    get<T>(acting: CurrentUser | null, key: string, ttlMs: number, compute: () => Promise<T>): Promise<T>;
    clear(): void;
    register(fastify: FastifyInstance): void;
    private sweep;
}
