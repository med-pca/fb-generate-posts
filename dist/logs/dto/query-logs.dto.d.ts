import { LogLevel } from '@prisma/client';
import { PaginationDto } from '../../common/dto/pagination.dto';
export declare class QueryLogsDto extends PaginationDto {
    level?: LogLevel;
    eventType?: string;
    profileId?: string;
    groupId?: string;
    postId?: string;
    jobId?: string;
    search?: string;
    since?: string;
    until?: string;
    onlyIncidents: boolean;
}
