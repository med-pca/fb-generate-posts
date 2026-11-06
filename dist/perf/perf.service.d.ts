import { OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import type { FastifyInstance } from 'fastify';
import { PrismaService } from '../prisma/prisma.service';
export declare class PerfService implements OnModuleInit, OnModuleDestroy {
    private readonly prisma;
    private readonly logger;
    private readonly instance;
    private buckets;
    private slow;
    private lastHash;
    private timer;
    private enabled;
    private lastPurge;
    constructor(prisma: PrismaService);
    onModuleInit(): void;
    onModuleDestroy(): Promise<void>;
    register(fastify: FastifyInstance): void;
    private record;
    flush(): Promise<void>;
    report(hours: number): Promise<{
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
    setEnabled(enabled: boolean): Promise<{
        enabled: boolean;
    }>;
}
