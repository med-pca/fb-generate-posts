import type { CurrentUser } from '../auth/current-user';
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
        facebookUrl: string | null;
        groupId: string | null;
        postId: string | null;
        message: string;
        eventType: string;
        level: import("@prisma/client").$Enums.LogLevel;
        metadata: import("@prisma/client/runtime/library").JsonValue | null;
        postTargetId: string | null;
        jobId: string | null;
    }, never, import("@prisma/client/runtime/library").DefaultArgs, import("@prisma/client").Prisma.PrismaClientOptions>;
    findAll(acting: CurrentUser | null, profileId?: string): import("@prisma/client").Prisma.PrismaPromise<{
        id: string;
        createdAt: Date;
        profileId: string | null;
        facebookUrl: string | null;
        groupId: string | null;
        postId: string | null;
        message: string;
        eventType: string;
        level: import("@prisma/client").$Enums.LogLevel;
        metadata: import("@prisma/client/runtime/library").JsonValue | null;
        postTargetId: string | null;
        jobId: string | null;
    }[]>;
}
export declare class LogsAdminController {
    private readonly logs;
    constructor(logs: LogsService);
    search(query: QueryLogsDto, acting: CurrentUser): Promise<{
        data: {
            domain: import("./domains").LogDomain;
            profile: {
                id: string;
                name: string;
            } | null;
            group: {
                category: {
                    id: string;
                    name: string;
                } | null;
                id: string;
                name: string;
                url: string;
            } | null;
            post: {
                id: string;
                title: string;
                url: string | null;
            } | null;
            id: string;
            createdAt: Date;
            profileId: string | null;
            facebookUrl: string | null;
            groupId: string | null;
            postId: string | null;
            message: string;
            eventType: string;
            level: import("@prisma/client").$Enums.LogLevel;
            metadata: import("@prisma/client/runtime/library").JsonValue | null;
            postTargetId: string | null;
            jobId: string | null;
        }[];
        meta: {
            page: number;
            limit: number;
            total: number;
            pages: number;
        };
    }>;
    exportCsv(query: QueryLogsDto, acting: CurrentUser): Promise<string>;
    summary(query: LogsSummaryDto, acting: CurrentUser): Promise<{
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
            domain: import("./domains").LogDomain;
            eventType: string;
            total: number;
            errors: number;
        }[];
        domain: import("./domains").LogDomain | null;
        domains: {
            domain: import("./domains").LogDomain;
            label: string;
            total: number;
            errors: number;
            warns: number;
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
                id: string;
                name: string;
            } | null;
            group: {
                category: {
                    id: string;
                    name: string;
                } | null;
                id: string;
                name: string;
                url: string;
            } | null;
            post: {
                id: string;
                title: string;
                url: string | null;
            } | null;
        } & {
            id: string;
            createdAt: Date;
            profileId: string | null;
            facebookUrl: string | null;
            groupId: string | null;
            postId: string | null;
            message: string;
            eventType: string;
            level: import("@prisma/client").$Enums.LogLevel;
            metadata: import("@prisma/client/runtime/library").JsonValue | null;
            postTargetId: string | null;
            jobId: string | null;
        })[];
        incidentsTruncated: boolean;
    }>;
}
