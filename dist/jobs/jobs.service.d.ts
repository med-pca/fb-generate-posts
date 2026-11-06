import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { type ClaimProfile } from './claimable';
import { CampaignsService } from '../campaigns/campaigns.service';
import { PrismaService } from '../prisma/prisma.service';
import { ClaimJobDto } from './dto/claim-job.dto';
import { ClaimBatchDto } from './dto/claim-batch.dto';
import { CommentJobItemDto } from './dto/comment-job-item.dto';
import { LinkUpdatedJobItemDto } from './dto/link-updated-job-item.dto';
import { PublishJobItemDto } from './dto/publish-job-item.dto';
import { ApprovalReportDto } from './dto/approval-report.dto';
import type { CurrentUser } from '../auth/current-user';
type ClaimedPost = {
    id: string;
    title: string;
    description: string;
    image: string | null;
    delay: number;
    noComment: boolean;
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
    reason?: EmptyReason;
    diagnosis?: Record<string, unknown>;
};
export type EmptyReason = 'no_group' | 'not_joined' | 'no_post' | 'not_allowed' | 'taken' | 'paused' | 'suspended' | 'quota' | 'rest' | 'group_limits';
type BatchSkip = {
    status: 'busy' | 'empty' | 'error';
    profileExternalId: string;
    profileName: string;
    message?: string;
};
type BatchClaim = {
    status: 'claimed';
} & ClaimedJob;
export { claimablePostWhere, isHouseProfile, mayPublishPost, type ClaimProfile } from './claimable';
export declare function notForcedElsewhere(profileId: string): Prisma.PostTargetWhereInput;
export declare const RATE_LIMITED: RegExp;
export declare function isRateLimited(text: string | null | undefined): boolean;
export declare class JobsService {
    private readonly prisma;
    private readonly config;
    private readonly campaigns?;
    constructor(prisma: PrismaService, config: ConfigService, campaigns?: CampaignsService | undefined);
    listAutomationProfiles(acting?: CurrentUser | null): Prisma.PrismaPromise<{
        id: string;
        name: string;
        externalId: string | null;
    }[]>;
    private reachableJob;
    claim(dto: ClaimJobDto, acting?: CurrentUser | null, limits?: {
        maxCount?: number;
        postId?: string;
        excludeTargetIds?: string[];
    }): Promise<ClaimedJob | EmptyClaim>;
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
    explainNothingToClaim(profile: ClaimProfile, groupExternalId?: string): Promise<{
        reason: EmptyReason;
        message: string;
        diagnosis: Record<string, unknown>;
    }>;
    private paced;
    private pacedGap;
    private pilotMode;
    private currentArticles;
    private byTopPriority;
    private isFinished;
    release(jobId: string, acting?: CurrentUser | null, reason?: string): Promise<{
        jobId: string;
        released: number;
        inProgress: number;
        interrupted: number;
        alreadyClosed: boolean;
    }>;
    markConsumed(jobId: string, postId: string, acting?: CurrentUser | null): Promise<{
        error: string | null;
        id: string;
        createdAt: Date;
        status: import("@prisma/client").$Enums.TargetStatus;
        updatedAt: Date;
        publishedAt: Date | null;
        commentExternalId: string | null;
        commentedAt: Date | null;
        linkUpdatedAt: Date | null;
        postId: string;
        postTargetId: string;
        jobId: string;
        externalPostUrl: string | null;
        campaignId: string | null;
    }>;
    markPublished(jobId: string, postId: string, dto: PublishJobItemDto, acting?: CurrentUser | null): Promise<{
        error: string | null;
        id: string;
        createdAt: Date;
        status: import("@prisma/client").$Enums.TargetStatus;
        updatedAt: Date;
        publishedAt: Date | null;
        commentExternalId: string | null;
        commentedAt: Date | null;
        linkUpdatedAt: Date | null;
        postId: string;
        postTargetId: string;
        jobId: string;
        externalPostUrl: string | null;
        campaignId: string | null;
    }>;
    cycleState(profileId: string, now?: Date): Promise<{
        used: number;
        left: number;
        restUntil: Date | null;
        max: number | null;
        hours: number;
    } | null>;
    private noteCycle;
    private notePendingApproval;
    approvalsDue(profileExternalId: string, acting: CurrentUser | null, limit?: number, now?: Date): Promise<{
        targetId: string;
        jobId: string;
        postId: string;
        content: string;
        willReceiveLink: boolean;
        noComment: boolean;
        group: {
            name: string;
            externalId: string | null;
            url: string;
        };
        pendingSince: Date | null;
        checks: number;
    }[]>;
    private expireApprovals;
    reportApproval(targetId: string, dto: ApprovalReportDto, acting: CurrentUser | null, now?: Date): Promise<{
        result: string;
        jobId?: undefined;
        postId?: undefined;
        externalPostUrl?: undefined;
    } | {
        result: string;
        jobId: string;
        postId: string;
        externalPostUrl: string | null;
    }>;
    private archiveArticleOf;
    markFailed(jobId: string, postId: string, error: string, acting?: CurrentUser | null, requeue?: boolean, blocked?: boolean): Promise<{
        error: string | null;
        id: string;
        createdAt: Date;
        status: import("@prisma/client").$Enums.TargetStatus;
        updatedAt: Date;
        publishedAt: Date | null;
        commentExternalId: string | null;
        commentedAt: Date | null;
        linkUpdatedAt: Date | null;
        postId: string;
        postTargetId: string;
        jobId: string;
        externalPostUrl: string | null;
        campaignId: string | null;
    }>;
    pauseForRateLimit(jobId: string, reason: string, now?: Date): Promise<{
        until: Date;
        released: number;
        unforced: number;
        opened: number;
    } | null>;
    suspendProfile(profileExternalId: string, input: {
        kind: 'disabled' | 'checkpoint' | 'logged_out';
        detail?: string;
        url?: string;
    }, acting: CurrentUser | null): Promise<{
        kind: string;
        released: number;
        opened: number;
    }>;
    private loggedOut;
    reconnected(profileExternalId: string, acting: CurrentUser | null): Promise<{
        reconnected: boolean;
        state: string;
    }>;
    pilotRules(profileId: string, groupIds: string[], now?: Date): Promise<{
        quota: number | null;
        quotaLeft: number | null;
        groups: Map<string, {
            open: boolean;
            left: number | null;
            why: string;
        }>;
        timeZone: string;
    }>;
    private pausedUntil;
    private requeueUnpublished;
    complete(jobId: string, acting?: CurrentUser | null): Promise<{
        awaitingLink: number;
        missingComments: number;
        id: string;
        createdAt: Date;
        status: import("@prisma/client").$Enums.JobStatus;
        updatedAt: Date;
        profileId: string;
        claimedAt: Date;
        claimExpiresAt: Date;
        groupId: string;
        completedAt: Date | null;
    }>;
    markCommented(jobId: string, postId: string, dto: CommentJobItemDto, acting?: CurrentUser | null): Promise<{
        url: string | null;
        error: string | null;
        id: string;
        createdAt: Date;
        status: import("@prisma/client").$Enums.TargetStatus;
        updatedAt: Date;
        publishedAt: Date | null;
        commentExternalId: string | null;
        commentedAt: Date | null;
        linkUpdatedAt: Date | null;
        postId: string;
        postTargetId: string;
        jobId: string;
        externalPostUrl: string | null;
        campaignId: string | null;
    }>;
    linkUpdates(jobId: string, acting?: CurrentUser | null): Promise<{
        jobId: string;
        status: "FAILED" | "COMPLETED" | "AWAITING_LINK" | "PARTIALLY_COMPLETED" | "EXPIRED";
        completedAt: Date | null;
        profile: {
            id: string;
            name: string;
            externalId: string | null;
        };
        group: {
            id: string;
            name: string;
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
            id: string;
            name: string;
            externalId: string | null;
        };
        group: {
            id: string;
            name: string;
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
        createdAt: Date;
        status: import("@prisma/client").$Enums.TargetStatus;
        updatedAt: Date;
        publishedAt: Date | null;
        commentExternalId: string | null;
        commentedAt: Date | null;
        linkUpdatedAt: Date | null;
        postId: string;
        postTargetId: string;
        jobId: string;
        externalPostUrl: string | null;
        campaignId: string | null;
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
