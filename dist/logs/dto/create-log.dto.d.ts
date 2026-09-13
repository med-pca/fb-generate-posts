import { LogLevel } from '@prisma/client';
export declare class CreateLogDto {
    profileId?: string;
    groupId?: string;
    postId?: string;
    jobId?: string;
    eventType: string;
    level: LogLevel;
    message: string;
    metadata?: Record<string, unknown>;
}
