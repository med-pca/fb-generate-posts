import { RecordStatus } from '@prisma/client';
export declare class CreateProfileDto {
    status?: RecordStatus;
    name: string;
    externalId?: string;
    defaultImageUrl?: string;
    facebookProfileUrl?: string | null;
    minPostsPerJob: number;
    maxPostsPerJob: number;
    minimumAvailable?: number | null;
    minimumAvailablePerGroup?: number | null;
}
