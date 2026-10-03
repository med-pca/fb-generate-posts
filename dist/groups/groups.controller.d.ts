import type { CurrentUser } from '../auth/current-user';
import { CreateGroupDto } from './dto/create-group.dto';
import { GroupsService } from './groups.service';
import { UpdateGroupDto } from './dto/update-group.dto';
import { SetJoinStatusDto } from './dto/update-join-status.dto';
import { PaginationDto } from '../common/dto/pagination.dto';
export declare class GroupsController {
    private readonly groups;
    constructor(groups: GroupsService);
    create(profileId: string, dto: CreateGroupDto, acting: CurrentUser): Promise<{
        profiles: {
            id: string;
            createdAt: Date;
            status: import("@prisma/client").$Enums.RecordStatus;
            updatedAt: Date;
            profileId: string;
            groupId: string;
            joinStatus: import("@prisma/client").$Enums.JoinStatus;
            joinCheckedAt: Date | null;
            joinError: string | null;
            memberApprovedAt: Date | null;
            preApprovedAt: Date | null;
            memberActionError: string | null;
            memberActionAt: Date | null;
            memberClaimedUntil: Date | null;
            memberAttempts: number;
        }[];
    } & {
        id: string;
        createdAt: Date;
        name: string;
        status: import("@prisma/client").$Enums.RecordStatus;
        updatedAt: Date;
        ownerId: string | null;
        externalId: string | null;
        categoryId: string | null;
        url: string;
    }>;
    findAll(profileId: string, acting: CurrentUser): Promise<{
        id: string;
        createdAt: Date;
        name: string;
        status: import("@prisma/client").$Enums.RecordStatus;
        updatedAt: Date;
        ownerId: string | null;
        externalId: string | null;
        categoryId: string | null;
        url: string;
    }[]>;
    link(profileId: string, groupId: string, acting: CurrentUser): Promise<{
        profile: {
            id: string;
            createdAt: Date;
            name: string;
            status: import("@prisma/client").$Enums.RecordStatus;
            updatedAt: Date;
            ownerId: string | null;
            externalId: string | null;
            defaultImageUrl: string | null;
            minPostsPerJob: number;
            maxPostsPerJob: number;
            minimumAvailable: number | null;
            minimumAvailablePerGroup: number | null;
            isModerator: boolean;
            facebookUserId: string | null;
            facebookName: string | null;
            facebookSeenAt: Date | null;
        };
        group: {
            id: string;
            createdAt: Date;
            name: string;
            status: import("@prisma/client").$Enums.RecordStatus;
            updatedAt: Date;
            ownerId: string | null;
            externalId: string | null;
            categoryId: string | null;
            url: string;
        };
    } & {
        id: string;
        createdAt: Date;
        status: import("@prisma/client").$Enums.RecordStatus;
        updatedAt: Date;
        profileId: string;
        groupId: string;
        joinStatus: import("@prisma/client").$Enums.JoinStatus;
        joinCheckedAt: Date | null;
        joinError: string | null;
        memberApprovedAt: Date | null;
        preApprovedAt: Date | null;
        memberActionError: string | null;
        memberActionAt: Date | null;
        memberClaimedUntil: Date | null;
        memberAttempts: number;
    }>;
    unlink(profileId: string, groupId: string, acting: CurrentUser): Promise<{
        id: string;
        createdAt: Date;
        status: import("@prisma/client").$Enums.RecordStatus;
        updatedAt: Date;
        profileId: string;
        groupId: string;
        joinStatus: import("@prisma/client").$Enums.JoinStatus;
        joinCheckedAt: Date | null;
        joinError: string | null;
        memberApprovedAt: Date | null;
        preApprovedAt: Date | null;
        memberActionError: string | null;
        memberActionAt: Date | null;
        memberClaimedUntil: Date | null;
        memberAttempts: number;
    }>;
    update(groupId: string, dto: UpdateGroupDto, acting: CurrentUser): Promise<{
        id: string;
        createdAt: Date;
        name: string;
        status: import("@prisma/client").$Enums.RecordStatus;
        updatedAt: Date;
        ownerId: string | null;
        externalId: string | null;
        categoryId: string | null;
        url: string;
    }>;
}
export declare class GroupsCatalogController {
    private readonly groups;
    constructor(groups: GroupsService);
    findAll(pagination: PaginationDto, acting: CurrentUser): Promise<{
        data: {
            availablePosts: number;
            category: {
                id: string;
                name: string;
            } | null;
            profiles: ({
                profile: {
                    id: string;
                    createdAt: Date;
                    name: string;
                    status: import("@prisma/client").$Enums.RecordStatus;
                    updatedAt: Date;
                    ownerId: string | null;
                    externalId: string | null;
                    defaultImageUrl: string | null;
                    minPostsPerJob: number;
                    maxPostsPerJob: number;
                    minimumAvailable: number | null;
                    minimumAvailablePerGroup: number | null;
                    isModerator: boolean;
                    facebookUserId: string | null;
                    facebookName: string | null;
                    facebookSeenAt: Date | null;
                };
            } & {
                id: string;
                createdAt: Date;
                status: import("@prisma/client").$Enums.RecordStatus;
                updatedAt: Date;
                profileId: string;
                groupId: string;
                joinStatus: import("@prisma/client").$Enums.JoinStatus;
                joinCheckedAt: Date | null;
                joinError: string | null;
                memberApprovedAt: Date | null;
                preApprovedAt: Date | null;
                memberActionError: string | null;
                memberActionAt: Date | null;
                memberClaimedUntil: Date | null;
                memberAttempts: number;
            })[];
            _count: {
                targets: number;
            };
            id: string;
            createdAt: Date;
            name: string;
            status: import("@prisma/client").$Enums.RecordStatus;
            updatedAt: Date;
            ownerId: string | null;
            externalId: string | null;
            categoryId: string | null;
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
        id: string;
        createdAt: Date;
        name: string;
        status: import("@prisma/client").$Enums.RecordStatus;
        updatedAt: Date;
        ownerId: string | null;
        externalId: string | null;
        categoryId: string | null;
        url: string;
    }>;
    setJoinStatus(id: string, profileId: string, dto: SetJoinStatusDto, acting: CurrentUser): Promise<{
        profileId: string;
        groupId: string;
        joinStatus: import("@prisma/client").$Enums.JoinStatus;
    }>;
    removePosts(id: string, dryRun: string | undefined, acting: CurrentUser): Promise<{
        dryRun: boolean;
        removedFromGroup: number;
        deletedPosts: number;
        stillInOtherGroups: number;
        kept: number;
    }>;
    update(id: string, dto: UpdateGroupDto, acting: CurrentUser): Promise<{
        id: string;
        createdAt: Date;
        name: string;
        status: import("@prisma/client").$Enums.RecordStatus;
        updatedAt: Date;
        ownerId: string | null;
        externalId: string | null;
        categoryId: string | null;
        url: string;
    }>;
}
