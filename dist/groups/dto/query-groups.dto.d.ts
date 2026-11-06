import { PaginationDto } from '../../common/dto/pagination.dto';
export declare class QueryGroupsDto extends PaginationDto {
    search?: string;
    categoryId?: string;
    status?: 'ACTIVE' | 'INACTIVE';
    language?: string;
    profileId?: string;
    join?: 'joined' | 'none' | 'pending';
    stock?: 'with' | 'none';
    sort?: 'recent' | 'name' | 'priority';
}
