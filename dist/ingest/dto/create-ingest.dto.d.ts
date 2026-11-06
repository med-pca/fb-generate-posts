export declare class CreateIngestDto {
    facebookUrl: string;
    mode?: 'rewrite' | 'news' | 'engagement';
    targetLanguage?: string;
    translateImage?: boolean;
    targetCategoryId?: string;
    sourceUrl?: string;
    siteUrl?: string;
    language: string;
    profileIds?: string[];
    groupIds?: string[];
}
