import { CreatePostDto } from './dto/create-post.dto';
import { PostsService } from './posts.service';
import { UpdatePostDto } from './dto/update-post.dto';
import { QueryPostsDto } from './dto/query-posts.dto';
import { BulkDeletePostsDto } from './dto/bulk-delete-posts.dto';
export declare class PostsController {
    private readonly posts;
    constructor(posts: PostsService);
    create(dto: CreatePostDto): Promise<{
        targets: {
            status: import("@prisma/client").$Enums.TargetStatus;
            id: string;
            createdAt: Date;
            updatedAt: Date;
            groupId: string;
            postId: string;
            claimedAt: Date | null;
            claimExpiresAt: Date | null;
            consumedAt: Date | null;
            publishedAt: Date | null;
            commentExternalId: string | null;
            commentedAt: Date | null;
            linkUpdatedAt: Date | null;
            attemptsCount: number;
            lastError: string | null;
        }[];
    } & {
        status: import("@prisma/client").$Enums.PostStatus;
        externalId: string | null;
        url: string | null;
        id: string;
        createdAt: Date;
        updatedAt: Date;
        profileId: string;
        title: string;
        description: string;
        imageUrl: string | null;
        delay: number;
        sourceType: import("@prisma/client").$Enums.SourceType;
        rawData: import("@prisma/client/runtime/library").JsonValue | null;
        articleId: string | null;
        socialAngle: string | null;
    }>;
    findAll(query: QueryPostsDto): Promise<{
        data: ({
            targets: ({
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
                status: import("@prisma/client").$Enums.TargetStatus;
                id: string;
                createdAt: Date;
                updatedAt: Date;
                groupId: string;
                postId: string;
                claimedAt: Date | null;
                claimExpiresAt: Date | null;
                consumedAt: Date | null;
                publishedAt: Date | null;
                commentExternalId: string | null;
                commentedAt: Date | null;
                linkUpdatedAt: Date | null;
                attemptsCount: number;
                lastError: string | null;
            })[];
        } & {
            status: import("@prisma/client").$Enums.PostStatus;
            externalId: string | null;
            url: string | null;
            id: string;
            createdAt: Date;
            updatedAt: Date;
            profileId: string;
            title: string;
            description: string;
            imageUrl: string | null;
            delay: number;
            sourceType: import("@prisma/client").$Enums.SourceType;
            rawData: import("@prisma/client/runtime/library").JsonValue | null;
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
    bulkRemove(dto: BulkDeletePostsDto): Promise<{
        dryRun: boolean;
        matched: number;
        deleted: number;
        blocked: number;
        blockedPosts: {
            id: string;
            title: string;
        }[];
    }>;
    findOne(id: string): import("@prisma/client").Prisma.Prisma__PostClient<{
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
            minimumAvailable: number | null;
            minimumAvailablePerGroup: number | null;
        };
        targets: ({
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
            status: import("@prisma/client").$Enums.TargetStatus;
            id: string;
            createdAt: Date;
            updatedAt: Date;
            groupId: string;
            postId: string;
            claimedAt: Date | null;
            claimExpiresAt: Date | null;
            consumedAt: Date | null;
            publishedAt: Date | null;
            commentExternalId: string | null;
            commentedAt: Date | null;
            linkUpdatedAt: Date | null;
            attemptsCount: number;
            lastError: string | null;
        })[];
    } & {
        status: import("@prisma/client").$Enums.PostStatus;
        externalId: string | null;
        url: string | null;
        id: string;
        createdAt: Date;
        updatedAt: Date;
        profileId: string;
        title: string;
        description: string;
        imageUrl: string | null;
        delay: number;
        sourceType: import("@prisma/client").$Enums.SourceType;
        rawData: import("@prisma/client/runtime/library").JsonValue | null;
        articleId: string | null;
        socialAngle: string | null;
    }, never, import("@prisma/client/runtime/library").DefaultArgs, import("@prisma/client").Prisma.PrismaClientOptions>;
    update(id: string, dto: UpdatePostDto): import("@prisma/client").Prisma.Prisma__PostClient<{
        status: import("@prisma/client").$Enums.PostStatus;
        externalId: string | null;
        url: string | null;
        id: string;
        createdAt: Date;
        updatedAt: Date;
        profileId: string;
        title: string;
        description: string;
        imageUrl: string | null;
        delay: number;
        sourceType: import("@prisma/client").$Enums.SourceType;
        rawData: import("@prisma/client/runtime/library").JsonValue | null;
        articleId: string | null;
        socialAngle: string | null;
    }, never, import("@prisma/client/runtime/library").DefaultArgs, import("@prisma/client").Prisma.PrismaClientOptions>;
    remove(id: string, force?: string): Promise<{
        status: import("@prisma/client").$Enums.PostStatus;
        externalId: string | null;
        url: string | null;
        id: string;
        createdAt: Date;
        updatedAt: Date;
        profileId: string;
        title: string;
        description: string;
        imageUrl: string | null;
        delay: number;
        sourceType: import("@prisma/client").$Enums.SourceType;
        rawData: import("@prisma/client/runtime/library").JsonValue | null;
        articleId: string | null;
        socialAngle: string | null;
    }>;
}
