import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { CurrentUser } from '../auth/current-user';
import { CreatePostDto } from './dto/create-post.dto';
import { UpdatePostDto } from './dto/update-post.dto';
import { QueryPostsDto } from './dto/query-posts.dto';
import { BulkDeletePostsDto } from './dto/bulk-delete-posts.dto';
export declare class PostsService {
    private readonly prisma;
    constructor(prisma: PrismaService);
    create(dto: CreatePostDto, acting?: CurrentUser | null): Promise<{
        targets: {
            id: string;
            status: import("@prisma/client").$Enums.TargetStatus;
            createdAt: Date;
            updatedAt: Date;
            publishedAt: Date | null;
            claimedAt: Date | null;
            claimExpiresAt: Date | null;
            consumedAt: Date | null;
            commentExternalId: string | null;
            commentedAt: Date | null;
            linkUpdatedAt: Date | null;
            attemptsCount: number;
            lastError: string | null;
            groupId: string;
            postId: string;
        }[];
    } & {
        id: string;
        status: import("@prisma/client").$Enums.PostStatus;
        createdAt: Date;
        updatedAt: Date;
        profileId: string;
        description: string;
        title: string;
        externalId: string | null;
        url: string | null;
        rawData: Prisma.JsonValue | null;
        imageUrl: string | null;
        delay: number;
        sourceType: import("@prisma/client").$Enums.SourceType;
        articleId: string | null;
        socialAngle: string | null;
    }>;
    findAll({ page, limit, ...filters }: QueryPostsDto, acting: CurrentUser | null): Promise<{
        data: ({
            targets: ({
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
                status: import("@prisma/client").$Enums.TargetStatus;
                createdAt: Date;
                updatedAt: Date;
                publishedAt: Date | null;
                claimedAt: Date | null;
                claimExpiresAt: Date | null;
                consumedAt: Date | null;
                commentExternalId: string | null;
                commentedAt: Date | null;
                linkUpdatedAt: Date | null;
                attemptsCount: number;
                lastError: string | null;
                groupId: string;
                postId: string;
            })[];
        } & {
            id: string;
            status: import("@prisma/client").$Enums.PostStatus;
            createdAt: Date;
            updatedAt: Date;
            profileId: string;
            description: string;
            title: string;
            externalId: string | null;
            url: string | null;
            rawData: Prisma.JsonValue | null;
            imageUrl: string | null;
            delay: number;
            sourceType: import("@prisma/client").$Enums.SourceType;
            articleId: string | null;
            socialAngle: string | null;
        })[];
        meta: {
            page: number;
            limit: number;
            total: number;
            pages: number;
        };
    }>;
    findOne(id: string, acting: CurrentUser | null): Promise<{
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
        targets: ({
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
            status: import("@prisma/client").$Enums.TargetStatus;
            createdAt: Date;
            updatedAt: Date;
            publishedAt: Date | null;
            claimedAt: Date | null;
            claimExpiresAt: Date | null;
            consumedAt: Date | null;
            commentExternalId: string | null;
            commentedAt: Date | null;
            linkUpdatedAt: Date | null;
            attemptsCount: number;
            lastError: string | null;
            groupId: string;
            postId: string;
        })[];
    } & {
        id: string;
        status: import("@prisma/client").$Enums.PostStatus;
        createdAt: Date;
        updatedAt: Date;
        profileId: string;
        description: string;
        title: string;
        externalId: string | null;
        url: string | null;
        rawData: Prisma.JsonValue | null;
        imageUrl: string | null;
        delay: number;
        sourceType: import("@prisma/client").$Enums.SourceType;
        articleId: string | null;
        socialAngle: string | null;
    }>;
    update(id: string, dto: UpdatePostDto, acting: CurrentUser | null): Promise<{
        id: string;
        status: import("@prisma/client").$Enums.PostStatus;
        createdAt: Date;
        updatedAt: Date;
        profileId: string;
        description: string;
        title: string;
        externalId: string | null;
        url: string | null;
        rawData: Prisma.JsonValue | null;
        imageUrl: string | null;
        delay: number;
        sourceType: import("@prisma/client").$Enums.SourceType;
        articleId: string | null;
        socialAngle: string | null;
    }>;
    private reachable;
    remove(id: string, force?: boolean, acting?: CurrentUser | null): Promise<{
        id: string;
        status: import("@prisma/client").$Enums.PostStatus;
        createdAt: Date;
        updatedAt: Date;
        profileId: string;
        description: string;
        title: string;
        externalId: string | null;
        url: string | null;
        rawData: Prisma.JsonValue | null;
        imageUrl: string | null;
        delay: number;
        sourceType: import("@prisma/client").$Enums.SourceType;
        articleId: string | null;
        socialAngle: string | null;
    }>;
    bulkRemove(dto: BulkDeletePostsDto, acting?: CurrentUser | null): Promise<{
        dryRun: boolean;
        matched: number;
        deleted: number;
        blocked: number;
        blockedPosts: {
            id: string;
            title: string;
        }[];
    }>;
    private report;
    private hasCriteria;
    private buildWhere;
    private activeClaimWhere;
    private activeClaimSelect;
}
