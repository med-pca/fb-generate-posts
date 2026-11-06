import { Prisma, JoinStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { CurrentUser } from '../auth/current-user';
import { AccessService } from '../access/access.service';
export declare class BulkService {
    private readonly prisma;
    private readonly access;
    constructor(prisma: PrismaService, access: AccessService);
    groupOptions(query: {
        search?: string;
        categoryId?: string;
    }, acting: CurrentUser | null): Promise<{
        category: {
            id: string;
            name: string;
        } | null;
        id: string;
        name: string;
        status: import("@prisma/client").$Enums.RecordStatus;
        ownerId: string | null;
        url: string;
        _count: {
            profiles: number;
        };
    }[]>;
    profileOptions(query: {
        search?: string;
    }, acting: CurrentUser | null): Prisma.PrismaPromise<{
        id: string;
        createdAt: Date;
        name: string;
        status: import("@prisma/client").$Enums.RecordStatus;
        externalId: string | null;
        facebookUserId: string | null;
        facebookName: string | null;
        facebookProfileUrl: string | null;
        _count: {
            profileGroups: number;
        };
    }[]>;
    link(input: {
        profileIds: string[];
        groupIds: string[];
        action: 'link' | 'unlink';
    }, acting: CurrentUser | null): Promise<{
        action: string;
        profiles: number;
        groups: number;
        created: number;
        reactivated: number;
        already: number;
        removed: number;
        ignored: number;
    }>;
    memberships(input: {
        profileIds: string[];
        groupIds: string[];
        joinStatus?: JoinStatus;
        preApproved?: boolean;
        linkMissing?: boolean;
    }, acting: CurrentUser | null, now?: Date): Promise<{
        created: number;
        reactivated: number;
        updated: number;
        notLinked: number;
    }>;
    share(input: {
        kind: 'groups' | 'sites';
        ids: string[];
        userIds: string[];
        action: 'grant' | 'revoke';
    }, acting: CurrentUser | null): Promise<{
        done: number;
        items: number;
        users: number;
        ignored: number;
        failures: {
            item: string;
            userId: string;
            reason: string;
        }[];
    }>;
    private log;
}
