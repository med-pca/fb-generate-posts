import { ClaimJobDto } from './dto/claim-job.dto';
import { FailJobItemDto } from './dto/fail-job-item.dto';
import { PublishJobItemDto } from './dto/publish-job-item.dto';
import { JobsService } from './jobs.service';
export declare class JobsController {
    private readonly jobs;
    constructor(jobs: JobsService);
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
    consumed(jobId: string, postId: string): Promise<{
        error: string | null;
        status: import("@prisma/client").$Enums.TargetStatus;
        id: string;
        createdAt: Date;
        updatedAt: Date;
        publishedAt: Date | null;
        postId: string;
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
        publishedAt: Date | null;
        postId: string;
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
}
