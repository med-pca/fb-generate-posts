export declare class UpdateSettingsDto {
    publishingEnabled?: boolean;
    dailyTarget?: number;
    objectiveStart?: number;
    objectiveEnd?: number;
    objectiveTimezone?: string;
    repeatTimes?: number;
    repeatEveryHours?: number;
    rateLimitPauseDays?: number;
    pilotMode?: 'article' | 'group';
    rewriteStyle?: 'seo' | 'faithful';
    nstGroupLimited?: string;
    nstGroupCheckpoint?: string;
    nstGroupDisabled?: string;
    nstGroupLoggedOut?: string;
    cycleMaxPosts?: number | null;
    cyclePauseHours?: number;
    engagementReview?: boolean;
    adaptivePacing?: boolean;
    minPostGapMinutes?: number;
    articleParagraphsPerPage?: number;
    articleMaxPages?: number;
    articleMinWordsPerPage?: number;
    imageProvider?: string;
}
