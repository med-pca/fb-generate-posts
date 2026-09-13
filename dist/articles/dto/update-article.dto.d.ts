import { RecordStatus } from '@prisma/client';
export declare class UpdateArticleDto {
    status?: RecordStatus;
    title?: string;
    excerpt?: string;
    articleUrl?: string;
    coverImageUrl?: string;
}
