import { ConfigService } from '@nestjs/config';
export type Headline = {
    title: string;
    summary: string;
    source: string;
    publishedAt: string | null;
};
export declare function parseFeed(xml: string, source: string): Headline[];
export declare class NewsService {
    private readonly config;
    private readonly logger;
    private cache;
    constructor(config: ConfigService);
    feeds(): string[];
    headlines(now?: number): Promise<Headline[]>;
}
export declare function headlinesText(headlines: Headline[]): string;
