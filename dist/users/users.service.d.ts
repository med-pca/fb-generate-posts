import { User } from '@prisma/client';
import { CurrentUser } from '../auth/current-user';
import { PrismaService } from '../prisma/prisma.service';
import { SessionService } from '../auth/session.service';
import { CreateUserDto, UpdateUserDto } from './dto/user.dto';
export declare function publicUser(user: User): {
    id: string;
    username: string;
    role: import("@prisma/client").$Enums.Role;
    status: import("@prisma/client").$Enums.RecordStatus;
    hasNstApiKey: boolean;
    nstApiKeyHint: string | null;
    createdAt: Date;
};
export declare class UsersService {
    private readonly prisma;
    private readonly sessions;
    constructor(prisma: PrismaService, sessions: SessionService);
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
    me(acting: CurrentUser): Promise<{
        id: string;
        username: string;
        role: import("@prisma/client").$Enums.Role;
        status: import("@prisma/client").$Enums.RecordStatus;
        hasNstApiKey: boolean;
        nstApiKeyHint: string | null;
        createdAt: Date;
    }>;
    setOwnNstKey(acting: CurrentUser, raw: string): Promise<{
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
    private assertAnotherAdminRemains;
    owned(id: string): Promise<{
        profiles: number;
        groups: number;
        sites: number;
        ingests: number;
    }>;
    private load;
}
