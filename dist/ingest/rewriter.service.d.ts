import { LlmService } from '../llm/llm.service';
import { SourceArticle } from './source-reader.service';
export type GeneratedArticle = {
    title: string;
    slug: string;
    excerpt: string;
    metaDescription: string;
    contentHtml: string;
    caption: string;
    hashtags: string[];
};
export type NewsArticle = GeneratedArticle & {
    titles: string[];
    newsHook: string;
};
export type NewsInput = {
    image: {
        data: string;
        mimeType: string;
    };
    fbCaption?: string | null;
    headlines: string;
    language: string;
};
export type RewriteInput = {
    source: SourceArticle;
    fbCaption?: string | null;
    language: string;
    style?: 'seo' | 'faithful';
};
export declare function normalizeSlug(value: string, fallback: string): string;
export declare function cleanCaption(value: string): string;
export declare function sanitizeArticleHtml(html: string): string;
export declare function normalizeHashtags(values: string[]): string[];
export declare function normalizeGenerated(raw: GeneratedArticle, fallbackTitle: string): GeneratedArticle;
export declare function splitNotes(text: string, size?: number): string[];
export declare function guessLanguage(text: string): string | null;
export declare function writingLanguage(requested: string | null | undefined, declared: string | null | undefined, text: string): string;
export declare class RewriterService {
    private readonly llm;
    private readonly logger;
    constructor(llm: LlmService);
    rewrite(input: RewriteInput): Promise<GeneratedArticle>;
    fromNews(input: NewsInput): Promise<NewsArticle>;
    readImageText(input: {
        image: {
            data: string;
            mimeType: string;
        };
        language: string;
    }): Promise<{
        hasText: boolean;
        texts: {
            original: string;
            translated: string;
        }[];
        scene: string;
    }>;
    engagementCaption(input: {
        language: string;
        scene: string;
        texts: string[];
        fbCaption?: string | null;
    }): Promise<{
        title: string;
        caption: string;
        hashtags: string[];
        provider: string;
    }>;
    private rewriteLong;
    private prompt;
}
