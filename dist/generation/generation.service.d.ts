import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { GeneratePostsDto } from './dto/generate-posts.dto';
export declare class GenerationService {
    private readonly prisma;
    private readonly config;
    constructor(prisma: PrismaService, config: ConfigService);
    generate(dto: GeneratePostsDto): Promise<({
        targets: {
            status: import("@prisma/client").$Enums.TargetStatus;
            id: string;
            publishedAt: Date | null;
            createdAt: Date;
            updatedAt: Date;
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
        profileId: string;
        description: string;
        title: string;
        status: import("@prisma/client").$Enums.PostStatus;
        id: string;
        externalId: string | null;
        rawData: import("@prisma/client/runtime/library").JsonValue | null;
        createdAt: Date;
        updatedAt: Date;
        url: string | null;
        imageUrl: string | null;
        delay: number;
        sourceType: import("@prisma/client").$Enums.SourceType;
        articleId: string | null;
        socialAngle: string | null;
    })[]>;
    private randomInt;
}
