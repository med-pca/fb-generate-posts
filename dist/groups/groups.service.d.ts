import { JoinStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { CurrentUser } from '../auth/current-user';
import { CreateGroupDto } from './dto/create-group.dto';
import { UpdateGroupDto } from './dto/update-group.dto';
import { PaginationDto } from '../common/dto/pagination.dto';
import { UpdateJoinStatusDto } from './dto/update-join-status.dto';
export declare class GroupsService {
    private readonly prisma;
    constructor(prisma: PrismaService);
    create(profileId: string, dto: CreateGroupDto, owner: CurrentUser | null): Promise<{
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
    findAll(profileId: string, acting: CurrentUser | null): Promise<{
        name: string;
        id: string;
        status: import("@prisma/client").$Enums.RecordStatus;
        createdAt: Date;
        updatedAt: Date;
        ownerId: string | null;
        externalId: string | null;
        url: string;
    }[]>;
    link(profileId: string, groupId: string, acting: CurrentUser | null): Promise<{
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
    unlink(profileId: string, groupId: string, acting: CurrentUser | null): Promise<{
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
    findCatalog({ page, limit }: PaginationDto, acting: CurrentUser | null): Promise<{
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
    private reachableGroup;
    private ownedGroup;
    private reachableProfile;
    update(id: string, dto: UpdateGroupDto, acting: CurrentUser | null): Promise<{
        name: string;
        id: string;
        status: import("@prisma/client").$Enums.RecordStatus;
        createdAt: Date;
        updatedAt: Date;
        ownerId: string | null;
        externalId: string | null;
        url: string;
    }>;
    remove(id: string, acting: CurrentUser | null): Promise<{
        name: string;
        id: string;
        status: import("@prisma/client").$Enums.RecordStatus;
        createdAt: Date;
        updatedAt: Date;
        ownerId: string | null;
        externalId: string | null;
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
