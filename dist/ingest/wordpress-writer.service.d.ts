import { ConfigService } from '@nestjs/config';
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
export declare class WordpressWriterService {
    private readonly config;
    constructor(config: ConfigService);
    deposit(input: DepositInput): Promise<WordpressDeposit>;
    private fetchImage;
    private filename;
}
