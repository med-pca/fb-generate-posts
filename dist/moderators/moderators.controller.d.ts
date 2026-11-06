import type { CurrentUser } from '../auth/current-user';
import { AuditRequestDto, MemberManualDto, MemberRequestDto, VerifyClaimDto } from '../verify/dto/verify.dto';
import { MembersService } from '../verify/members.service';
import { AuditService } from '../verify/audit.service';
import { ModeratorsService } from './moderators.service';
export declare class ModeratorSettingsDto {
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
}
export declare class ModeratorRunDto {
    kind?: 'posts' | 'members';
}
export declare class ModeratorControlDto extends VerifyClaimDto {
    agent?: string;
}
export declare class ModeratorsController {
    private readonly moderators;
    private readonly audit;
    private readonly members;
    constructor(moderators: ModeratorsService, audit: AuditService, members: MembersService);
    preapprovals(acting: CurrentUser, profileId?: string, state?: string, search?: string): Promise<{
        state: string;
        total: number;
        counts: {
            [k: string]: number;
        };
        profiles: {
            id: string;
            name: string;
            createdAt: Date;
            facebookKnown: boolean;
            todo: number;
        }[];
        rows: {
            linkId: string;
            linkedAt: Date;
            profile: {
                id: string;
                name: string;
                createdAt: Date;
                facebookKnown: boolean;
            };
            group: {
                category: {
                    id: string;
                    name: string;
                } | null;
                id: string;
                name: string;
                url: string;
            };
            state: string;
            preApprovedAt: Date | null;
            requestedAt: Date | null;
            error: string | null;
            errorAt: Date | null;
            attempts: number;
            auditPending: boolean;
            audit: {
                state: string;
                at: Date | null;
                detail: string | null;
            } | null;
        }[];
    }>;
    membersSummary(acting: CurrentUser): Promise<{
        approve: number;
        approveBlocked: number;
        preapprove: number;
        preapproveBlocked: number;
        requested: number;
        preApproved: number;
    }>;
    requestMembers(dto: MemberRequestDto, acting: CurrentUser): Promise<{
        kind: "approve" | "preapprove";
        requested: number;
        blocked: {
            noFacebookId: number;
            profiles: string[];
        };
        moderators: number;
        moderatorsTotal: number;
    }>;
    markManual(dto: MemberManualDto, acting: CurrentUser): Promise<{
        updated: number;
        state: "preapproved" | "clear";
    }>;
    requestAudit(dto: AuditRequestDto, acting: CurrentUser): Promise<{
        requested: number;
        moderators: number;
    }>;
    auditResults(acting: CurrentUser, profileId?: string): Promise<{
        summary: {
            pending: number;
            preApproved: number;
            notPreApproved: number;
            noPermission: number;
            notFound: number;
        };
        rows: {
            taskId: string;
            profile: {
                id: string;
                name: string;
            };
            group: {
                id: string;
                name: string;
                url: string;
            };
            pending: boolean;
            mode: string | null;
            state: string | null;
            checkedAt: Date | null;
            detail: string | null;
        }[];
    }>;
    list(acting: CurrentUser): Promise<{
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
            today: {
                [x: string]: number;
            } | undefined;
            week: {
                [x: string]: number;
            } | undefined;
        }[];
    }>;
    detail(id: string, acting: CurrentUser): Promise<{
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
            today: {
                [x: string]: number;
            } | undefined;
            week: {
                [x: string]: number;
            } | undefined;
            month: {
                [x: string]: number;
            } | undefined;
            total: {
                [x: string]: number;
            } | undefined;
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
    settings(id: string, dto: ModeratorSettingsDto, acting: CurrentUser): Promise<{
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
    run(id: string, dto: ModeratorRunDto, acting: CurrentUser): Promise<{
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
}
export declare class ModeratorControlController {
    private readonly moderators;
    constructor(moderators: ModeratorsService);
    control(dto: ModeratorControlDto, acting: CurrentUser | null): Promise<{
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
}
