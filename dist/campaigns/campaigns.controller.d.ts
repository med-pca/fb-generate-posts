import type { CurrentUser } from '../auth/current-user';
import { ShortCacheService } from '../perf/short-cache.service';
import { CampaignsService } from './campaigns.service';
import { CreateCampaignDto, UpdateCampaignDto } from './dto/campaign.dto';
export declare class CampaignsController {
    private readonly campaigns;
    private readonly cache;
    constructor(campaigns: CampaignsService, cache: ShortCacheService);
    list(acting: CurrentUser): Promise<{
        progress: {
            since: Date;
            published: number;
            target: number;
            stock: number;
            deficit: number;
            state: string;
            from: Date;
            to: Date;
            days: number;
            expected: number;
            remaining: number;
            neededPerHour: number;
            ratePerHour: number;
            projection: number;
            minutesLeft: number;
            elapsed: number;
            status: "not_started" | "ahead" | "on_track" | "late" | "reached" | "missed";
        };
        capacity: {
            working: number;
            idle: number;
            unavailable: {
                why: string;
                count: number;
            }[];
            perProfile: number;
            perHour: number;
            neededPerHour: number;
            neededProfiles: number;
            missingProfiles: number;
            reasons: string[];
        } | null;
        pool: {
            size: number;
            active: number;
            standby: number;
            unavailable: number;
            missing: number;
        } | null;
        id: string;
        name: string;
        status: string;
        period: string;
        target: number;
        startsAt: Date;
        endsAt: Date | null;
        timezone: string;
        windowStart: number;
        windowEnd: number;
        priority: number;
        notes: string | null;
        maxPerProfilePerDay: number | null;
        activeProfiles: number | null;
        spread: boolean;
        rotationTeams: string[];
        rotationToday: {
            team: string;
            index: number;
            day: number;
        } | null;
        site: {
            id: string;
            name: string;
            categoryId: string | null;
        };
        category: {
            id: string;
            name: string;
        } | null;
        groups: {
            id: string;
            name: string;
        }[];
        profiles: {
            id: string;
            name: string;
        }[];
        articles: {
            id: string;
            title: string;
        }[];
    }[]>;
    teams(acting: CurrentUser): Promise<{
        id: string;
        name: string | null;
        profiles: number;
    }[]>;
    detail(id: string, acting: CurrentUser): Promise<{
        progress: {
            since: Date;
            published: number;
            target: number;
            stock: number;
            deficit: number;
            state: string;
            from: Date;
            to: Date;
            days: number;
            expected: number;
            remaining: number;
            neededPerHour: number;
            ratePerHour: number;
            projection: number;
            minutesLeft: number;
            elapsed: number;
            status: "not_started" | "ahead" | "on_track" | "late" | "reached" | "missed";
        };
        capacity: {
            working: number;
            idle: number;
            unavailable: {
                why: string;
                count: number;
            }[];
            perProfile: number;
            perHour: number;
            neededPerHour: number;
            neededProfiles: number;
            missingProfiles: number;
            reasons: string[];
        } | null;
        pool: {
            size: number;
            active: {
                id: string;
                name: string;
            }[];
            standby: {
                id: string;
                name: string;
            }[];
            unavailable: {
                id: string;
                name: string;
                why: string;
            }[];
            missing: number;
        } | null;
        series: {
            label: string;
            published: number;
        }[];
        byArticle: {
            id: string;
            name: string;
            published: number;
        }[];
        byProfile: {
            id: string;
            name: string;
            published: number;
        }[];
        byGroup: {
            id: string;
            name: string;
            published: number;
        }[];
        id: string;
        name: string;
        status: string;
        period: string;
        target: number;
        startsAt: Date;
        endsAt: Date | null;
        timezone: string;
        windowStart: number;
        windowEnd: number;
        priority: number;
        notes: string | null;
        maxPerProfilePerDay: number | null;
        activeProfiles: number | null;
        spread: boolean;
        rotationTeams: string[];
        rotationToday: {
            team: string;
            index: number;
            day: number;
        } | null;
        site: {
            id: string;
            name: string;
            categoryId: string | null;
        };
        category: {
            id: string;
            name: string;
        } | null;
        groups: {
            id: string;
            name: string;
        }[];
        profiles: {
            id: string;
            name: string;
        }[];
        articles: {
            id: string;
            title: string;
        }[];
    }>;
    create(dto: CreateCampaignDto, acting: CurrentUser): Promise<{
        id: string;
        name: string;
        status: string;
        period: string;
        target: number;
        startsAt: Date;
        endsAt: Date | null;
        timezone: string;
        windowStart: number;
        windowEnd: number;
        priority: number;
        notes: string | null;
        maxPerProfilePerDay: number | null;
        activeProfiles: number | null;
        spread: boolean;
        rotationTeams: string[];
        rotationToday: {
            team: string;
            index: number;
            day: number;
        } | null;
        site: {
            id: string;
            name: string;
            categoryId: string | null;
        };
        category: {
            id: string;
            name: string;
        } | null;
        groups: {
            id: string;
            name: string;
        }[];
        profiles: {
            id: string;
            name: string;
        }[];
        articles: {
            id: string;
            title: string;
        }[];
    }>;
    update(id: string, dto: UpdateCampaignDto, acting: CurrentUser): Promise<{
        id: string;
        name: string;
        status: string;
        period: string;
        target: number;
        startsAt: Date;
        endsAt: Date | null;
        timezone: string;
        windowStart: number;
        windowEnd: number;
        priority: number;
        notes: string | null;
        maxPerProfilePerDay: number | null;
        activeProfiles: number | null;
        spread: boolean;
        rotationTeams: string[];
        rotationToday: {
            team: string;
            index: number;
            day: number;
        } | null;
        site: {
            id: string;
            name: string;
            categoryId: string | null;
        };
        category: {
            id: string;
            name: string;
        } | null;
        groups: {
            id: string;
            name: string;
        }[];
        profiles: {
            id: string;
            name: string;
        }[];
        articles: {
            id: string;
            title: string;
        }[];
    }>;
    remove(id: string, acting: CurrentUser): Promise<{
        deleted: string;
    }>;
}
