import { PrismaService } from '../prisma/prisma.service';
import type { CurrentUser } from '../auth/current-user';
export declare const RESET_CONFIRMATION = "EFFACER";
export type ResetInput = {
    posts?: boolean;
    articles?: boolean;
    articlePosts?: 'delete' | 'keep';
    unarchive?: boolean;
    confirm?: string;
    dryRun?: boolean;
    force?: boolean;
};
export declare class ResetService {
    private readonly prisma;
    constructor(prisma: PrismaService);
    counts(now?: Date): Promise<{
        posts: number;
        published: number;
        postsFromArticles: number;
        standalonePosts: number;
        articles: number;
        archivedArticles: number;
        jobs: number;
        activeJobs: number;
    }>;
    private plan;
    reset(input: ResetInput, acting: CurrentUser | null, now?: Date): Promise<{
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
