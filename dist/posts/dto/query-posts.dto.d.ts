import { PostStatus, SourceType } from '@prisma/client';
import { PaginationDto } from '../../common/dto/pagination.dto';
export declare class QueryPostsDto extends PaginationDto {
    profileId?: string;
    groupId?: string;
    articleId?: string;
    status?: PostStatus;
    sourceType?: SourceType;
    search?: string;
}
