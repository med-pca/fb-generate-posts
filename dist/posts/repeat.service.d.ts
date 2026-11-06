import { OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
export declare const REPEAT_LIMITS: {
    maxTimes: number;
    minHours: number;
    maxHours: number;
};
type Due = {
    id: string;
    postId: string;
    groupId: string;
    facebookUrl: string | null;
    round: number;
    times: number;
    title: string;
    groupName: string;
};
export declare class RepeatService implements OnModuleInit, OnModuleDestroy {
    private readonly prisma;
    private readonly config;
    private readonly logger;
    private timer?;
    private running;
    constructor(prisma: PrismaService, config: ConfigService);
    onModuleInit(): void;
    onModuleDestroy(): void;
    requeueDue(now?: Date): Promise<Due[]>;
}
export {};
