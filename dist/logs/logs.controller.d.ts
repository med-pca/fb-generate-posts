import { CreateLogDto } from './dto/create-log.dto';
import { QueryLogsDto } from './dto/query-logs.dto';
import { LogsSummaryDto } from './dto/logs-summary.dto';
import { LogsService } from './logs.service';
export declare class LogsController {
    private readonly logs;
    constructor(logs: LogsService);
    create(dto: CreateLogDto): import("@prisma/client").Prisma.Prisma__ActivityLogClient<{
        id: string;
        createdAt: Date;
        profileId: string | null;
        groupId: string | null;
        postId: string | null;
        metadata: import("@prisma/client/runtime/library").JsonValue | null;
        eventType: string;
        level: import("@prisma/client").$Enums.LogLevel;
        message: string;
        postTargetId: string | null;
        jobId: string | null;
    }, never, import("@prisma/client/runtime/library").DefaultArgs, import("@prisma/client").Prisma.PrismaClientOptions>;
    findAll(profileId?: string): import("@prisma/client").Prisma.PrismaPromise<{
        id: string;
        createdAt: Date;
        profileId: string | null;
        groupId: string | null;
        postId: string | null;
        metadata: import("@prisma/client/runtime/library").JsonValue | null;
        eventType: string;
        level: import("@prisma/client").$Enums.LogLevel;
        message: string;
        postTargetId: string | null;
        jobId: string | null;
    }[]>;
}
export declare class LogsAdminController {
    private readonly logs;
    constructor(logs: LogsService);
    search(query: QueryLogsDto): Promise<{
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
            metadata: import("@prisma/client/runtime/library").JsonValue | null;
            eventType: string;
            level: import("@prisma/client").$Enums.LogLevel;
            message: string;
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
    summary(query: LogsSummaryDto): Promise<{
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
            metadata: import("@prisma/client/runtime/library").JsonValue | null;
            eventType: string;
            level: import("@prisma/client").$Enums.LogLevel;
            message: string;
            postTargetId: string | null;
            jobId: string | null;
        })[];
        incidentsTruncated: boolean;
    }>;
}
