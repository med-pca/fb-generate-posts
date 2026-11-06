import { PrismaService } from '../prisma/prisma.service';
import type { CurrentUser } from '../auth/current-user';
export type AnalyticsFilters = {
    from?: string;
    to?: string;
    siteId?: string;
    campaignId?: string;
    categoryId?: string;
    groupId?: string;
    profileId?: string;
    articleId?: string;
    tz?: string;
};
export declare class AnalyticsService {
    private readonly prisma;
    constructor(prisma: PrismaService);
    report(f: AnalyticsFilters, acting: CurrentUser | null): Promise<{
        range: {
            from: Date;
            to: Date;
            timezone: string;
            bucket: "hour" | "day";
        };
        kpis: {
            published: number;
            failed: number;
            failureRate: number;
            perDay: number;
            articles: number;
            groups: number;
            profiles: number;
            linked: number;
            verified: number;
            previous: number;
            delta: number | null;
        };
        series: {
            at: number;
            published: number;
            failed: number;
        }[];
        hours: number[];
        bySite: {
            failureRate: number;
            published: number;
            failed: number;
            id: string;
            name: string;
        }[];
        byArticle: {
            failureRate: number;
            published: number;
            failed: number;
            id: string;
            name: string;
        }[];
        byProfile: {
            failureRate: number;
            published: number;
            failed: number;
            id: string;
            name: string;
        }[];
        byGroup: {
            failureRate: number;
            published: number;
            failed: number;
            id: string;
            name: string;
        }[];
        failureReasons: {
            reason: string;
            count: number;
        }[];
    }>;
    csv(f: AnalyticsFilters, acting: CurrentUser | null): Promise<string>;
    private timezone;
    private range;
    private where;
    private publishedWhere;
    private published;
    private failed;
    private names;
}
