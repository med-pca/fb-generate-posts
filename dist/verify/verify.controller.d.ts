import type { CurrentUser } from '../auth/current-user';
import { SpamResultDto, AuditResultDto, MemberResultDto, ModeratorDto, PostApprovalResultDto, RemovalResultDto, ResolveDto, VerifyClaimDto, VerifyResultDto } from './dto/verify.dto';
import { GroupTasksService } from './group-tasks.service';
import { AuditService } from './audit.service';
import { VerifyService } from './verify.service';
import { MembersService } from './members.service';
import { ShortCacheService } from '../perf/short-cache.service';
export declare class VerifyController {
    private readonly verify;
    private readonly members;
    private readonly audit;
    private readonly groupTasks;
    constructor(verify: VerifyService, members: MembersService, audit: AuditService, groupTasks: GroupTasksService);
    claimRemovals(dto: VerifyClaimDto, acting: CurrentUser | null): Promise<{
        tasks: {
            taskId: string;
            kind: "remove";
            member: {
                facebookUserId: string;
                name: string;
            };
            group: {
                name: string;
                url: string;
            };
        }[];
    }>;
    removalResult(taskId: string, dto: RemovalResultDto, acting: CurrentUser | null): Promise<{
        taskId: string;
        result: string;
    }>;
    claimPostApprovals(dto: VerifyClaimDto, acting: CurrentUser | null): Promise<{
        tasks: {
            taskId: string;
            kind: "approve_post";
            content: string;
            author: {
                name: string;
                facebookUserId: string | null;
            } | null;
            group: {
                name: string;
                externalId: string | null;
                url: string;
            };
        }[];
    }>;
    postApprovalResult(taskId: string, dto: PostApprovalResultDto, acting: CurrentUser | null): Promise<{
        taskId: string;
        result: string;
    }>;
    claimSpam(dto: VerifyClaimDto, acting: CurrentUser | null): Promise<{
        tasks: {
            taskId: string;
            kind: "release_spam";
            group: {
                name: string;
                url: string;
            };
            members: {
                facebookUserId: string;
                name: string;
            }[];
            max: number;
        }[];
    }>;
    spamResult(groupId: string, dto: SpamResultDto, acting: CurrentUser | null): Promise<{
        groupId: string;
        released: number;
        matched: number;
        refused: number;
    }>;
    claimAudit(dto: VerifyClaimDto, acting: CurrentUser | null): Promise<{
        tasks: {
            taskId: string;
            mode: string;
            member: {
                facebookUserId: string;
                name: string;
            };
            group: {
                name: string;
                url: string;
            };
        }[];
    }>;
    auditResult(taskId: string, dto: AuditResultDto, acting: CurrentUser | null): Promise<{
        taskId: string;
        state: null;
        result: string;
    } | {
        taskId: string;
        state: string;
        result: string;
    }>;
    claimMembers(dto: VerifyClaimDto, acting: CurrentUser | null): Promise<{
        tasks: {
            taskId: string;
            kind: import("./members.service").MemberKind;
            member: {
                facebookUserId: string;
                name: string;
            };
            group: {
                name: string;
                url: string;
            };
        }[];
    }>;
    memberResult(taskId: string, dto: MemberResultDto, acting: CurrentUser | null): Promise<{
        taskId: string;
        result: string;
    }>;
    claim(dto: VerifyClaimDto, acting: CurrentUser | null): Promise<{
        tasks: never[];
        paused: boolean;
        verifyAfterMinutes: number;
        disabled?: undefined;
    } | {
        tasks: never[];
        disabled: boolean;
        verifyAfterMinutes: number;
        paused?: undefined;
    } | {
        verifyAfterMinutes: number;
        tasks: {
            targetId: string;
            postUrl: string | null;
            postText: string;
            postTitle: string;
            linkUrl: string | null;
            author: string;
            authorFacebookId: string | null;
            group: {
                name: string;
                url: string;
            };
            publishedAt: Date | null;
            republishCount: number;
        }[];
        paused?: undefined;
        disabled?: undefined;
    }>;
    result(targetId: string, dto: VerifyResultDto, acting: CurrentUser | null): Promise<{
        targetId: string;
        result: string;
    }>;
}
export declare class AdminVerifyController {
    private readonly verify;
    private readonly members;
    private readonly groupTasks;
    private readonly cache;
    constructor(verify: VerifyService, members: MembersService, groupTasks: GroupTasksService, cache: ShortCacheService);
    suspended(acting: CurrentUser): Promise<{
        id: string;
        name: string;
        facebookUserId: string | null;
        kind: string | null;
        suspendedAt: Date | null;
        detail: string | null;
        groups: number;
        requested: number;
        removed: number;
        failing: number;
        lastError: string | null;
    }[]>;
    overview(acting: CurrentUser): Promise<{
        review: {
            targetId: string;
            detail: string | null;
            since: Date;
            republishCount: number;
            post: {
                id: string;
                description: string;
                title: string;
                priority: number;
                imageUrl: string | null;
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
            facebookUrl: string | null;
        }[];
        members: {
            due: number;
            preApproved: number;
            approved: number;
            unknownIdentity: number;
            problems: {
                taskId: string;
                kind: string;
                error: string | null;
                at: Date | null;
                attempts: number;
                gaveUp: boolean;
                profile: {
                    id: string;
                    name: string;
                };
                group: {
                    id: string;
                    name: string;
                    url: string;
                };
            }[];
        };
        due: number;
        verified: number;
        republished: number;
        needsAction: number;
        verifyAfterMinutes: number;
    }>;
    moderator(profileId: string, dto: ModeratorDto, acting: CurrentUser): Promise<{
        id: string;
        name: string;
        isModerator: boolean;
        facebookUserId: string | null;
    }>;
    retryMember(taskId: string, acting: CurrentUser): Promise<{
        taskId: string;
        result: string;
    }>;
    resolve(targetId: string, dto: ResolveDto, acting: CurrentUser): Promise<{
        targetId: string;
        result: string;
    }>;
}
