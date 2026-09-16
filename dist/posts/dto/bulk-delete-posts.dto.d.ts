import { PostStatus, SourceType } from '@prisma/client';
export declare class BulkDeletePostsDto {
    ids?: string[];
    profileId?: string;
    groupId?: string;
    articleId?: string;
    status?: PostStatus;
    sourceType?: SourceType;
    dryRun: boolean;
    force: boolean;
}
