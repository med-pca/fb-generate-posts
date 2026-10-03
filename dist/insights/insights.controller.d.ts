import type { CurrentUser } from '../auth/current-user';
import { InsightsService } from './insights.service';
import { ResetService } from './reset.service';
declare class ResetDto {
    posts?: boolean;
    articles?: boolean;
    articlePosts?: 'delete' | 'keep';
    unarchive?: boolean;
    confirm?: string;
    dryRun?: boolean;
    force?: boolean;
}
export declare class InsightsController {
    private readonly insights;
    constructor(insights: InsightsService);
    counters(acting: CurrentUser): Promise<{
        profiles: number;
        groups: number;
        categories: number;
        sites: number;
        sitesAlert: number;
        articles: number;
        posts: number;
        postsFailed: number;
        logErrors: number;
        users: number;
        publishedToday: number;
        dailyTarget: number;
    }>;
    profiles(acting: CurrentUser): Promise<Record<string, unknown>>;
    objective(acting: CurrentUser): Promise<{
        settings: {
            dailyTarget: number;
            objectiveStart: number;
            objectiveEnd: number;
            objectiveTimezone: string;
        };
        serverTime: string;
        dayStart: string;
        pace: import("./objective").Pace;
        hourly: number[];
        stock: {
            publishable: number;
            blocked: number;
            deficit: number;
        };
        articles: {
            today: number;
            needed: number;
            postsPerArticle: number;
        };
        profiles: {
            participating: number;
            atWork: number;
            share: number;
            rows: {
                id: string;
                name: string;
                mode: import("@prisma/client").$Enums.RunnerMode;
                joinedGroups: number;
                publishedToday: number;
                share: number;
                atWork: boolean;
                participating: boolean;
            }[];
        };
        categories: {
            articlesNeeded: number;
            id: string | null;
            name: string;
            groups: number;
            publishableGroups: number;
            publishedToday: number;
            stock: number;
            stockPublishable: number;
        }[];
        groups: {
            id: string;
            name: string;
            category: {
                id: string;
                name: string;
            } | null;
            publishedToday: number;
            stock: number;
            participants: {
                id: string;
                name: string;
            }[];
            pendingJoins: number;
            blocked: string | null;
        }[];
        advice: {
            level: "ok" | "warn" | "error";
            text: string;
        }[];
    }>;
}
export declare class ResetController {
    private readonly resets;
    constructor(resets: ResetService);
    reset(dto: ResetDto, acting: CurrentUser): Promise<{
        plan: {
            posts: number;
            articles: number;
            postsDetached: number;
            articlesUnarchived: number;
        };
        posts: number;
        published: number;
        postsFromArticles: number;
        standalonePosts: number;
        articles: number;
        archivedArticles: number;
        jobs: number;
        activeJobs: number;
        dryRun: boolean;
        deleted?: undefined;
    } | {
        dryRun: boolean;
        deleted: {
            posts: number;
            articles: number;
            postsDetached: number;
            articlesUnarchived: number;
        };
    }>;
}
export {};
