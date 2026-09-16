import { PrismaService } from '../prisma/prisma.service';
import { CreateGroupDto } from './dto/create-group.dto';
import { UpdateGroupDto } from './dto/update-group.dto';
import { PaginationDto } from '../common/dto/pagination.dto';
export declare class GroupsService {
    private readonly prisma;
    constructor(prisma: PrismaService);
    create(profileId: string, dto: CreateGroupDto): import("@prisma/client").Prisma.Prisma__GroupClient<{
        profiles: {
            status: import("@prisma/client").$Enums.RecordStatus;
            id: string;
            createdAt: Date;
            updatedAt: Date;
            profileId: string;
            groupId: string;
        }[];
    } & {
        status: import("@prisma/client").$Enums.RecordStatus;
        name: string;
        externalId: string | null;
        url: string;
        id: string;
        createdAt: Date;
        updatedAt: Date;
    }, never, import("@prisma/client/runtime/library").DefaultArgs, import("@prisma/client").Prisma.PrismaClientOptions>;
    findAll(profileId: string): Promise<{
        status: import("@prisma/client").$Enums.RecordStatus;
        name: string;
        externalId: string | null;
        url: string;
        id: string;
        createdAt: Date;
        updatedAt: Date;
    }[]>;
    link(profileId: string, groupId: string): import("@prisma/client").Prisma.Prisma__ProfileGroupClient<{
        profile: {
            status: import("@prisma/client").$Enums.RecordStatus;
            name: string;
            externalId: string | null;
            id: string;
            createdAt: Date;
            updatedAt: Date;
            defaultImageUrl: string | null;
            minPostsPerJob: number;
            maxPostsPerJob: number;
        };
        group: {
            status: import("@prisma/client").$Enums.RecordStatus;
            name: string;
            externalId: string | null;
            url: string;
            id: string;
            createdAt: Date;
            updatedAt: Date;
        };
    } & {
        status: import("@prisma/client").$Enums.RecordStatus;
        id: string;
        createdAt: Date;
        updatedAt: Date;
        profileId: string;
        groupId: string;
    }, never, import("@prisma/client/runtime/library").DefaultArgs, import("@prisma/client").Prisma.PrismaClientOptions>;
    unlink(profileId: string, groupId: string): import("@prisma/client").Prisma.Prisma__ProfileGroupClient<{
        status: import("@prisma/client").$Enums.RecordStatus;
        id: string;
        createdAt: Date;
        updatedAt: Date;
        profileId: string;
        groupId: string;
    }, never, import("@prisma/client/runtime/library").DefaultArgs, import("@prisma/client").Prisma.PrismaClientOptions>;
    findCatalog({ page, limit }: PaginationDto): Promise<{
        data: {
            availablePosts: number;
            profiles: ({
                profile: {
                    status: import("@prisma/client").$Enums.RecordStatus;
                    name: string;
                    externalId: string | null;
                    id: string;
                    createdAt: Date;
                    updatedAt: Date;
                    defaultImageUrl: string | null;
                    minPostsPerJob: number;
                    maxPostsPerJob: number;
                };
            } & {
                status: import("@prisma/client").$Enums.RecordStatus;
                id: string;
                createdAt: Date;
                updatedAt: Date;
                profileId: string;
                groupId: string;
            })[];
            _count: {
                targets: number;
            };
            status: import("@prisma/client").$Enums.RecordStatus;
            name: string;
            externalId: string | null;
            url: string;
            id: string;
            createdAt: Date;
            updatedAt: Date;
        }[];
        meta: {
            page: number;
            limit: number;
            total: number;
            pages: number;
        };
    }>;
    update(id: string, dto: UpdateGroupDto): import("@prisma/client").Prisma.Prisma__GroupClient<{
        status: import("@prisma/client").$Enums.RecordStatus;
        name: string;
        externalId: string | null;
        url: string;
        id: string;
        createdAt: Date;
        updatedAt: Date;
    }, never, import("@prisma/client/runtime/library").DefaultArgs, import("@prisma/client").Prisma.PrismaClientOptions>;
    remove(id: string): import("@prisma/client").Prisma.Prisma__GroupClient<{
        status: import("@prisma/client").$Enums.RecordStatus;
        name: string;
        externalId: string | null;
        url: string;
        id: string;
        createdAt: Date;
        updatedAt: Date;
    }, never, import("@prisma/client/runtime/library").DefaultArgs, import("@prisma/client").Prisma.PrismaClientOptions>;
}
