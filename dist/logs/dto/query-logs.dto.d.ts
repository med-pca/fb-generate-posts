import { LogLevel } from '@prisma/client';
import { PaginationDto } from '../../common/dto/pagination.dto';
import type { LogDomain } from '../domains';
export declare class QueryLogsDto extends PaginationDto {
    domain?: LogDomain;
    level?: LogLevel;
    eventType?: string;
    profileId?: string;
    groupId?: string;
    postId?: string;
    jobId?: string;
    postTargetId?: string;
    categoryId?: string;
    facebookUrl?: string;
    withUrl: boolean;
    search?: string;
    since?: string;
    until?: string;
    onlyIncidents: boolean;
}
