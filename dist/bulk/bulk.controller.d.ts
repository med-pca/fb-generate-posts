import type { CurrentUser } from '../auth/current-user';
import { BulkLinkDto, BulkMembershipDto, BulkShareDto, OptionsQueryDto } from './bulk.dto';
import { BulkService } from './bulk.service';
export declare class BulkController {
    private readonly bulk;
    constructor(bulk: BulkService);
    groups(query: OptionsQueryDto, acting: CurrentUser): Promise<{
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
    profiles(query: OptionsQueryDto, acting: CurrentUser): import("@prisma/client").Prisma.PrismaPromise<{
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
    link(dto: BulkLinkDto, acting: CurrentUser): Promise<{
        action: string;
        profiles: number;
        groups: number;
        created: number;
        reactivated: number;
        already: number;
        removed: number;
        ignored: number;
    }>;
    memberships(dto: BulkMembershipDto, acting: CurrentUser): Promise<{
        created: number;
        reactivated: number;
        updated: number;
        notLinked: number;
    }>;
    share(dto: BulkShareDto, acting: CurrentUser): Promise<{
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
}
