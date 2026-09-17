import { OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { SettingsService } from './settings.service';
export declare class ReplenishScheduler implements OnModuleInit, OnModuleDestroy {
    private readonly config;
    private readonly settings;
    private readonly prisma;
    private readonly logger;
    private timer?;
    private startup?;
    private running;
    constructor(config: ConfigService, settings: SettingsService, prisma: PrismaService);
    onModuleInit(): void;
    onModuleDestroy(): void;
    intervalMinutes(): number;
    run(): Promise<{
        skipped: "already_running";
        profiles?: undefined;
        generated?: undefined;
        reused?: undefined;
        error?: undefined;
    } | {
        profiles: number;
        generated: number;
        reused: number;
        skipped?: undefined;
        error?: undefined;
    } | {
        error: string;
        skipped?: undefined;
        profiles?: undefined;
        generated?: undefined;
        reused?: undefined;
    }>;
}
