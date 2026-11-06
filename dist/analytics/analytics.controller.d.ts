import type { FastifyReply } from 'fastify';
import type { CurrentUser } from '../auth/current-user';
import { AnalyticsService } from './analytics.service';
export declare class AnalyticsQueryDto {
    from?: string;
    to?: string;
    siteId?: string;
    campaignId?: string;
    categoryId?: string;
    groupId?: string;
    profileId?: string;
    articleId?: string;
    tz?: string;
}
export declare class AnalyticsController {
    private readonly analytics;
    constructor(analytics: AnalyticsService);
    report(q: AnalyticsQueryDto, acting: CurrentUser): Promise<{
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
    csv(q: AnalyticsQueryDto, acting: CurrentUser, reply: FastifyReply): Promise<never>;
}
