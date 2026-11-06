import { type GroupTaskOutcome, type SpamOutcome } from '../group-tasks.service';
import type { AuditOutcome } from '../audit.service';
import type { MemberKind, MemberOutcome } from '../members.service';
import type { VerifyOutcome } from '../verify.service';
export declare class VerifyClaimDto {
    profileExternalId: string;
    limit?: number;
}
export declare class VerifyResultDto {
    profileExternalId: string;
    outcome: VerifyOutcome;
    detail?: string;
    postUrl?: string;
    deleted?: boolean;
}
export declare class ModeratorDto {
    isModerator?: boolean;
    facebookUserId?: string;
}
export declare class MemberResultDto {
    profileExternalId: string;
    kind: MemberKind;
    outcome: MemberOutcome;
    facebookUserId: string;
    detail?: string;
}
export declare class ResolveDto {
    action: 'ok' | 'republish';
}
export declare class AuditResultDto {
    profileExternalId: string;
    outcome: AuditOutcome;
    facebookUserId: string;
    detail?: string;
}
export declare class AuditRequestDto {
    mode: 'check' | 'fix';
    profileGroupIds?: string[];
    profileId?: string;
}
export declare class MemberManualDto {
    profileGroupIds: string[];
    state: 'preapproved' | 'clear';
}
export declare class MemberRequestDto {
    kind: MemberKind;
    profileGroupIds?: string[];
    profileId?: string;
}
export declare class RemovalResultDto {
    profileExternalId: string;
    outcome: GroupTaskOutcome;
    facebookUserId: string;
    detail?: string;
}
export declare class PostApprovalResultDto {
    profileExternalId: string;
    outcome: GroupTaskOutcome;
    detail?: string;
}
export declare class SpamReleasedDto {
    facebookUserId: string;
    postUrl?: string;
    text?: string;
}
export declare class SpamResultDto {
    profileExternalId: string;
    outcome: SpamOutcome;
    detail?: string;
    released?: SpamReleasedDto[];
}
