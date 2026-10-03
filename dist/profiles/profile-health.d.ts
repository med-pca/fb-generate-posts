export declare const HEALTH_WINDOW_DAYS = 14;
export type HealthInput = {
    published: number;
    failed: number;
    verifiedOk: number;
    verifiedBad: number;
    withLink: number;
    linkPlaced: number;
    failStreak: number;
    claimsLost: number;
};
export type HealthLabel = 'good' | 'watch' | 'bad' | 'new';
export type Health = {
    score: number | null;
    label: HealthLabel;
    successRate: number | null;
    verifyRate: number | null;
    linkRate: number | null;
    suggestDeactivate: boolean;
    reasons: string[];
};
export declare const HEALTH_LABELS: Record<HealthLabel, string>;
export declare function healthOf(input: HealthInput): Health;
export declare function rankCandidates<T extends {
    score: number | null;
    coverage: number;
    running: boolean;
}>(candidates: T[]): T[];
