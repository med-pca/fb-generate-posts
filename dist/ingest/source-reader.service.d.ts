export type SourceArticle = {
    url: string;
    title: string;
    text: string;
    excerpt: string | null;
    leadImageUrl: string | null;
    siteName: string | null;
    language: string | null;
    pageUrls?: string[];
};
export declare function pageOf(raw: string | URL): {
    base: string;
    page: number;
};
export declare function findNextPage(document: Document, currentUrl: string, visited: Set<string>): string | null;
export declare function normalizeText(value: string): string;
export declare class SourceReaderService {
    read(sourceUrl: string): Promise<SourceArticle>;
    private readPage;
    private fetchHtml;
    private get;
    private readCapped;
    private decode;
    private textFromHtml;
    private cleanTitle;
    private language;
    private meta;
    private leadImage;
}
