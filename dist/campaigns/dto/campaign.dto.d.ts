export declare class CreateCampaignDto {
    name: string;
    siteId: string;
    categoryId?: string | null;
    period: 'day' | 'week' | 'month';
    target: number;
    startsAt?: string;
    endsAt?: string | null;
    timezone?: string;
    windowStart?: number;
    windowEnd?: number;
    priority?: number;
    groupIds?: string[];
    profileIds?: string[];
    articleIds?: string[];
    notes?: string;
    maxPerProfilePerDay?: number | null;
    activeProfiles?: number | null;
    spread?: boolean;
    rotationTeams?: string[];
}
export declare class UpdateCampaignDto {
    name?: string;
    siteId?: string;
    categoryId?: string | null;
    status?: 'ACTIVE' | 'PAUSED' | 'ENDED';
    period?: 'day' | 'week' | 'month';
    target?: number;
    startsAt?: string;
    endsAt?: string | null;
    timezone?: string;
    windowStart?: number;
    windowEnd?: number;
    priority?: number;
    groupIds?: string[];
    profileIds?: string[];
    articleIds?: string[];
    notes?: string;
    maxPerProfilePerDay?: number | null;
    activeProfiles?: number | null;
    spread?: boolean;
    rotationTeams?: string[];
}
