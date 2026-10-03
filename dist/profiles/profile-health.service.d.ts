import { PrismaService } from '../prisma/prisma.service';
import type { CurrentUser } from '../auth/current-user';
import { JobsService } from '../jobs/jobs.service';
import type { HealthInput } from './profile-health';
export declare class ProfileHealthService {
    private readonly prisma;
    private readonly jobs;
    constructor(prisma: PrismaService, jobs: JobsService);
    inputs(ids: string[], now?: Date): Promise<Map<string, HealthInput>>;
    all(acting: CurrentUser | null, now?: Date): Promise<Map<string, {
        input: HealthInput;
        score: number | null;
        label: import("./profile-health").HealthLabel;
        successRate: number | null;
        verifyRate: number | null;
        linkRate: number | null;
        suggestDeactivate: boolean;
        reasons: string[];
    }>>;
    private reachable;
    detail(id: string, acting: CurrentUser | null, now?: Date): Promise<{
        profile: {
            id: string;
            name: string;
            status: import("@prisma/client").$Enums.RecordStatus;
            externalId: string | null;
            facebookUserId: string | null;
            isModerator: boolean;
            runner: {
                lastSeenAt: Date | null;
                mode: import("@prisma/client").$Enums.RunnerMode;
                message: string | null;
                running: boolean;
                browserState: import("@prisma/client").$Enums.BrowserState;
            } | null;
        };
        health: {
            labelText: string;
            windowDays: number;
            input: HealthInput;
            score: number | null;
            label: import("./profile-health").HealthLabel;
            successRate: number | null;
            verifyRate: number | null;
            linkRate: number | null;
            suggestDeactivate: boolean;
            reasons: string[];
        };
        totals: {
            today: number;
            week: number;
            month: number;
            total: number;
            failedWeek: number;
            failedMonth: number;
            failedTotal: number;
            lastPublishedAt: Date | null;
            lastFailedAt: Date | null;
        };
        days: {
            day: string;
            published: number;
            failed: number;
        }[];
        groups: {
            id: string;
            name: string;
            published: number;
            failed: number;
            lastError: string | null;
        }[];
        errors: {
            error: string;
            count: number;
        }[];
        failures: {
            at: Date;
            error: string | null;
            postTargetId: string;
            post: string;
            group: string;
        }[];
        joins: {
            [k: string]: number;
        };
        preApproved: number;
        transfer: {
            forcedTargets: number;
            ownedPosts: number;
            activeJobs: number;
            groupsWaiting: number;
            orphanGroups: {
                id: string;
                name: string;
                url: string;
            }[];
            candidates: {
                id: string;
                name: string;
                score: number | null;
                label: import("./profile-health").HealthLabel;
                labelText: string;
                running: boolean;
                groupsCovered: number;
                coverage: number;
            }[];
            recommendedId: string | null;
        };
    }>;
    transferPlan(id: string, acting: CurrentUser | null, now?: Date): Promise<{
        forcedTargets: number;
        ownedPosts: number;
        activeJobs: number;
        groupsWaiting: number;
        orphanGroups: {
            id: string;
            name: string;
            url: string;
        }[];
        candidates: {
            id: string;
            name: string;
            score: number | null;
            label: import("./profile-health").HealthLabel;
            labelText: string;
            running: boolean;
            groupsCovered: number;
            coverage: number;
        }[];
        recommendedId: string | null;
    }>;
    deactivate(id: string, transferTo: string | null | undefined, acting: CurrentUser | null, now?: Date): Promise<{
        released: number;
        transferredTo: {
            id: string;
            name: string;
        } | null;
        forcedMoved: number;
        forcedCleared: number;
        postsOpened: number;
        prioritised: number;
        orphanGroups: {
            id: string;
            name: string;
            url: string;
        }[];
    }>;
}
