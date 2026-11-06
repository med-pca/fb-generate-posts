import { PrismaService } from '../prisma/prisma.service';
import { ArticlesService } from '../articles/articles.service';
import { WordpressArticleDto } from './wordpress.dto';
export declare function groupPostExternalId(articleId: string, groupId: string): string;
export declare function wordpressCaption(dto: WordpressArticleDto): string;
export declare function wordpressArticleFields(dto: WordpressArticleDto): {
    title: string;
    articleUrl: string;
    coverImageUrl: string | null;
    excerpt: string | null;
    publishedAt: Date;
    captions: {
        text: string;
        angle: string;
    }[];
    rawData: {
        siteUrl: string;
        siteName: string;
        postId: string;
        title: string;
        content: string;
        excerpt?: string;
        articleUrl: string;
        imageUrl?: string;
        publishedAt: string;
        ingestRef?: string;
        copyRef?: string;
    };
};
export declare function facebookCaption(text: string): string;
export declare function ingestArticleFields(fields: ReturnType<typeof wordpressArticleFields>, ingest: {
    fbCaption?: string | null;
    generated?: {
        caption?: string;
        hashtags?: string[];
    } | null;
    mode?: string | null;
} | null): {
    title: string;
    articleUrl: string;
    coverImageUrl: string | null;
    excerpt: string | null;
    publishedAt: Date;
    captions: {
        text: string;
        angle: string;
    }[];
    rawData: {
        siteUrl: string;
        siteName: string;
        postId: string;
        title: string;
        content: string;
        excerpt?: string;
        articleUrl: string;
        imageUrl?: string;
        publishedAt: string;
        ingestRef?: string;
        copyRef?: string;
    };
} | {
    captions: {
        text: string;
        angle: string;
    }[];
    hashtags: string[];
    title: string;
    articleUrl: string;
    coverImageUrl: string | null;
    excerpt: string | null;
    publishedAt: Date;
    rawData: {
        siteUrl: string;
        siteName: string;
        postId: string;
        title: string;
        content: string;
        excerpt?: string;
        articleUrl: string;
        imageUrl?: string;
        publishedAt: string;
        ingestRef?: string;
        copyRef?: string;
    };
};
export declare class WordpressService {
    private readonly prisma;
    private readonly articles;
    private readonly logger;
    constructor(prisma: PrismaService, articles: ArticlesService);
    publish(dto: WordpressArticleDto): Promise<{
        articleId: string;
        duplicate: boolean;
        updated: boolean;
        generated: number;
        groups: number;
        noPost: "no_group" | "no_category" | null;
        synchronized: number;
        skipped: number;
    }>;
    private ignoreIfPaused;
    private trace;
    private receive;
    private moveCopiedPosts;
    private deliveryState;
    private audience;
    private ingestFor;
    private ingestByArticle;
    attachCapture(ingestId: string): Promise<{
        attached: true;
        articleId: string;
        title: string;
        synchronized: number;
    } | {
        attached: false;
    }>;
    private closeIngest;
    private synchronize;
    private hasChanges;
    private syncablePosts;
}
