import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ClaimJobDto } from './dto/claim-job.dto';
import { ClaimBatchDto } from './dto/claim-batch.dto';
import { CommentJobItemDto } from './dto/comment-job-item.dto';
import { LinkUpdatedJobItemDto } from './dto/link-updated-job-item.dto';
import { PublishJobItemDto } from './dto/publish-job-item.dto';
import { SettingsService } from '../settings/settings.service';
type ClaimedPost = {
    id: string;
    title: string;
    description: string;
    image: string | null;
    delay: number;
    comment: {
        text: string;
        willReceiveLink: boolean;
    };
};
type ClaimedJob = {
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
    posts: ClaimedPost[];
};
type EmptyClaim = {
    job: null;
    posts: ClaimedPost[];
    message?: string;
    activeJobId?: string;
};
type BatchSkip = {
    status: 'busy' | 'empty' | 'error';
    profileExternalId: string;
    profileName: string;
    message?: string;
};
type BatchClaim = {
    status: 'claimed';
} & ClaimedJob;
export declare class JobsService {
    private readonly prisma;
    private readonly config;
    private readonly settings;
    constructor(prisma: PrismaService, config: ConfigService, settings: SettingsService);
    listAutomationProfiles(): Prisma.PrismaPromise<{
        id: string;
        externalId: string | null;
        name: string;
    }[]>;
    claim(dto: ClaimJobDto): Promise<ClaimedJob | EmptyClaim>;
    claimBatch({ profileExternalIds, limit }: ClaimBatchDto): Promise<{
        requested: number;
        claimed: number;
        jobs: never[];
        skipped: never[];
        posts?: undefined;
    } | {
        requested: number;
        claimed: number;
        posts: number;
        jobs: BatchClaim[];
        skipped: BatchSkip[];
    }>;
    releaseExpiredClaims(tx?: Prisma.TransactionClient): Promise<number>;
    claimByProfileExternalId(profileExternalId: string, groupExternalId?: string): Promise<ClaimedJob | EmptyClaim>;
    markConsumed(jobId: string, postId: string): Promise<{
        error: string | null;
        status: import("@prisma/client").$Enums.TargetStatus;
        id: string;
        publishedAt: Date | null;
        createdAt: Date;
        updatedAt: Date;
        commentExternalId: string | null;
        commentedAt: Date | null;
        linkUpdatedAt: Date | null;
        postId: string;
        externalPostUrl: string | null;
        postTargetId: string;
        jobId: string;
    }>;
    markPublished(jobId: string, postId: string, dto: PublishJobItemDto): Promise<{
        error: string | null;
        status: import("@prisma/client").$Enums.TargetStatus;
        id: string;
        publishedAt: Date | null;
        createdAt: Date;
        updatedAt: Date;
        commentExternalId: string | null;
        commentedAt: Date | null;
        linkUpdatedAt: Date | null;
        postId: string;
        externalPostUrl: string | null;
        postTargetId: string;
        jobId: string;
    }>;
    markFailed(jobId: string, postId: string, error: string): Promise<{
        error: string | null;
        status: import("@prisma/client").$Enums.TargetStatus;
        id: string;
        publishedAt: Date | null;
        createdAt: Date;
        updatedAt: Date;
        commentExternalId: string | null;
        commentedAt: Date | null;
        linkUpdatedAt: Date | null;
        postId: string;
        externalPostUrl: string | null;
        postTargetId: string;
        jobId: string;
    }>;
    complete(jobId: string): Promise<{
        awaitingLink: number;
        missingComments: number;
        profileId: string;
        status: import("@prisma/client").$Enums.JobStatus;
        id: string;
        createdAt: Date;
        updatedAt: Date;
        claimedAt: Date;
        claimExpiresAt: Date;
        groupId: string;
        completedAt: Date | null;
    }>;
    markCommented(jobId: string, postId: string, dto: CommentJobItemDto): Promise<{
        error: string | null;
        status: import("@prisma/client").$Enums.TargetStatus;
        id: string;
        publishedAt: Date | null;
        createdAt: Date;
        updatedAt: Date;
        commentExternalId: string | null;
        commentedAt: Date | null;
        linkUpdatedAt: Date | null;
        postId: string;
        externalPostUrl: string | null;
        postTargetId: string;
        jobId: string;
    }>;
    linkUpdates(jobId: string): Promise<{
        jobId: string;
        status: "FAILED" | "AWAITING_LINK" | "PARTIALLY_COMPLETED" | "COMPLETED" | "EXPIRED";
        completedAt: Date | null;
        profile: {
            id: string;
            externalId: string | null;
            name: string;
        };
        group: {
            id: string;
            externalId: string | null;
            name: string;
        };
        updates: {
            postId: string;
            title: string;
            commentExternalId: string | null;
            url: string | null;
            externalPostUrl: string | null;
        }[];
    }>;
    pendingLinkUpdates(profileExternalId: string | undefined, limit: number): Promise<{
        jobId: string;
        completedAt: Date | null;
        profile: {
            id: string;
            externalId: string | null;
            name: string;
        };
        group: {
            id: string;
            externalId: string | null;
            name: string;
        };
        updates: {
            postId: string;
            title: string;
            commentExternalId: string | null;
            url: string | null;
        }[];
    }[]>;
    markLinkUpdated(jobId: string, postId: string, dto: LinkUpdatedJobItemDto): Promise<{
        remaining: number;
        error: string | null;
        status: import("@prisma/client").$Enums.TargetStatus;
        id: string;
        publishedAt: Date | null;
        createdAt: Date;
        updatedAt: Date;
        commentExternalId: string | null;
        commentedAt: Date | null;
        linkUpdatedAt: Date | null;
        postId: string;
        externalPostUrl: string | null;
        postTargetId: string;
        jobId: string;
    }>;
    private awaitsLink;
    private outcomeFor;
    private log;
    private updateItem;
    private canTransition;
    private stillOwnsTarget;
    private logLostClaim;
    private randomInt;
}
export {};
