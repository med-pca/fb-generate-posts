import { PaginationDto } from '../../common/dto/pagination.dto';
export declare class QueryProfilesDto extends PaginationDto {
    search?: string;
    status?: 'ACTIVE' | 'INACTIVE';
    health?: 'good' | 'watch' | 'bad' | 'new' | 'deactivate';
    activity?: 'running' | 'off';
    categoryId?: string;
    sort?: 'recent' | 'name' | 'score' | 'failures' | 'published';
}
export declare class DeactivateProfileDto {
    transferTo?: string | null;
}
