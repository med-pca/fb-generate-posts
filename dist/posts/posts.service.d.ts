import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePostDto } from './dto/create-post.dto';
import { UpdatePostDto } from './dto/update-post.dto';
import { QueryPostsDto } from './dto/query-posts.dto';
import { BulkDeletePostsDto } from './dto/bulk-delete-posts.dto';
export declare class PostsService {
    private readonly prisma;
    constructor(prisma: PrismaService);
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
        rawData: Prisma.JsonValue | null;
        articleId: string | null;
        socialAngle: string | null;
    }>;
    findAll({ page, limit, ...filters }: QueryPostsDto): Promise<{
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
            rawData: Prisma.JsonValue | null;
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
    findOne(id: string): Prisma.Prisma__PostClient<{
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
        rawData: Prisma.JsonValue | null;
        articleId: string | null;
        socialAngle: string | null;
    }, never, import("@prisma/client/runtime/library").DefaultArgs, Prisma.PrismaClientOptions>;
    update(id: string, dto: UpdatePostDto): Prisma.Prisma__PostClient<{
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
        rawData: Prisma.JsonValue | null;
        articleId: string | null;
        socialAngle: string | null;
    }, never, import("@prisma/client/runtime/library").DefaultArgs, Prisma.PrismaClientOptions>;
    remove(id: string, force?: boolean): Promise<{
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
        rawData: Prisma.JsonValue | null;
        articleId: string | null;
        socialAngle: string | null;
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
    private report;
    private hasCriteria;
    private buildWhere;
    private activeClaimWhere;
    private activeClaimSelect;
}
