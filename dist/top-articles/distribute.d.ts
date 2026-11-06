export type RadarArticle = {
    url: string;
    title: string;
    image: string | null;
    domain: string;
    views: number;
    viral: boolean;
};
export type PastPick = {
    userId: string;
    url: string;
    day: string;
};
export declare const PER_USER = 10;
export declare const OTHERS_COOLDOWN_DAYS = 7;
export declare function distribute(pool: RadarArticle[], userIds: string[], past: PastPick[], today: string, taken?: Set<string>, perUser?: number | Map<string, number>): Map<string, RadarArticle[]>;
