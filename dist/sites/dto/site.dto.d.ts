import { RecordStatus } from '@prisma/client';
export declare class CreateSiteDto {
    name: string;
    originUrl: string;
    depositKey?: string;
    status?: RecordStatus;
}
declare const UpdateSiteDto_base: import("@nestjs/common").Type<Partial<CreateSiteDto>>;
export declare class UpdateSiteDto extends UpdateSiteDto_base {
    ownerId?: string;
}
export {};
