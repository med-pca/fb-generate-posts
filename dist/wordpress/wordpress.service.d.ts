import { PrismaService } from '../prisma/prisma.service';
import { ArticlesService } from '../articles/articles.service';
import { WordpressArticleDto } from './wordpress.dto';
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
    };
};
export declare class WordpressService {
    private readonly prisma;
    private readonly articles;
    constructor(prisma: PrismaService, articles: ArticlesService);
    publish(dto: WordpressArticleDto): Promise<{
        articleId: string;
        duplicate: boolean;
        updated: boolean;
        generated: number;
        synchronized: number;
        skipped: number;
    }>;
    private synchronize;
    private hasChanges;
    private syncablePosts;
}
