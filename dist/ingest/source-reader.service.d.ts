export type SourceArticle = {
    url: string;
    title: string;
    text: string;
    excerpt: string | null;
    leadImageUrl: string | null;
    siteName: string | null;
};
export declare function normalizeText(value: string): string;
export declare class SourceReaderService {
    read(sourceUrl: string): Promise<SourceArticle>;
    private fetchHtml;
    private get;
    private readCapped;
    private decode;
    private textFromHtml;
    private cleanTitle;
    private meta;
    private leadImage;
}
