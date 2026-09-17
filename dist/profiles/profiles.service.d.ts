import { PrismaService } from '../prisma/prisma.service';
import { CreateProfileDto } from './dto/create-profile.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { PaginationDto } from '../common/dto/pagination.dto';
export declare class ProfilesService {
    private readonly prisma;
    constructor(prisma: PrismaService);
    create(dto: CreateProfileDto): import("@prisma/client").Prisma.Prisma__ProfileClient<{
        status: import("@prisma/client").$Enums.RecordStatus;
        name: string;
        externalId: string | null;
        id: string;
        createdAt: Date;
        updatedAt: Date;
        defaultImageUrl: string | null;
        minPostsPerJob: number;
        maxPostsPerJob: number;
        minimumAvailable: number | null;
        minimumAvailablePerGroup: number | null;
    }, never, import("@prisma/client/runtime/library").DefaultArgs, import("@prisma/client").Prisma.PrismaClientOptions>;
    findAll({ page, limit }: PaginationDto): Promise<{
        data: ({
            _count: {
                profileGroups: number;
                posts: number;
            };
        } & {
            status: import("@prisma/client").$Enums.RecordStatus;
            name: string;
            externalId: string | null;
            id: string;
            createdAt: Date;
            updatedAt: Date;
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
    findOne(id: string): import("@prisma/client").Prisma.Prisma__ProfileClient<{
        _count: {
            publicationJobs: number;
            posts: number;
        };
        profileGroups: ({
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
        })[];
    } & {
        status: import("@prisma/client").$Enums.RecordStatus;
        name: string;
        externalId: string | null;
        id: string;
        createdAt: Date;
        updatedAt: Date;
        defaultImageUrl: string | null;
        minPostsPerJob: number;
        maxPostsPerJob: number;
        minimumAvailable: number | null;
        minimumAvailablePerGroup: number | null;
    }, never, import("@prisma/client/runtime/library").DefaultArgs, import("@prisma/client").Prisma.PrismaClientOptions>;
    update(id: string, dto: UpdateProfileDto): import("@prisma/client").Prisma.Prisma__ProfileClient<{
        status: import("@prisma/client").$Enums.RecordStatus;
        name: string;
        externalId: string | null;
        id: string;
        createdAt: Date;
        updatedAt: Date;
        defaultImageUrl: string | null;
        minPostsPerJob: number;
        maxPostsPerJob: number;
        minimumAvailable: number | null;
        minimumAvailablePerGroup: number | null;
    }, never, import("@prisma/client/runtime/library").DefaultArgs, import("@prisma/client").Prisma.PrismaClientOptions>;
    remove(id: string): import("@prisma/client").Prisma.Prisma__ProfileClient<{
        status: import("@prisma/client").$Enums.RecordStatus;
        name: string;
        externalId: string | null;
        id: string;
        createdAt: Date;
        updatedAt: Date;
        defaultImageUrl: string | null;
        minPostsPerJob: number;
        maxPostsPerJob: number;
        minimumAvailable: number | null;
        minimumAvailablePerGroup: number | null;
    }, never, import("@prisma/client/runtime/library").DefaultArgs, import("@prisma/client").Prisma.PrismaClientOptions>;
}
