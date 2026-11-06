import { OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { WordpressService } from './wordpress.service';
export declare class WordpressPullService implements OnModuleInit, OnModuleDestroy {
    private readonly prisma;
    private readonly config;
    private readonly wordpress;
    private readonly logger;
    private timer?;
    private startup?;
    private running;
    constructor(prisma: PrismaService, config: ConfigService, wordpress: WordpressService);
    onModuleInit(): void;
    onModuleDestroy(): void;
    pullAll(): Promise<({
        site: string;
        received: number;
        skipped: string;
        failed?: undefined;
    } | {
        site: string;
        received: number;
        skipped?: undefined;
        failed?: undefined;
    } | {
        site: string;
        received: number;
        failed: number;
        skipped?: undefined;
    } | {
        site: string;
        received: number;
        error: string;
    })[]>;
    pullSite(site: {
        id: string;
        name: string;
        originUrl: string;
        depositKey: string | null;
    }): Promise<{
        site: string;
        received: number;
        skipped: string;
        failed?: undefined;
    } | {
        site: string;
        received: number;
        skipped?: undefined;
        failed?: undefined;
    } | {
        site: string;
        received: number;
        failed: number;
        skipped?: undefined;
    }>;
}
