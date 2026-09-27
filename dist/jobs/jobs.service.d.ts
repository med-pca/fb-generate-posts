import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ClaimJobDto } from './dto/claim-job.dto';
import { ClaimBatchDto } from './dto/claim-batch.dto';
import { CommentJobItemDto } from './dto/comment-job-item.dto';
import { LinkUpdatedJobItemDto } from './dto/link-updated-job-item.dto';
import { PublishJobItemDto } from './dto/publish-job-item.dto';
import { SettingsService } from '../settings/settings.service';
import type { CurrentUser } from '../auth/current-user';
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
    listAutomationProfiles(acting?: CurrentUser | null): Prisma.PrismaPromise<{
        name: string;
        id: string;
        externalId: string | null;
    }[]>;
    private reachableJob;
    claim(dto: ClaimJobDto, acting?: CurrentUser | null): Promise<ClaimedJob | EmptyClaim>;
    claimBatch({ profileExternalIds, limit }: ClaimBatchDto, acting?: CurrentUser | null): Promise<{
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
    claimByProfileExternalId(profileExternalId: string, groupExternalId?: string, acting?: CurrentUser | null): Promise<ClaimedJob | EmptyClaim>;
    markConsumed(jobId: string, postId: string, acting?: CurrentUser | null): Promise<{
        error: string | null;
        id: string;
        status: import("@prisma/client").$Enums.TargetStatus;
        createdAt: Date;
        updatedAt: Date;
        publishedAt: Date | null;
        commentExternalId: string | null;
        commentedAt: Date | null;
        linkUpdatedAt: Date | null;
        postId: string;
        postTargetId: string;
        jobId: string;
        externalPostUrl: string | null;
    }>;
    markPublished(jobId: string, postId: string, dto: PublishJobItemDto, acting?: CurrentUser | null): Promise<{
        error: string | null;
        id: string;
        status: import("@prisma/client").$Enums.TargetStatus;
        createdAt: Date;
        updatedAt: Date;
        publishedAt: Date | null;
        commentExternalId: string | null;
        commentedAt: Date | null;
        linkUpdatedAt: Date | null;
        postId: string;
        postTargetId: string;
        jobId: string;
        externalPostUrl: string | null;
    }>;
    markFailed(jobId: string, postId: string, error: string, acting?: CurrentUser | null): Promise<{
        error: string | null;
        id: string;
        status: import("@prisma/client").$Enums.TargetStatus;
        createdAt: Date;
        updatedAt: Date;
        publishedAt: Date | null;
        commentExternalId: string | null;
        commentedAt: Date | null;
        linkUpdatedAt: Date | null;
        postId: string;
        postTargetId: string;
        jobId: string;
        externalPostUrl: string | null;
    }>;
    complete(jobId: string, acting?: CurrentUser | null): Promise<{
        awaitingLink: number;
        missingComments: number;
        id: string;
        status: import("@prisma/client").$Enums.JobStatus;
        createdAt: Date;
        updatedAt: Date;
        profileId: string;
        claimedAt: Date;
        claimExpiresAt: Date;
        groupId: string;
        completedAt: Date | null;
    }>;
    markCommented(jobId: string, postId: string, dto: CommentJobItemDto, acting?: CurrentUser | null): Promise<{
        error: string | null;
        id: string;
        status: import("@prisma/client").$Enums.TargetStatus;
        createdAt: Date;
        updatedAt: Date;
        publishedAt: Date | null;
        commentExternalId: string | null;
        commentedAt: Date | null;
        linkUpdatedAt: Date | null;
        postId: string;
        postTargetId: string;
        jobId: string;
        externalPostUrl: string | null;
    }>;
    linkUpdates(jobId: string, acting?: CurrentUser | null): Promise<{
        jobId: string;
        status: "FAILED" | "COMPLETED" | "AWAITING_LINK" | "PARTIALLY_COMPLETED" | "EXPIRED";
        completedAt: Date | null;
        profile: {
            name: string;
            id: string;
            externalId: string | null;
        };
        group: {
            name: string;
            id: string;
            externalId: string | null;
        };
        updates: {
            postId: string;
            title: string;
            commentExternalId: string | null;
            url: string | null;
            externalPostUrl: string | null;
        }[];
    }>;
    pendingLinkUpdates(profileExternalId: string | undefined, limit: number, acting?: CurrentUser | null): Promise<{
        jobId: string;
        completedAt: Date | null;
        profile: {
            name: string;
            id: string;
            externalId: string | null;
        };
        group: {
            name: string;
            id: string;
            externalId: string | null;
        };
        updates: {
            postId: string;
            title: string;
            commentExternalId: string | null;
            url: string | null;
        }[];
    }[]>;
    markLinkUpdated(jobId: string, postId: string, dto: LinkUpdatedJobItemDto, acting?: CurrentUser | null): Promise<{
        remaining: number;
        error: string | null;
        id: string;
        status: import("@prisma/client").$Enums.TargetStatus;
        createdAt: Date;
        updatedAt: Date;
        publishedAt: Date | null;
        commentExternalId: string | null;
        commentedAt: Date | null;
        linkUpdatedAt: Date | null;
        postId: string;
        postTargetId: string;
        jobId: string;
        externalPostUrl: string | null;
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
