import { PrismaService } from '../prisma/prisma.service';
import type { CurrentUser } from '../auth/current-user';
import type { PriorityMove } from './dto/queue.dto';
export declare function nextPriority(current: number, top: number, move?: PriorityMove, value?: number): number;
export declare class PrioritiesService {
    private readonly prisma;
    constructor(prisma: PrismaService);
    overview(acting: CurrentUser | null): Promise<{
        settings: {
            rateLimitPauseDays: number;
            imageProvider: string;
        };
        groups: {
            waiting: number;
            publishedToday: number;
            category: {
                id: string;
                name: string;
            } | null;
            language: string | null;
            id: string;
            name: string;
            priority: number;
            url: string;
            dailyCap: number | null;
            hoursStart: number | null;
            hoursEnd: number | null;
        }[];
        articles: {
            site: string;
            source: undefined;
            waiting: number;
            id: string;
            title: string;
            priority: number;
            articleUrl: string;
            coverImageUrl: string | null;
            publishedAt: Date | null;
        }[];
    }>;
    setGroup(id: string, dto: {
        move?: PriorityMove;
        priority?: number;
    }, acting: CurrentUser | null): Promise<{
        id: string;
        priority: number;
    }>;
    setGroupLimits(id: string, dto: {
        dailyCap?: number | null;
        hoursStart?: number | null;
        hoursEnd?: number | null;
    }, acting: CurrentUser | null): Promise<{
        hoursStart: number;
        hoursEnd: number;
        dailyCap: number | null;
        id: string;
    } | {
        hoursStart: null;
        hoursEnd: null;
        dailyCap: number | null;
        id: string;
    }>;
    setArticle(id: string, dto: {
        move?: PriorityMove;
        priority?: number;
    }, acting: CurrentUser | null): Promise<{
        id: string;
        priority: number;
        posts: number;
    }>;
    private log;
}
