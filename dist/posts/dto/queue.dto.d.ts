export declare class QueueQueryDto {
    categoryId?: string;
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
export declare class OptionalFacebookUrlDto {
    facebookUrl?: string;
}
