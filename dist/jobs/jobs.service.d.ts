import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { ClaimJobDto } from './dto/claim-job.dto';
import { PublishJobItemDto } from './dto/publish-job-item.dto';
import { SettingsService } from '../settings/settings.service';
export declare class JobsService {
    private readonly prisma;
    private readonly config;
    private readonly settings;
    constructor(prisma: PrismaService, config: ConfigService, settings: SettingsService);
    claim(dto: ClaimJobDto): Promise<{
        job: null;
        posts: never[];
        jobId?: undefined;
        claimExpiresAt?: undefined;
        profile?: undefined;
        group?: undefined;
    } | {
        jobId: string;
        claimExpiresAt: Date;
        profile: {
            id: string;
            externalId: string | null;
            name: string;
        };
        group: {
            id: string;
            externalId: string | null;
            name: string;
            url: string;
        };
        posts: {
            id: string;
            title: string;
            description: string;
            url: string | null;
            image: string | null;
            delay: number;
        }[];
        job?: undefined;
    }>;
    claimByProfileExternalId(profileExternalId: string, groupExternalId?: string): Promise<{
        job: null;
        posts: never[];
        jobId?: undefined;
        claimExpiresAt?: undefined;
        profile?: undefined;
        group?: undefined;
    } | {
        jobId: string;
        claimExpiresAt: Date;
        profile: {
            id: string;
            externalId: string | null;
            name: string;
        };
        group: {
            id: string;
            externalId: string | null;
            name: string;
            url: string;
        };
        posts: {
            id: string;
            title: string;
            description: string;
            url: string | null;
            image: string | null;
            delay: number;
        }[];
        job?: undefined;
    } | {
        job: null;
        posts: never[];
        message: string;
    }>;
    markConsumed(jobId: string, postId: string): Promise<{
        status: import("@prisma/client").$Enums.TargetStatus;
        error: string | null;
        id: string;
        createdAt: Date;
        updatedAt: Date;
        publishedAt: Date | null;
        postId: string;
        externalPostUrl: string | null;
        postTargetId: string;
        jobId: string;
    }>;
    markPublished(jobId: string, postId: string, dto: PublishJobItemDto): Promise<{
        status: import("@prisma/client").$Enums.TargetStatus;
        error: string | null;
        id: string;
        createdAt: Date;
        updatedAt: Date;
        publishedAt: Date | null;
        postId: string;
        externalPostUrl: string | null;
        postTargetId: string;
        jobId: string;
    }>;
    markFailed(jobId: string, postId: string, error: string): Promise<{
        status: import("@prisma/client").$Enums.TargetStatus;
        error: string | null;
        id: string;
        createdAt: Date;
        updatedAt: Date;
        publishedAt: Date | null;
        postId: string;
        externalPostUrl: string | null;
        postTargetId: string;
        jobId: string;
    }>;
    complete(jobId: string): Promise<{
        status: import("@prisma/client").$Enums.JobStatus;
        id: string;
        createdAt: Date;
        updatedAt: Date;
        profileId: string;
        groupId: string;
        claimedAt: Date;
        claimExpiresAt: Date;
        completedAt: Date | null;
    }>;
    private updateItem;
    private randomInt;
}
