import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { GeneratePostsDto } from './dto/generate-posts.dto';
import type { CurrentUser } from '../auth/current-user';
export declare class GenerationService {
    private readonly prisma;
    private readonly config;
    constructor(prisma: PrismaService, config: ConfigService);
    generate(dto: GeneratePostsDto, acting?: CurrentUser | null): Promise<({
        targets: {
            id: string;
            createdAt: Date;
            status: import("@prisma/client").$Enums.TargetStatus;
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
            forcedAt: Date | null;
            verifyStatus: import("@prisma/client").$Enums.VerifyStatus | null;
            verifiedAt: Date | null;
            verifyDetail: string | null;
            verifyClaimedUntil: Date | null;
            verifyAttempts: number;
            republishCount: number;
            facebookUrl: string | null;
            groupId: string;
            forcedProfileId: string | null;
            postId: string;
        }[];
    } & {
        id: string;
        createdAt: Date;
        status: import("@prisma/client").$Enums.PostStatus;
        updatedAt: Date;
        description: string;
        title: string;
        ownerId: string | null;
        externalId: string | null;
        url: string | null;
        rawData: import("@prisma/client/runtime/library").JsonValue | null;
        profileId: string | null;
        imageUrl: string | null;
        delay: number;
        sourceType: import("@prisma/client").$Enums.SourceType;
        articleId: string | null;
        socialAngle: string | null;
        priority: number;
    })[]>;
    private randomInt;
}
