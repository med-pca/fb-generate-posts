export declare const NEXT_PAGE = "<!--nextpage-->";
export declare function continueLabel(language: string | null | undefined): string;
export declare function paginateHtml(html: string, pages: number, language?: string | null): string;
export declare function paginateByParagraphs(html: string, perPage: number, minWords: number, language?: string | null, maxPages?: number): string;
