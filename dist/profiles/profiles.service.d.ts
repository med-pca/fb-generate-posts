import { PrismaService } from '../prisma/prisma.service';
import type { CurrentUser } from '../auth/current-user';
import { CreateProfileDto } from './dto/create-profile.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { PaginationDto } from '../common/dto/pagination.dto';
export declare class ProfilesService {
    private readonly prisma;
    constructor(prisma: PrismaService);
    create(dto: CreateProfileDto, owner: CurrentUser | null): import("@prisma/client").Prisma.Prisma__ProfileClient<{
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
    }, never, import("@prisma/client/runtime/library").DefaultArgs, import("@prisma/client").Prisma.PrismaClientOptions>;
    findAll({ page, limit }: PaginationDto, acting: CurrentUser | null): Promise<{
        data: ({
            _count: {
                profileGroups: number;
                posts: number;
            };
        } & {
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
        })[];
        meta: {
            page: number;
            limit: number;
            total: number;
            pages: number;
        };
    }>;
    findOne(id: string, acting: CurrentUser | null): Promise<{
        _count: {
            posts: number;
            publicationJobs: number;
        };
        profileGroups: ({
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
        })[];
    } & {
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
    }>;
    private reachable;
    update(id: string, dto: UpdateProfileDto, acting: CurrentUser | null): Promise<{
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
    }>;
    remove(id: string, acting: CurrentUser | null): Promise<{
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
    }>;
}
