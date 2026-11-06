import { AsyncLocalStorage } from 'node:async_hooks';
export type PerfContext = {
    sql: number;
    sqlMs: number;
};
export declare const perfContext: AsyncLocalStorage<PerfContext>;
export declare function countSql(ms: number): void;
