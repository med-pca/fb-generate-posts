import type { CurrentUser } from '../auth/current-user';
import { CreatePostDto } from './dto/create-post.dto';
import { PostsService } from './posts.service';
import { UpdatePostDto } from './dto/update-post.dto';
import { QueryPostsDto } from './dto/query-posts.dto';
import { BulkDeletePostsDto } from './dto/bulk-delete-posts.dto';
export declare class PostsController {
    private readonly posts;
    constructor(posts: PostsService);
    create(dto: CreatePostDto, acting: CurrentUser): Promise<{
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
        rawData: import("@prisma/client/runtime/library").JsonValue | null;
        imageUrl: string | null;
        delay: number;
        sourceType: import("@prisma/client").$Enums.SourceType;
        articleId: string | null;
        socialAngle: string | null;
    }>;
    findAll(query: QueryPostsDto, acting: CurrentUser): Promise<{
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
            rawData: import("@prisma/client/runtime/library").JsonValue | null;
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
    bulkRemove(dto: BulkDeletePostsDto, acting: CurrentUser): Promise<{
        dryRun: boolean;
        matched: number;
        deleted: number;
        blocked: number;
        blockedPosts: {
            id: string;
            title: string;
        }[];
    }>;
    findOne(id: string, acting: CurrentUser): Promise<{
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
        rawData: import("@prisma/client/runtime/library").JsonValue | null;
        imageUrl: string | null;
        delay: number;
        sourceType: import("@prisma/client").$Enums.SourceType;
        articleId: string | null;
        socialAngle: string | null;
    }>;
    update(id: string, dto: UpdatePostDto, acting: CurrentUser): Promise<{
        id: string;
        status: import("@prisma/client").$Enums.PostStatus;
        createdAt: Date;
        updatedAt: Date;
        profileId: string;
        description: string;
        title: string;
        externalId: string | null;
        url: string | null;
        rawData: import("@prisma/client/runtime/library").JsonValue | null;
        imageUrl: string | null;
        delay: number;
        sourceType: import("@prisma/client").$Enums.SourceType;
        articleId: string | null;
        socialAngle: string | null;
    }>;
    remove(id: string, acting: CurrentUser, force?: string): Promise<{
        id: string;
        status: import("@prisma/client").$Enums.PostStatus;
        createdAt: Date;
        updatedAt: Date;
        profileId: string;
        description: string;
        title: string;
        externalId: string | null;
        url: string | null;
        rawData: import("@prisma/client/runtime/library").JsonValue | null;
        imageUrl: string | null;
        delay: number;
        sourceType: import("@prisma/client").$Enums.SourceType;
        articleId: string | null;
        socialAngle: string | null;
    }>;
}
