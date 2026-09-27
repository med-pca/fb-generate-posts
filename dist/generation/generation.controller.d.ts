import { GeneratePostsDto } from './dto/generate-posts.dto';
import { GenerationService } from './generation.service';
export declare class GenerationController {
    private readonly generation;
    constructor(generation: GenerationService);
    generate(dto: GeneratePostsDto): Promise<({
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
    })[]>;
}
