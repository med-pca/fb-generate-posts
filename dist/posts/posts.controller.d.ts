import { CreatePostDto } from './dto/create-post.dto';
import { PostsService } from './posts.service';
import { UpdatePostDto } from './dto/update-post.dto';
import { PaginationDto } from '../common/dto/pagination.dto';
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
            claimedAt: Date | null;
            claimExpiresAt: Date | null;
            consumedAt: Date | null;
            publishedAt: Date | null;
            attemptsCount: number;
            lastError: string | null;
            postId: string;
        }[];
    } & {
        status: import("@prisma/client").$Enums.PostStatus;
        externalId: string | null;
        url: string | null;
        id: string;
        createdAt: Date;
        updatedAt: Date;
        profileId: string;
        imageUrl: string | null;
        title: string;
        description: string;
        delay: number;
        sourceType: import("@prisma/client").$Enums.SourceType;
        rawData: import("@prisma/client/runtime/library").JsonValue | null;
        articleId: string | null;
        socialAngle: string | null;
    }>;
    findAll(profileId: string | undefined, pagination: PaginationDto): Promise<{
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
                claimedAt: Date | null;
                claimExpiresAt: Date | null;
                consumedAt: Date | null;
                publishedAt: Date | null;
                attemptsCount: number;
                lastError: string | null;
                postId: string;
            })[];
        } & {
            status: import("@prisma/client").$Enums.PostStatus;
            externalId: string | null;
            url: string | null;
            id: string;
            createdAt: Date;
            updatedAt: Date;
            profileId: string;
            imageUrl: string | null;
            title: string;
            description: string;
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
            claimedAt: Date | null;
            claimExpiresAt: Date | null;
            consumedAt: Date | null;
            publishedAt: Date | null;
            attemptsCount: number;
            lastError: string | null;
            postId: string;
        })[];
    } & {
        status: import("@prisma/client").$Enums.PostStatus;
        externalId: string | null;
        url: string | null;
        id: string;
        createdAt: Date;
        updatedAt: Date;
        profileId: string;
        imageUrl: string | null;
        title: string;
        description: string;
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
        imageUrl: string | null;
        title: string;
        description: string;
        delay: number;
        sourceType: import("@prisma/client").$Enums.SourceType;
        rawData: import("@prisma/client/runtime/library").JsonValue | null;
        articleId: string | null;
        socialAngle: string | null;
    }, never, import("@prisma/client/runtime/library").DefaultArgs, import("@prisma/client").Prisma.PrismaClientOptions>;
}
