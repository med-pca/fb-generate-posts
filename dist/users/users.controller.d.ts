import type { CurrentUser } from '../auth/current-user';
import { CreateUserDto, UpdateNstKeyDto, UpdateUserDto } from './dto/user.dto';
import { UsersService } from './users.service';
export declare class UsersController {
    private readonly users;
    constructor(users: UsersService);
    findAll(): Promise<{
        id: string;
        username: string;
        role: import("@prisma/client").$Enums.Role;
        status: import("@prisma/client").$Enums.RecordStatus;
        hasNstApiKey: boolean;
        nstApiKeyHint: string | null;
        createdAt: Date;
    }[]>;
    create(dto: CreateUserDto): Promise<{
        automationKey: string;
        id: string;
        username: string;
        role: import("@prisma/client").$Enums.Role;
        status: import("@prisma/client").$Enums.RecordStatus;
        hasNstApiKey: boolean;
        nstApiKeyHint: string | null;
        createdAt: Date;
    }>;
    update(id: string, dto: UpdateUserDto, acting: CurrentUser): Promise<{
        id: string;
        username: string;
        role: import("@prisma/client").$Enums.Role;
        status: import("@prisma/client").$Enums.RecordStatus;
        hasNstApiKey: boolean;
        nstApiKeyHint: string | null;
        createdAt: Date;
    }>;
    rotateKey(id: string): Promise<{
        automationKey: string;
        id: string;
        username: string;
        role: import("@prisma/client").$Enums.Role;
        status: import("@prisma/client").$Enums.RecordStatus;
        hasNstApiKey: boolean;
        nstApiKeyHint: string | null;
        createdAt: Date;
    }>;
    remove(id: string, acting: CurrentUser): Promise<{
        deleted: boolean;
        released: {
            profiles: number;
            groups: number;
            sites: number;
            ingests: number;
        };
    }>;
}
export declare class MeController {
    private readonly users;
    constructor(users: UsersService);
    me(acting: CurrentUser): Promise<{
        id: string;
        username: string;
        role: import("@prisma/client").$Enums.Role;
        status: import("@prisma/client").$Enums.RecordStatus;
        hasNstApiKey: boolean;
        nstApiKeyHint: string | null;
        createdAt: Date;
    }>;
    setNstKey(acting: CurrentUser, dto: UpdateNstKeyDto): Promise<{
        id: string;
        username: string;
        role: import("@prisma/client").$Enums.Role;
        status: import("@prisma/client").$Enums.RecordStatus;
        hasNstApiKey: boolean;
        nstApiKeyHint: string | null;
        createdAt: Date;
    }>;
}
