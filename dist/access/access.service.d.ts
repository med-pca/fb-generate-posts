import type { CurrentUser } from '../auth/current-user';
import { PrismaService } from '../prisma/prisma.service';
export declare class AccessService {
    private readonly prisma;
    constructor(prisma: PrismaService);
    listGroupAccess(groupId: string, acting: CurrentUser | null): Promise<{
        userId: string;
        username: string;
        role: import("@prisma/client").$Enums.Role;
        grantedAt: Date;
    }[]>;
    listSiteAccess(sourceId: string, acting: CurrentUser | null): Promise<{
        userId: string;
        username: string;
        role: import("@prisma/client").$Enums.Role;
        grantedAt: Date;
    }[]>;
    grantGroup(groupId: string, userId: string, acting: CurrentUser | null): Promise<{
        granted: boolean;
        userId: string;
        username: string;
    }>;
    grantSite(sourceId: string, userId: string, acting: CurrentUser | null): Promise<{
        granted: boolean;
        userId: string;
        username: string;
    }>;
    revokeGroup(groupId: string, userId: string, acting: CurrentUser | null): Promise<{
        revoked: boolean;
        userId: string;
    }>;
    revokeSite(sourceId: string, userId: string, acting: CurrentUser | null): Promise<{
        revoked: boolean;
        userId: string;
    }>;
    private list;
    private grant;
    private revoke;
    private assertOwner;
}
