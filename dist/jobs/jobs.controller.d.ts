import type { CurrentUser } from '../auth/current-user';
import { ClaimJobDto } from './dto/claim-job.dto';
import { ClaimBatchDto } from './dto/claim-batch.dto';
import { CommentJobItemDto } from './dto/comment-job-item.dto';
import { FailJobItemDto } from './dto/fail-job-item.dto';
import { LinkUpdatedJobItemDto } from './dto/link-updated-job-item.dto';
import { PublishJobItemDto } from './dto/publish-job-item.dto';
import { JobsService } from './jobs.service';
export declare class JobsController {
    private readonly jobs;
    constructor(jobs: JobsService);
    listProfiles(acting: CurrentUser | null): import("@prisma/client").Prisma.PrismaPromise<{
        name: string;
        id: string;
        externalId: string | null;
    }[]>;
    claim(dto: ClaimJobDto, acting: CurrentUser | null): Promise<{
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
            image: string | null;
            delay: number;
            comment: {
                text: string;
                willReceiveLink: boolean;
            };
        }[];
    } | {
        job: null;
        posts: {
            id: string;
            title: string;
            description: string;
            image: string | null;
            delay: number;
            comment: {
                text: string;
                willReceiveLink: boolean;
            };
        }[];
        message?: string;
        activeJobId?: string;
    }>;
    claimBatch(dto: ClaimBatchDto, acting: CurrentUser | null): Promise<{
        requested: number;
        claimed: number;
        jobs: never[];
        skipped: never[];
        posts?: undefined;
    } | {
        requested: number;
        claimed: number;
        posts: number;
        jobs: ({
            status: "claimed";
        } & {
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
                image: string | null;
                delay: number;
                comment: {
                    text: string;
                    willReceiveLink: boolean;
                };
            }[];
        })[];
        skipped: {
            status: "busy" | "empty" | "error";
            profileExternalId: string;
            profileName: string;
            message?: string;
        }[];
    }>;
    pendingLinkUpdates(acting: CurrentUser | null, profileExternalId?: string, limit?: string): Promise<{
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
    claimByProfileExternalId(profileExternalId: string, acting: CurrentUser | null, groupExternalId?: string): Promise<{
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
            image: string | null;
            delay: number;
            comment: {
                text: string;
                willReceiveLink: boolean;
            };
        }[];
    } | {
        job: null;
        posts: {
            id: string;
            title: string;
            description: string;
            image: string | null;
            delay: number;
            comment: {
                text: string;
                willReceiveLink: boolean;
            };
        }[];
        message?: string;
        activeJobId?: string;
    }>;
    consumed(jobId: string, postId: string, acting: CurrentUser | null): Promise<{
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
    published(jobId: string, postId: string, dto: PublishJobItemDto, acting: CurrentUser | null): Promise<{
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
    failed(jobId: string, postId: string, dto: FailJobItemDto, acting: CurrentUser | null): Promise<{
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
    commented(jobId: string, postId: string, dto: CommentJobItemDto, acting: CurrentUser | null): Promise<{
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
    complete(jobId: string, acting: CurrentUser | null): Promise<{
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
    linkUpdates(jobId: string, acting: CurrentUser | null): Promise<{
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
    linkUpdated(jobId: string, postId: string, dto: LinkUpdatedJobItemDto, acting: CurrentUser | null): Promise<{
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
}
