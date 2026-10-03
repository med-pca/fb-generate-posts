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
