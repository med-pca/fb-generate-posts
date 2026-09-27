import type { CurrentUser } from '../auth/current-user';
import { CreateGroupDto } from './dto/create-group.dto';
import { GroupsService } from './groups.service';
import { UpdateGroupDto } from './dto/update-group.dto';
import { PaginationDto } from '../common/dto/pagination.dto';
export declare class GroupsController {
    private readonly groups;
    constructor(groups: GroupsService);
    create(profileId: string, dto: CreateGroupDto, acting: CurrentUser): Promise<{
        profiles: {
            id: string;
            status: import("@prisma/client").$Enums.RecordStatus;
            createdAt: Date;
            updatedAt: Date;
            profileId: string;
            groupId: string;
            joinStatus: import("@prisma/client").$Enums.JoinStatus;
            joinCheckedAt: Date | null;
            joinError: string | null;
        }[];
    } & {
        name: string;
        id: string;
        status: import("@prisma/client").$Enums.RecordStatus;
        createdAt: Date;
        updatedAt: Date;
        ownerId: string | null;
        externalId: string | null;
        url: string;
    }>;
    findAll(profileId: string, acting: CurrentUser): Promise<{
        name: string;
        id: string;
        status: import("@prisma/client").$Enums.RecordStatus;
        createdAt: Date;
        updatedAt: Date;
        ownerId: string | null;
        externalId: string | null;
        url: string;
    }[]>;
    link(profileId: string, groupId: string, acting: CurrentUser): Promise<{
        profile: {
            name: string;
            id: string;
            status: import("@prisma/client").$Enums.RecordStatus;
            createdAt: Date;
            updatedAt: Date;
            ownerId: string | null;
            externalId: string | null;
            defaultImageUrl: string | null;
            minPostsPerJob: number;
            maxPostsPerJob: number;
            minimumAvailable: number | null;
            minimumAvailablePerGroup: number | null;
        };
        group: {
            name: string;
            id: string;
            status: import("@prisma/client").$Enums.RecordStatus;
            createdAt: Date;
            updatedAt: Date;
            ownerId: string | null;
            externalId: string | null;
            url: string;
        };
    } & {
        id: string;
        status: import("@prisma/client").$Enums.RecordStatus;
        createdAt: Date;
        updatedAt: Date;
        profileId: string;
        groupId: string;
        joinStatus: import("@prisma/client").$Enums.JoinStatus;
        joinCheckedAt: Date | null;
        joinError: string | null;
    }>;
    unlink(profileId: string, groupId: string, acting: CurrentUser): Promise<{
        id: string;
        status: import("@prisma/client").$Enums.RecordStatus;
        createdAt: Date;
        updatedAt: Date;
        profileId: string;
        groupId: string;
        joinStatus: import("@prisma/client").$Enums.JoinStatus;
        joinCheckedAt: Date | null;
        joinError: string | null;
    }>;
    update(groupId: string, dto: UpdateGroupDto, acting: CurrentUser): Promise<{
        name: string;
        id: string;
        status: import("@prisma/client").$Enums.RecordStatus;
        createdAt: Date;
        updatedAt: Date;
        ownerId: string | null;
        externalId: string | null;
        url: string;
    }>;
}
export declare class GroupsCatalogController {
    private readonly groups;
    constructor(groups: GroupsService);
    findAll(pagination: PaginationDto, acting: CurrentUser): Promise<{
        data: {
            availablePosts: number;
            profiles: ({
                profile: {
                    name: string;
                    id: string;
                    status: import("@prisma/client").$Enums.RecordStatus;
                    createdAt: Date;
                    updatedAt: Date;
                    ownerId: string | null;
                    externalId: string | null;
                    defaultImageUrl: string | null;
                    minPostsPerJob: number;
                    maxPostsPerJob: number;
                    minimumAvailable: number | null;
                    minimumAvailablePerGroup: number | null;
                };
            } & {
                id: string;
                status: import("@prisma/client").$Enums.RecordStatus;
                createdAt: Date;
                updatedAt: Date;
                profileId: string;
                groupId: string;
                joinStatus: import("@prisma/client").$Enums.JoinStatus;
                joinCheckedAt: Date | null;
                joinError: string | null;
            })[];
            _count: {
                targets: number;
            };
            name: string;
            id: string;
            status: import("@prisma/client").$Enums.RecordStatus;
            createdAt: Date;
            updatedAt: Date;
            ownerId: string | null;
            externalId: string | null;
            url: string;
        }[];
        meta: {
            page: number;
            limit: number;
            total: number;
            pages: number;
        };
    }>;
    remove(id: string, acting: CurrentUser): Promise<{
        name: string;
        id: string;
        status: import("@prisma/client").$Enums.RecordStatus;
        createdAt: Date;
        updatedAt: Date;
        ownerId: string | null;
        externalId: string | null;
        url: string;
    }>;
    update(id: string, dto: UpdateGroupDto, acting: CurrentUser): Promise<{
        name: string;
        id: string;
        status: import("@prisma/client").$Enums.RecordStatus;
        createdAt: Date;
        updatedAt: Date;
        ownerId: string | null;
        externalId: string | null;
        url: string;
    }>;
}
