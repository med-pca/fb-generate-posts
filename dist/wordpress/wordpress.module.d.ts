import { WordpressArticleDto } from './wordpress.dto';
import { WordpressService } from './wordpress.service';
export declare class WordpressController {
    private readonly wordpress;
    constructor(wordpress: WordpressService);
    publish(dto: WordpressArticleDto): Promise<{
        articleId: string;
        duplicate: boolean;
        updated: boolean;
        generated: number;
        synchronized: number;
        skipped: number;
    }>;
}
export declare class WordpressModule {
}
