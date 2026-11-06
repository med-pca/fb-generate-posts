export declare const BUCKETS: readonly [25, 50, 100, 250, 500, 1000, 2000, 5000, 10000];
export declare const bucketOf: (ms: number) => number;
export declare function callerOf(input: {
    route: string;
    hasApiKey: boolean;
    user?: {
        username: string;
        role: string;
    } | null;
    userAgent?: string;
}): string;
export type MetricSum = {
    method: string;
    route: string;
    caller?: string;
    count: number;
    errors: number;
    totalMs: number;
    maxMs: number;
    sqlCount: number;
    sqlMs: number;
    bytes: number;
    gets: number;
    repeats: number;
    buckets: number[];
};
export declare function percentile(buckets: number[], q: number): 0 | 1000 | 100 | 10000 | 2000 | 5000 | 500 | 50 | 25 | 250;
export declare function readRoute(m: MetricSum, minutes: number): {
    count: number;
    perHour: number;
    avgMs: number;
    p50: number;
    p95: number;
    maxMs: number;
    costSeconds: number;
    sqlAvg: number;
    sqlShare: number;
    errors: number;
    avgKb: number;
    repeatRatio: number;
    advice: {
        kind: "cache" | "n+1" | "db" | "slow" | "poll" | "errors";
        text: string;
    }[];
    caller?: string | undefined;
    method: string;
    route: string;
};
