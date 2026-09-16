import { GeneratePostsDto } from './dto/generate-posts.dto';
import { GenerationService } from './generation.service';
export declare class GenerationController {
    private readonly generation;
    constructor(generation: GenerationService);
    generate(dto: GeneratePostsDto): Promise<({
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
    })[]>;
}
