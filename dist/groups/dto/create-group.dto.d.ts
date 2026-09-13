import { RecordStatus } from '@prisma/client';
export declare class CreateGroupDto {
    status?: RecordStatus;
    name: string;
    externalId?: string;
    url: string;
}
