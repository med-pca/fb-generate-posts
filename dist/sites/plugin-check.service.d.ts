import { OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PluginState } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
export type PluginCheck = {
    state: PluginState;
    version: string | null;
    message: string;
};
export declare function classifyPluginResponse(status: number, body: unknown, delivers?: boolean): PluginCheck;
export declare class PluginCheckService implements OnModuleInit, OnModuleDestroy {
    private readonly prisma;
    private readonly config;
    private readonly logger;
    private timer?;
    private startup?;
    private running;
    constructor(prisma: PrismaService, config: ConfigService);
    onModuleInit(): void;
    onModuleDestroy(): void;
    checkAll(ids?: string[]): Promise<{
        state: PluginState;
        version: string | null;
        message: string;
        siteId: string;
    }[]>;
    check(siteId: string): Promise<{
        state: PluginState;
        version: string | null;
        message: string;
        siteId: string;
    }>;
    private probe;
}
