import type { CurrentUser } from '../auth/current-user';
import { AccessService } from './access.service';
import { GrantAccessDto } from './dto/grant-access.dto';
export declare class GroupAccessController {
    private readonly access;
    constructor(access: AccessService);
    list(id: string, acting: CurrentUser): Promise<{
        userId: string;
        username: string;
        role: import("@prisma/client").$Enums.Role;
        grantedAt: Date;
    }[]>;
    grant(id: string, dto: GrantAccessDto, acting: CurrentUser): Promise<{
        granted: boolean;
        userId: string;
        username: string;
    }>;
    revoke(id: string, userId: string, acting: CurrentUser): Promise<{
        revoked: boolean;
        userId: string;
    }>;
}
export declare class SiteAccessController {
    private readonly access;
    constructor(access: AccessService);
    list(id: string, acting: CurrentUser): Promise<{
        userId: string;
        username: string;
        role: import("@prisma/client").$Enums.Role;
        grantedAt: Date;
    }[]>;
    grant(id: string, dto: GrantAccessDto, acting: CurrentUser): Promise<{
        granted: boolean;
        userId: string;
        username: string;
    }>;
    revoke(id: string, userId: string, acting: CurrentUser): Promise<{
        revoked: boolean;
        userId: string;
    }>;
}
