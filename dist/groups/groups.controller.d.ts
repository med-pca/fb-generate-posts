import { CreateGroupDto } from './dto/create-group.dto';
import { GroupsService } from './groups.service';
import { UpdateGroupDto } from './dto/update-group.dto';
import { PaginationDto } from '../common/dto/pagination.dto';
export declare class GroupsController {
    private readonly groups;
    constructor(groups: GroupsService);
    create(profileId: string, dto: CreateGroupDto): import("@prisma/client").Prisma.Prisma__GroupClient<{
        profiles: {
            profileId: string;
            status: import("@prisma/client").$Enums.RecordStatus;
            id: string;
            createdAt: Date;
            updatedAt: Date;
            groupId: string;
        }[];
    } & {
        status: import("@prisma/client").$Enums.RecordStatus;
        id: string;
        externalId: string | null;
        createdAt: Date;
        updatedAt: Date;
        name: string;
        url: string;
    }, never, import("@prisma/client/runtime/library").DefaultArgs, import("@prisma/client").Prisma.PrismaClientOptions>;
    findAll(profileId: string): Promise<{
        status: import("@prisma/client").$Enums.RecordStatus;
        id: string;
        externalId: string | null;
        createdAt: Date;
        updatedAt: Date;
        name: string;
        url: string;
    }[]>;
    link(profileId: string, groupId: string): import("@prisma/client").Prisma.Prisma__ProfileGroupClient<{
        profile: {
            status: import("@prisma/client").$Enums.RecordStatus;
            id: string;
            externalId: string | null;
            createdAt: Date;
            updatedAt: Date;
            name: string;
            defaultImageUrl: string | null;
            minPostsPerJob: number;
            maxPostsPerJob: number;
            minimumAvailable: number | null;
            minimumAvailablePerGroup: number | null;
        };
        group: {
            status: import("@prisma/client").$Enums.RecordStatus;
            id: string;
            externalId: string | null;
            createdAt: Date;
            updatedAt: Date;
            name: string;
            url: string;
        };
    } & {
        profileId: string;
        status: import("@prisma/client").$Enums.RecordStatus;
        id: string;
        createdAt: Date;
        updatedAt: Date;
        groupId: string;
    }, never, import("@prisma/client/runtime/library").DefaultArgs, import("@prisma/client").Prisma.PrismaClientOptions>;
    unlink(profileId: string, groupId: string): import("@prisma/client").Prisma.Prisma__ProfileGroupClient<{
        profileId: string;
        status: import("@prisma/client").$Enums.RecordStatus;
        id: string;
        createdAt: Date;
        updatedAt: Date;
        groupId: string;
    }, never, import("@prisma/client/runtime/library").DefaultArgs, import("@prisma/client").Prisma.PrismaClientOptions>;
    update(groupId: string, dto: UpdateGroupDto): import("@prisma/client").Prisma.Prisma__GroupClient<{
        status: import("@prisma/client").$Enums.RecordStatus;
        id: string;
        externalId: string | null;
        createdAt: Date;
        updatedAt: Date;
        name: string;
        url: string;
    }, never, import("@prisma/client/runtime/library").DefaultArgs, import("@prisma/client").Prisma.PrismaClientOptions>;
}
export declare class GroupsCatalogController {
    private readonly groups;
    constructor(groups: GroupsService);
    findAll(pagination: PaginationDto): Promise<{
        data: {
            availablePosts: number;
            _count: {
                targets: number;
            };
            profiles: ({
                profile: {
                    status: import("@prisma/client").$Enums.RecordStatus;
                    id: string;
                    externalId: string | null;
                    createdAt: Date;
                    updatedAt: Date;
                    name: string;
                    defaultImageUrl: string | null;
                    minPostsPerJob: number;
                    maxPostsPerJob: number;
                    minimumAvailable: number | null;
                    minimumAvailablePerGroup: number | null;
                };
            } & {
                profileId: string;
                status: import("@prisma/client").$Enums.RecordStatus;
                id: string;
                createdAt: Date;
                updatedAt: Date;
                groupId: string;
            })[];
            status: import("@prisma/client").$Enums.RecordStatus;
            id: string;
            externalId: string | null;
            createdAt: Date;
            updatedAt: Date;
            name: string;
            url: string;
        }[];
        meta: {
            page: number;
            limit: number;
            total: number;
            pages: number;
        };
    }>;
    remove(id: string): import("@prisma/client").Prisma.Prisma__GroupClient<{
        status: import("@prisma/client").$Enums.RecordStatus;
        id: string;
        externalId: string | null;
        createdAt: Date;
        updatedAt: Date;
        name: string;
        url: string;
    }, never, import("@prisma/client/runtime/library").DefaultArgs, import("@prisma/client").Prisma.PrismaClientOptions>;
    update(id: string, dto: UpdateGroupDto): import("@prisma/client").Prisma.Prisma__GroupClient<{
        status: import("@prisma/client").$Enums.RecordStatus;
        id: string;
        externalId: string | null;
        createdAt: Date;
        updatedAt: Date;
        name: string;
        url: string;
    }, never, import("@prisma/client/runtime/library").DefaultArgs, import("@prisma/client").Prisma.PrismaClientOptions>;
}
