import { RecordStatus, Role } from '@prisma/client';
export declare class CreateUserDto {
    username: string;
    password: string;
    role?: Role;
}
declare const UpdateUserDto_base: import("@nestjs/common").Type<Partial<CreateUserDto>>;
export declare class UpdateUserDto extends UpdateUserDto_base {
    status?: RecordStatus;
}
export {};
