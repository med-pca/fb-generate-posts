export type CycleRule = {
    max: number | null;
    hours: number;
};
export declare function cycleRule(settings: {
    cycleMaxPosts?: number | null;
    cyclePauseHours?: number | null;
} | null | undefined, runner: {
    cycleMaxPosts?: number | null;
    cyclePauseHours?: number | null;
} | null | undefined): CycleRule;
export declare function cycleSince(runner: {
    cycleStartedAt?: Date | null;
} | null | undefined, now: Date): Date;
