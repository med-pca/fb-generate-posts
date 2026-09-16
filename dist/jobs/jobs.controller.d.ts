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
    listProfiles(): import("@prisma/client").Prisma.PrismaPromise<{
        name: string;
        externalId: string | null;
        id: string;
    }[]>;
    claim(dto: ClaimJobDto): Promise<{
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
    claimBatch(dto: ClaimBatchDto): Promise<{
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
    pendingLinkUpdates(profileExternalId?: string, limit?: string): Promise<{
        jobId: string;
        completedAt: Date | null;
        profile: {
            name: string;
            externalId: string | null;
            id: string;
        };
        group: {
            name: string;
            externalId: string | null;
            id: string;
        };
        updates: {
            postId: string;
            title: string;
            commentExternalId: string | null;
            url: string | null;
        }[];
    }[]>;
    claimByProfileExternalId(profileExternalId: string, groupExternalId?: string): Promise<{
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
    consumed(jobId: string, postId: string): Promise<{
        error: string | null;
        status: import("@prisma/client").$Enums.TargetStatus;
        id: string;
        createdAt: Date;
        updatedAt: Date;
        postId: string;
        publishedAt: Date | null;
        commentExternalId: string | null;
        commentedAt: Date | null;
        linkUpdatedAt: Date | null;
        externalPostUrl: string | null;
        postTargetId: string;
        jobId: string;
    }>;
    published(jobId: string, postId: string, dto: PublishJobItemDto): Promise<{
        error: string | null;
        status: import("@prisma/client").$Enums.TargetStatus;
        id: string;
        createdAt: Date;
        updatedAt: Date;
        postId: string;
        publishedAt: Date | null;
        commentExternalId: string | null;
        commentedAt: Date | null;
        linkUpdatedAt: Date | null;
        externalPostUrl: string | null;
        postTargetId: string;
        jobId: string;
    }>;
    failed(jobId: string, postId: string, dto: FailJobItemDto): Promise<{
        error: string | null;
        status: import("@prisma/client").$Enums.TargetStatus;
        id: string;
        createdAt: Date;
        updatedAt: Date;
        postId: string;
        publishedAt: Date | null;
        commentExternalId: string | null;
        commentedAt: Date | null;
        linkUpdatedAt: Date | null;
        externalPostUrl: string | null;
        postTargetId: string;
        jobId: string;
    }>;
    commented(jobId: string, postId: string, dto: CommentJobItemDto): Promise<{
        error: string | null;
        status: import("@prisma/client").$Enums.TargetStatus;
        id: string;
        createdAt: Date;
        updatedAt: Date;
        postId: string;
        publishedAt: Date | null;
        commentExternalId: string | null;
        commentedAt: Date | null;
        linkUpdatedAt: Date | null;
        externalPostUrl: string | null;
        postTargetId: string;
        jobId: string;
    }>;
    complete(jobId: string): Promise<{
        awaitingLink: number;
        missingComments: number;
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
    linkUpdates(jobId: string): Promise<{
        jobId: string;
        status: "FAILED" | "AWAITING_LINK" | "PARTIALLY_COMPLETED" | "COMPLETED" | "EXPIRED";
        completedAt: Date | null;
        profile: {
            name: string;
            externalId: string | null;
            id: string;
        };
        group: {
            name: string;
            externalId: string | null;
            id: string;
        };
        updates: {
            postId: string;
            title: string;
            commentExternalId: string | null;
            url: string | null;
            externalPostUrl: string | null;
        }[];
    }>;
    linkUpdated(jobId: string, postId: string, dto: LinkUpdatedJobItemDto): Promise<{
        remaining: number;
        error: string | null;
        status: import("@prisma/client").$Enums.TargetStatus;
        id: string;
        createdAt: Date;
        updatedAt: Date;
        postId: string;
        publishedAt: Date | null;
        commentExternalId: string | null;
        commentedAt: Date | null;
        linkUpdatedAt: Date | null;
        externalPostUrl: string | null;
        postTargetId: string;
        jobId: string;
    }>;
}
