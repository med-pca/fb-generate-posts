import { MISSING_WHY } from '../link-why';
export declare class QueueQueryDto {
    categoryId?: string;
    siteId?: string;
    groupId?: string;
    limit: number;
    publishedLimit: number;
}
export declare const PRIORITY_MOVES: readonly ["top", "up", "down", "reset"];
export type PriorityMove = (typeof PRIORITY_MOVES)[number];
export declare class PriorityDto {
    move?: PriorityMove;
    priority?: number;
}
export declare class ForceTargetDto {
    profileId: string | null;
}
export declare class FacebookUrlDto {
    facebookUrl: string;
}
export declare class AttachFacebookUrlDto extends FacebookUrlDto {
    targetId?: string;
}
export declare class OptionalFacebookUrlDto {
    facebookUrl?: string;
}
export declare const PUBLISHED_VERIFY: readonly ["ok", "republished", "needs_action", "unverified"];
export declare const PUBLISHED_LINK: readonly ["placed", "waiting", "missing", "none"];
export declare class PublishedQueryDto {
    from?: string;
    to?: string;
    profileId?: string;
    groupId?: string;
    categoryId?: string;
    siteId?: string;
    verify?: (typeof PUBLISHED_VERIFY)[number];
    link?: (typeof PUBLISHED_LINK)[number];
    why?: (typeof MISSING_WHY)[number];
    kind?: 'article' | 'visual' | 'manual';
    url?: 'with' | 'without';
    search?: string;
    page: number;
    limit: number;
}
export declare class GroupLimitsDto {
    dailyCap?: number | null;
    hoursStart?: number | null;
    hoursEnd?: number | null;
}
