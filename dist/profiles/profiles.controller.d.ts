import { CreateProfileDto } from './dto/create-profile.dto';
import { ProfilesService } from './profiles.service';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { PaginationDto } from '../common/dto/pagination.dto';
export declare class ProfilesController {
    private readonly profiles;
    constructor(profiles: ProfilesService);
    create(dto: CreateProfileDto): import("@prisma/client").Prisma.Prisma__ProfileClient<{
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
    }, never, import("@prisma/client/runtime/library").DefaultArgs, import("@prisma/client").Prisma.PrismaClientOptions>;
    findAll(pagination: PaginationDto): Promise<{
        data: ({
            _count: {
                posts: number;
                profileGroups: number;
            };
        } & {
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
            posts: number;
            publicationJobs: number;
        };
        profileGroups: ({
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
        })[];
    } & {
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
    }, never, import("@prisma/client/runtime/library").DefaultArgs, import("@prisma/client").Prisma.PrismaClientOptions>;
    update(id: string, dto: UpdateProfileDto): import("@prisma/client").Prisma.Prisma__ProfileClient<{
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
    }, never, import("@prisma/client/runtime/library").DefaultArgs, import("@prisma/client").Prisma.PrismaClientOptions>;
    remove(id: string): import("@prisma/client").Prisma.Prisma__ProfileClient<{
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
    }, never, import("@prisma/client/runtime/library").DefaultArgs, import("@prisma/client").Prisma.PrismaClientOptions>;
}
