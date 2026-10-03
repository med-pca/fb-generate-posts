import type { CurrentUser } from '../auth/current-user';
import { JobsService } from './jobs.service';
export declare class AdminJobsController {
    private readonly jobs;
    constructor(jobs: JobsService);
    release(jobId: string, acting: CurrentUser): Promise<{
        jobId: string;
        released: number;
        inProgress: number;
        alreadyClosed: boolean;
    }>;
}
