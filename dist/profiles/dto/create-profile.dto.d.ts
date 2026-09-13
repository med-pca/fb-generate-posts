import { RecordStatus } from '@prisma/client';
export declare class CreateProfileDto {
    status?: RecordStatus;
    name: string;
    externalId?: string;
    defaultImageUrl?: string;
    minPostsPerJob: number;
    maxPostsPerJob: number;
}
