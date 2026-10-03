import type { CurrentUser } from '../auth/current-user';
import { MemberResultDto, ModeratorDto, ResolveDto, VerifyClaimDto, VerifyResultDto } from './dto/verify.dto';
import { VerifyService } from './verify.service';
import { MembersService } from './members.service';
export declare class VerifyController {
    private readonly verify;
    private readonly members;
    constructor(verify: VerifyService, members: MembersService);
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
        verifyAfterMinutes: number;
        tasks: {
            targetId: string;
            postUrl: string | null;
            postText: string;
            postTitle: string;
            linkUrl: string | null;
            author: string;
            group: {
                name: string;
                url: string;
            };
            publishedAt: Date | null;
            republishCount: number;
        }[];
    }>;
    result(targetId: string, dto: VerifyResultDto, acting: CurrentUser | null): Promise<{
        targetId: string;
        result: string;
    }>;
}
export declare class AdminVerifyController {
    private readonly verify;
    private readonly members;
    constructor(verify: VerifyService, members: MembersService);
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
                imageUrl: string | null;
                priority: number;
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
