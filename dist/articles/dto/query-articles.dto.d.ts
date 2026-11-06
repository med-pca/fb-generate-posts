import { PaginationDto } from '../../common/dto/pagination.dto';
export declare class QueryArticlesDto extends PaginationDto {
    search?: string;
    siteId?: string;
    categoryId?: string;
    status?: 'ACTIVE' | 'INACTIVE';
    archived?: 'yes' | 'no';
    diffusion?: 'queued' | 'published' | 'idle' | 'failed' | 'never';
    from?: string;
    to?: string;
    sort?: 'recent' | 'oldest' | 'title' | 'priority' | 'published';
}
