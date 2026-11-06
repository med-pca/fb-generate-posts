import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { GeneratedArticle } from './rewriter.service';
export type WordpressDeposit = {
    postId: string;
    permalink: string;
    imageWarning: string | null;
};
export type DepositInput = {
    siteUrl: string;
    ingestRef: string;
    article: GeneratedArticle;
    imageUrl: string | null;
    language?: string | null;
    apiKey?: string | null;
};
export type PulledArticle = {
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
export declare function plainText(html: string | undefined | null, max?: number): string;
export declare class WordpressWriterService {
    private readonly config;
    private readonly prisma?;
    constructor(config: ConfigService, prisma?: PrismaService | undefined);
    private splitting;
    deposit(input: DepositInput): Promise<WordpressDeposit>;
    fetchArticle(input: {
        siteUrl: string;
        siteName: string;
        apiKey?: string | null;
        postId?: string | null;
        slug?: string | null;
    }): Promise<PulledArticle>;
    loadImage(imageUrl: string): Promise<{
        data: string;
        mimeType: string;
        filename: string;
    }>;
    private fetchImage;
    private filename;
}
