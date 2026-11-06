import { PrismaService } from '../prisma/prisma.service';
import type { CurrentUser } from '../auth/current-user';
import { VerifyService } from '../verify/verify.service';
import { MembersService } from '../verify/members.service';
type Counts = Record<string, number>;
export declare class ModeratorsService {
    private readonly prisma;
    private readonly verify;
    private readonly members;
    constructor(prisma: PrismaService, verify: VerifyService, members: MembersService);
    private settingsOf;
    private counts;
    private moderatorsWhere;
    list(acting: CurrentUser | null, now?: Date): Promise<{
        due: {
            verifications: number;
            needsAction: number;
            members: number;
        };
        moderators: {
            id: string;
            name: string;
            status: import("@prisma/client").$Enums.RecordStatus;
            externalId: string | null;
            facebookUserId: string | null;
            settings: {
                paused: boolean;
                runRequestedAt: Date | null;
                membersRunRequestedAt: Date | null;
                batchSize: number;
                everyMinutes: number;
                members: boolean;
                postsCheck: boolean;
                removals: boolean;
                spam: boolean;
                pending: boolean;
                windowStart: number;
                windowEnd: number;
                timezone: string;
                hourlyLimit: number;
                dailyLimit: number;
                seenAt: Date | null;
                agent: string | null;
                online: boolean;
            };
            today: Counts | undefined;
            week: Counts | undefined;
        }[];
    }>;
    private reachable;
    detail(id: string, acting: CurrentUser | null, now?: Date): Promise<{
        moderator: {
            id: string;
            name: string;
            status: import("@prisma/client").$Enums.RecordStatus;
            externalId: string | null;
            facebookUserId: string | null;
            settings: {
                paused: boolean;
                runRequestedAt: Date | null;
                membersRunRequestedAt: Date | null;
                batchSize: number;
                everyMinutes: number;
                members: boolean;
                postsCheck: boolean;
                removals: boolean;
                spam: boolean;
                pending: boolean;
                windowStart: number;
                windowEnd: number;
                timezone: string;
                hourlyLimit: number;
                dailyLimit: number;
                seenAt: Date | null;
                agent: string | null;
                online: boolean;
            };
        };
        counts: {
            today: Counts | undefined;
            week: Counts | undefined;
            month: Counts | undefined;
            total: Counts | undefined;
        };
        days: {
            day: string;
            ok: number;
            problems: number;
            members: number;
        }[];
        due: {
            verifications: number;
            needsAction: number;
            members: number;
            memberProblems: number;
        };
        recent: {
            at: Date;
            level: import("@prisma/client").$Enums.LogLevel;
            eventType: string;
            message: string;
            facebookUrl: string | null;
            postTargetId: string | null;
            group: {
                id: string;
                name: string;
            } | null;
            post: {
                id: string;
                title: string;
            } | null;
            member: {
                id: string;
                name: string;
            } | null;
        }[];
    }>;
    updateSettings(id: string, patch: {
        paused?: boolean;
        batchSize?: number;
        everyMinutes?: number;
        members?: boolean;
        postsCheck?: boolean;
        removals?: boolean;
        spam?: boolean;
        pending?: boolean;
        windowStart?: number;
        windowEnd?: number;
        timezone?: string;
        hourlyLimit?: number;
        dailyLimit?: number;
    }, acting: CurrentUser): Promise<{
        paused: boolean;
        runRequestedAt: Date | null;
        membersRunRequestedAt: Date | null;
        batchSize: number;
        everyMinutes: number;
        members: boolean;
        postsCheck: boolean;
        removals: boolean;
        spam: boolean;
        pending: boolean;
        windowStart: number;
        windowEnd: number;
        timezone: string;
        hourlyLimit: number;
        dailyLimit: number;
        seenAt: Date | null;
        agent: string | null;
        online: boolean;
    }>;
    run(id: string, acting: CurrentUser, kind?: 'posts' | 'members', now?: Date): Promise<{
        kind: "posts" | "members";
        requestedAt: Date;
        online: boolean;
    }>;
    recheck(id: string, acting: CurrentUser): Promise<{
        requeued: number;
    }>;
    retryMembers(id: string, acting: CurrentUser): Promise<{
        requeued: number;
    }>;
    control(profileExternalId: string, agent: string | undefined, acting: CurrentUser | null, now?: Date): Promise<{
        paused: boolean;
        runRequestedAt: Date | null;
        membersRunRequestedAt: Date | null;
        batchSize: number;
        everyMinutes: number;
        members: boolean;
        postsCheck: boolean;
        removals: boolean;
        spam: boolean;
        pending: boolean;
        windowStart: number;
        windowEnd: number;
        timezone: string;
        hourlyLimit: number;
        dailyLimit: number;
        seenAt: Date | null;
        agent: string | null;
        online: boolean;
    }>;
    private log;
}
export {};
