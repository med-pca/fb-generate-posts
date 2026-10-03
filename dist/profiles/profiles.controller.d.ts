import type { CurrentUser } from '../auth/current-user';
import { CreateProfileDto } from './dto/create-profile.dto';
import { ProfilesService } from './profiles.service';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { DeactivateProfileDto, QueryProfilesDto } from './dto/query-profiles.dto';
import { ProfileHealthService } from './profile-health.service';
export declare class ProfilesController {
    private readonly profiles;
    private readonly health;
    constructor(profiles: ProfilesService, health: ProfileHealthService);
    create(dto: CreateProfileDto, acting: CurrentUser): import("@prisma/client").Prisma.Prisma__ProfileClient<{
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
    }, never, import("@prisma/client/runtime/library").DefaultArgs, import("@prisma/client").Prisma.PrismaClientOptions>;
    findAll(query: QueryProfilesDto, acting: CurrentUser): Promise<{
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
    detail(id: string, acting: CurrentUser): Promise<{
        profile: {
            id: string;
            name: string;
            status: import("@prisma/client").$Enums.RecordStatus;
            externalId: string | null;
            facebookUserId: string | null;
            isModerator: boolean;
            runner: {
                lastSeenAt: Date | null;
                mode: import("@prisma/client").$Enums.RunnerMode;
                message: string | null;
                running: boolean;
                browserState: import("@prisma/client").$Enums.BrowserState;
            } | null;
        };
        health: {
            labelText: string;
            windowDays: number;
            input: import("./profile-health").HealthInput;
            score: number | null;
            label: import("./profile-health").HealthLabel;
            successRate: number | null;
            verifyRate: number | null;
            linkRate: number | null;
            suggestDeactivate: boolean;
            reasons: string[];
        };
        totals: {
            today: number;
            week: number;
            month: number;
            total: number;
            failedWeek: number;
            failedMonth: number;
            failedTotal: number;
            lastPublishedAt: Date | null;
            lastFailedAt: Date | null;
        };
        days: {
            day: string;
            published: number;
            failed: number;
        }[];
        groups: {
            id: string;
            name: string;
            published: number;
            failed: number;
            lastError: string | null;
        }[];
        errors: {
            error: string;
            count: number;
        }[];
        failures: {
            at: Date;
            error: string | null;
            postTargetId: string;
            post: string;
            group: string;
        }[];
        joins: {
            [k: string]: number;
        };
        preApproved: number;
        transfer: {
            forcedTargets: number;
            ownedPosts: number;
            activeJobs: number;
            groupsWaiting: number;
            orphanGroups: {
                id: string;
                name: string;
                url: string;
            }[];
            candidates: {
                id: string;
                name: string;
                score: number | null;
                label: import("./profile-health").HealthLabel;
                labelText: string;
                running: boolean;
                groupsCovered: number;
                coverage: number;
            }[];
            recommendedId: string | null;
        };
    }>;
    deactivate(id: string, dto: DeactivateProfileDto, acting: CurrentUser): Promise<{
        released: number;
        transferredTo: {
            id: string;
            name: string;
        } | null;
        forcedMoved: number;
        forcedCleared: number;
        postsOpened: number;
        prioritised: number;
        orphanGroups: {
            id: string;
            name: string;
            url: string;
        }[];
    }>;
    findOne(id: string, acting: CurrentUser): Promise<{
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
    update(id: string, dto: UpdateProfileDto, acting: CurrentUser): Promise<{
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
    remove(id: string, acting: CurrentUser): Promise<{
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
