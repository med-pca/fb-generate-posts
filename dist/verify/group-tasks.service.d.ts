import { PrismaService } from '../prisma/prisma.service';
import type { CurrentUser } from '../auth/current-user';
import { VerifyService } from './verify.service';
export declare const GROUP_TASK_OUTCOMES: readonly ["done", "already", "not_found", "no_permission", "unreachable"];
export type GroupTaskOutcome = (typeof GROUP_TASK_OUTCOMES)[number];
export declare const SPAM_OUTCOMES: readonly ["done", "nothing", "no_permission", "unreachable"];
export type SpamOutcome = (typeof SPAM_OUTCOMES)[number];
export declare class GroupTasksService {
    private readonly prisma;
    private readonly verify;
    constructor(prisma: PrismaService, verify: VerifyService);
    claimRemovals(profileExternalId: string, limit: number, acting: CurrentUser | null, now?: Date): Promise<{
        tasks: {
            taskId: string;
            kind: "remove";
            member: {
                facebookUserId: string;
                name: string;
            };
            group: {
                name: string;
                url: string;
            };
        }[];
    }>;
    reportRemoval(taskId: string, input: {
        profileExternalId: string;
        outcome: GroupTaskOutcome;
        facebookUserId: string;
        detail?: string;
    }, acting: CurrentUser | null, now?: Date): Promise<{
        taskId: string;
        result: string;
    }>;
    claimApprovals(profileExternalId: string, limit: number, acting: CurrentUser | null, now?: Date): Promise<{
        tasks: {
            taskId: string;
            kind: "approve_post";
            content: string;
            author: {
                name: string;
                facebookUserId: string | null;
            } | null;
            group: {
                name: string;
                externalId: string | null;
                url: string;
            };
        }[];
    }>;
    reportApproval(taskId: string, input: {
        profileExternalId: string;
        outcome: GroupTaskOutcome;
        detail?: string;
    }, acting: CurrentUser | null, now?: Date): Promise<{
        taskId: string;
        result: string;
    }>;
    claimSpam(profileExternalId: string, limit: number, acting: CurrentUser | null, now?: Date): Promise<{
        tasks: {
            taskId: string;
            kind: "release_spam";
            group: {
                name: string;
                url: string;
            };
            members: {
                facebookUserId: string;
                name: string;
            }[];
            max: number;
        }[];
    }>;
    reportSpam(groupId: string, input: {
        profileExternalId: string;
        outcome: SpamOutcome;
        detail?: string;
        released?: Array<{
            facebookUserId: string;
            postUrl?: string;
            text?: string;
        }>;
    }, acting: CurrentUser | null, now?: Date): Promise<{
        groupId: string;
        released: number;
        matched: number;
        refused: number;
    }>;
    suspendedOverview(acting: CurrentUser | null): Promise<{
        id: string;
        name: string;
        facebookUserId: string | null;
        kind: string | null;
        suspendedAt: Date | null;
        detail: string | null;
        groups: number;
        requested: number;
        removed: number;
        failing: number;
        lastError: string | null;
    }[]>;
    private log;
}
