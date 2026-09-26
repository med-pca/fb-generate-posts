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
export type RewriteInput = {
    source: SourceArticle;
    fbCaption?: string | null;
    language: string;
};
export declare function normalizeSlug(value: string, fallback: string): string;
export declare function cleanCaption(value: string): string;
export declare function sanitizeArticleHtml(html: string): string;
export declare function normalizeHashtags(values: string[]): string[];
export declare function normalizeGenerated(raw: GeneratedArticle, fallbackTitle: string): GeneratedArticle;
export declare class RewriterService {
    private readonly llm;
    private readonly logger;
    constructor(llm: LlmService);
    rewrite(input: RewriteInput): Promise<GeneratedArticle>;
    private prompt;
}
