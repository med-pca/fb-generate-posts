import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateLogDto } from './dto/create-log.dto';
import { QueryLogsDto } from './dto/query-logs.dto';
import { LogsSummaryDto } from './dto/logs-summary.dto';
import type { CurrentUser } from '../auth/current-user';
import type { LogDomain } from './domains';
export declare class LogsService {
    private readonly prisma;
    constructor(prisma: PrismaService);
    create(dto: CreateLogDto): Prisma.Prisma__ActivityLogClient<{
        id: string;
        createdAt: Date;
        profileId: string | null;
        facebookUrl: string | null;
        groupId: string | null;
        postId: string | null;
        message: string;
        eventType: string;
        level: import("@prisma/client").$Enums.LogLevel;
        metadata: Prisma.JsonValue | null;
        postTargetId: string | null;
        jobId: string | null;
    }, never, import("@prisma/client/runtime/library").DefaultArgs, Prisma.PrismaClientOptions>;
    findAll(profileId: string | undefined, acting: CurrentUser | null): Prisma.PrismaPromise<{
        id: string;
        createdAt: Date;
        profileId: string | null;
        facebookUrl: string | null;
        groupId: string | null;
        postId: string | null;
        message: string;
        eventType: string;
        level: import("@prisma/client").$Enums.LogLevel;
        metadata: Prisma.JsonValue | null;
        postTargetId: string | null;
        jobId: string | null;
    }[]>;
    search({ page, limit, ...filters }: QueryLogsDto, acting: CurrentUser | null): Promise<{
        data: {
            domain: LogDomain;
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
            metadata: Prisma.JsonValue | null;
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
    exportCsv({ page, limit, ...filters }: QueryLogsDto, acting: CurrentUser | null): Promise<string>;
    summary({ hours, profileId, domain }: LogsSummaryDto, acting: CurrentUser | null): Promise<{
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
            domain: LogDomain;
            eventType: string;
            total: number;
            errors: number;
        }[];
        domain: LogDomain | null;
        domains: {
            domain: LogDomain;
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
            metadata: Prisma.JsonValue | null;
            postTargetId: string | null;
            jobId: string | null;
        })[];
        incidentsTruncated: boolean;
    }>;
    private foldDomains;
    private foldEventTypes;
    private foldProfiles;
    private pendingLinkStock;
    private emptyLevels;
    private scoped;
    private buildWhere;
}
