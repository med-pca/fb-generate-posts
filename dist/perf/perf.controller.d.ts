import { PerfService } from './perf.service';
declare class PerfSettingsDto {
    enabled: boolean;
}
export declare class PerfController {
    private readonly perf;
    constructor(perf: PerfService);
    report(hours?: string): Promise<{
        hours: number;
        minutesMeasured: number;
        enabled: boolean;
        instances: number;
        summary: {
            calls: number;
            perHour: number;
            avgMs: number;
            p95: number;
            sqlAvg: number;
            errors: number;
            costSeconds: number;
        };
        routes: {
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
        }[];
        cache: {
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
        }[];
        problems: {
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
        }[];
        callers: {
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
        }[];
        who: {
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
        }[];
        slow: {
            at: Date;
            method: string;
            route: string;
            url: string;
            caller: string;
            status: number;
            ms: number;
            sqlCount: number;
            sqlMs: number;
            kb: number;
        }[];
    }>;
    settings(dto: PerfSettingsDto): Promise<{
        enabled: boolean;
    }>;
}
export {};
