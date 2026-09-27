import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateLogDto } from './dto/create-log.dto';
import { QueryLogsDto } from './dto/query-logs.dto';
import { LogsSummaryDto } from './dto/logs-summary.dto';
import type { CurrentUser } from '../auth/current-user';
export declare class LogsService {
    private readonly prisma;
    constructor(prisma: PrismaService);
    create(dto: CreateLogDto): Prisma.Prisma__ActivityLogClient<{
        id: string;
        createdAt: Date;
        profileId: string | null;
        groupId: string | null;
        postId: string | null;
        eventType: string;
        level: import("@prisma/client").$Enums.LogLevel;
        message: string;
        metadata: Prisma.JsonValue | null;
        postTargetId: string | null;
        jobId: string | null;
    }, never, import("@prisma/client/runtime/library").DefaultArgs, Prisma.PrismaClientOptions>;
    findAll(profileId: string | undefined, acting: CurrentUser | null): Prisma.PrismaPromise<{
        id: string;
        createdAt: Date;
        profileId: string | null;
        groupId: string | null;
        postId: string | null;
        eventType: string;
        level: import("@prisma/client").$Enums.LogLevel;
        message: string;
        metadata: Prisma.JsonValue | null;
        postTargetId: string | null;
        jobId: string | null;
    }[]>;
    search({ page, limit, ...filters }: QueryLogsDto, acting: CurrentUser | null): Promise<{
        data: ({
            profile: {
                name: string;
                id: string;
            } | null;
            group: {
                name: string;
                id: string;
            } | null;
            post: {
                id: string;
                title: string;
            } | null;
        } & {
            id: string;
            createdAt: Date;
            profileId: string | null;
            groupId: string | null;
            postId: string | null;
            eventType: string;
            level: import("@prisma/client").$Enums.LogLevel;
            message: string;
            metadata: Prisma.JsonValue | null;
            postTargetId: string | null;
            jobId: string | null;
        })[];
        meta: {
            page: number;
            limit: number;
            total: number;
            pages: number;
        };
    }>;
    summary({ hours, profileId }: LogsSummaryDto, acting: CurrentUser | null): Promise<{
        pendingLinkUpdates: {
            total: number;
            oldestJobId: string | null;
            pendingSince: Date | null;
        };
        since: Date;
        hours: number;
        total: number;
        levels: Record<import("@prisma/client").$Enums.LogLevel, number>;
        claimLost: number;
        eventTypes: {
            eventType: string;
            total: number;
            errors: number;
        }[];
        profiles: {
            profileId: string | null;
            name: string;
            status: string | null;
            total: number;
            errors: number;
        }[];
        incidents: ({
            profile: {
                name: string;
                id: string;
            } | null;
            group: {
                name: string;
                id: string;
            } | null;
            post: {
                id: string;
                title: string;
            } | null;
        } & {
            id: string;
            createdAt: Date;
            profileId: string | null;
            groupId: string | null;
            postId: string | null;
            eventType: string;
            level: import("@prisma/client").$Enums.LogLevel;
            message: string;
            metadata: Prisma.JsonValue | null;
            postTargetId: string | null;
            jobId: string | null;
        })[];
        incidentsTruncated: boolean;
    }>;
    private foldEventTypes;
    private foldProfiles;
    private pendingLinkStock;
    private emptyLevels;
    private scoped;
    private buildWhere;
}
