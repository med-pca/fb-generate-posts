import { PrismaService } from '../prisma/prisma.service';
import type { CurrentUser } from '../auth/current-user';
import { CreateProfileDto } from './dto/create-profile.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { PaginationDto } from '../common/dto/pagination.dto';
import { Prisma } from '@prisma/client';
import { QueryProfilesDto } from './dto/query-profiles.dto';
import { ProfileHealthService } from './profile-health.service';
export declare class ProfilesService {
    private readonly prisma;
    private readonly health;
    constructor(prisma: PrismaService, health: ProfileHealthService);
    create(dto: CreateProfileDto, owner: CurrentUser | null): Prisma.Prisma__ProfileClient<{
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
    }, never, import("@prisma/client/runtime/library").DefaultArgs, Prisma.PrismaClientOptions>;
    findAll(query: PaginationDto & Partial<QueryProfilesDto>, acting: CurrentUser | null): Promise<{
        data: {
            health: {
                score: number | null;
                label: import("./profile-health").HealthLabel;
                labelText: string;
                suggestDeactivate: boolean;
                reasons: string[];
                published: number;
                failed: number;
                failStreak: number;
            };
            _count: {
                posts: number;
                profileGroups: number;
            };
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
        }[];
        meta: {
            page: number;
            limit: number;
            total: number;
            pages: number;
        };
    }>;
    findOne(id: string, acting: CurrentUser | null): Promise<{
        profileGroups: ({
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
        })[];
        _count: {
            posts: number;
            publicationJobs: number;
        };
    } & {
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
    }>;
    private reachable;
    update(id: string, dto: UpdateProfileDto, acting: CurrentUser | null): Promise<{
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
    }>;
    remove(id: string, acting: CurrentUser | null): Promise<{
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
    }>;
}
