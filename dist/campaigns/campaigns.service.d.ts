import { OnModuleInit } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { CurrentUser } from '../auth/current-user';
import type { CreateCampaignDto, UpdateCampaignDto } from './dto/campaign.dto';
declare const CAMPAIGN_INCLUDE: {
    site: {
        select: {
            id: true;
            name: true;
            categoryId: true;
        };
    };
    category: {
        select: {
            id: true;
            name: true;
        };
    };
    groups: {
        select: {
            group: {
                select: {
                    id: true;
                    name: true;
                };
            };
        };
    };
    profiles: {
        select: {
            profile: {
                select: {
                    id: true;
                    name: true;
                };
            };
        };
    };
    articles: {
        select: {
            article: {
                select: {
                    id: true;
                    title: true;
                };
            };
        };
    };
};
type CampaignRow = Prisma.CampaignGetPayload<{
    include: typeof CAMPAIGN_INCLUDE;
}>;
export declare class CampaignsService implements OnModuleInit {
    private readonly prisma;
    private readonly logger;
    constructor(prisma: PrismaService);
    onModuleInit(): void;
    list(acting: CurrentUser | null, now?: Date): Promise<{
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
    detail(id: string, acting: CurrentUser | null, now?: Date): Promise<{
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
    create(dto: CreateCampaignDto, acting: CurrentUser | null): Promise<{
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
    update(id: string, dto: UpdateCampaignDto, acting: CurrentUser | null): Promise<{
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
    remove(id: string, acting: CurrentUser | null): Promise<{
        deleted: string;
    }>;
    private behindCache;
    behind(now?: Date): Promise<{
        id: string;
        priority: number;
        deficit: number;
        where: Prisma.PostTargetWhereInput;
        profileIds: string[];
    }[]>;
    dailyTarget(now?: Date, ownerId?: string | null): Promise<number>;
    pacingNeed(now?: Date, ownerId?: string | null): Promise<{
        neededPerHour: number;
        ratePerHour: number;
        status: "late" | "ahead";
    } | null>;
    private dayCache;
    dayPlan(now?: Date): Promise<DayPlan>;
    profileDay(profile: {
        id: string;
        ownerId: string | null;
        team: string | null;
    }, plan: DayPlan, opts?: {
        strict?: boolean;
    }): {
        resting: boolean;
        reason: string | null;
        exclude: Prisma.PostTargetWhereInput | null;
        left: number | null;
        campaigns: string[];
        closed: string[];
    };
    assign(profile: {
        id: string;
        ownerId: string | null;
    }, targetIds: string[], now?: Date): Promise<Map<string, string>>;
    backfill(): Promise<void>;
    teams(acting: CurrentUser | null): Promise<{
        id: string;
        name: string | null;
        profiles: number;
    }[]>;
    private active;
    targetWhere(c: CampaignRow): Prisma.PostTargetWhereInput;
    private capacity;
    private pool;
    private candidates;
    outsideWhere(c: CampaignRow): Prisma.PostTargetWhereInput | null;
    private publications;
    private progress;
    private names;
    private checkScope;
    private reachable;
    private shape;
    private periodName;
    private log;
}
export type DayPlan = {
    campaigns: Array<{
        id: string;
        name: string;
        closed: string | null;
        ownerId: string | null;
        ownerIsAdmin: boolean;
        priority?: number;
        managed: boolean;
        profileIds: string[];
        teamToday: string | null;
        max: number | null;
        used: Map<string, number>;
        standby?: string[];
        where: Prisma.PostTargetWhereInput;
        outside?: Prisma.PostTargetWhereInput | null;
    }>;
};
export {};
