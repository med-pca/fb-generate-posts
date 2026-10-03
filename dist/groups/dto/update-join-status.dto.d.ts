import { JoinStatus } from '@prisma/client';
export declare class UpdateJoinStatusDto {
    joinStatus: JoinStatus;
    error?: string;
}
export declare class SetJoinStatusDto {
    joinStatus: JoinStatus;
}
