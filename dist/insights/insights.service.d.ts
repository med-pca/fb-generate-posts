import { PrismaService } from '../prisma/prisma.service';
import type { CurrentUser } from '../auth/current-user';
export declare function startOfLocalDay(now: Date, timeZone: string): Date;
export declare class InsightsService {
    private readonly prisma;
    constructor(prisma: PrismaService);
    private settings;
    private upcomingWhere;
    counters(acting: CurrentUser | null, now?: Date): Promise<{
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
    profileStats(acting: CurrentUser | null, now?: Date): Promise<Record<string, unknown>>;
    objective(acting: CurrentUser | null, now?: Date): Promise<{
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
