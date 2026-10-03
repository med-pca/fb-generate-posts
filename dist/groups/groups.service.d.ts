import { JoinStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CategoriesService } from '../categories/categories.service';
import type { CurrentUser } from '../auth/current-user';
import { CreateGroupDto } from './dto/create-group.dto';
import { UpdateGroupDto } from './dto/update-group.dto';
import { PaginationDto } from '../common/dto/pagination.dto';
import { UpdateJoinStatusDto } from './dto/update-join-status.dto';
export declare class GroupsService {
    private readonly prisma;
    private readonly categories;
    constructor(prisma: PrismaService, categories: CategoriesService);
    create(profileId: string, dto: CreateGroupDto, owner: CurrentUser | null): Promise<{
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
    findAll(profileId: string, acting: CurrentUser | null): Promise<{
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
    link(profileId: string, groupId: string, acting: CurrentUser | null): Promise<{
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
    unlink(profileId: string, groupId: string, acting: CurrentUser | null): Promise<{
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
    findCatalog({ page, limit }: PaginationDto, acting: CurrentUser | null): Promise<{
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
    private reachableGroup;
    private ownedGroup;
    private requiredCategory;
    private reachableProfile;
    update(id: string, dto: UpdateGroupDto, acting: CurrentUser | null): Promise<{
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
    removePosts(id: string, acting: CurrentUser | null, dryRun?: boolean): Promise<{
        dryRun: boolean;
        removedFromGroup: number;
        deletedPosts: number;
        stillInOtherGroups: number;
        kept: number;
    }>;
    setJoinStatus(groupId: string, profileId: string, joinStatus: JoinStatus, acting: CurrentUser | null): Promise<{
        profileId: string;
        groupId: string;
        joinStatus: import("@prisma/client").$Enums.JoinStatus;
    }>;
    remove(id: string, acting: CurrentUser | null): Promise<{
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
    private findAutomationProfile;
    findForJoin(profileExternalId: string, statuses?: JoinStatus[]): Promise<{
        id: string;
        externalId: string | null;
        name: string;
        url: string;
        joinStatus: import("@prisma/client").$Enums.JoinStatus;
        joinCheckedAt: Date | null;
        joinError: string | null;
    }[]>;
    updateJoinStatus(profileExternalId: string, groupId: string, { joinStatus, error }: UpdateJoinStatusDto): Promise<{
        groupId: string;
        joinStatus: import("@prisma/client").$Enums.JoinStatus;
        joinCheckedAt: Date | null;
        joinError: string | null;
    }>;
}
