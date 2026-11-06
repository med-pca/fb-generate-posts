import { PrismaService } from '../prisma/prisma.service';
import type { CurrentUser } from '../auth/current-user';
import { VerifyService } from './verify.service';
export declare const AUDIT_OUTCOMES: readonly ["already", "not_done", "fixed", "no_permission", "not_found", "unreachable"];
export type AuditOutcome = (typeof AUDIT_OUTCOMES)[number];
export declare class AuditService {
    private readonly prisma;
    private readonly verify;
    constructor(prisma: PrismaService, verify: VerifyService);
    private eligible;
    request(input: {
        mode: 'check' | 'fix';
        profileGroupIds?: string[];
        profileId?: string;
    }, acting: CurrentUser | null, now?: Date): Promise<{
        requested: number;
        moderators: number;
    }>;
    claim(profileExternalId: string, limit: number, acting: CurrentUser | null, now?: Date): Promise<{
        tasks: {
            taskId: string;
            mode: string;
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
    report(taskId: string, input: {
        profileExternalId: string;
        outcome: AuditOutcome;
        facebookUserId: string;
        detail?: string;
    }, acting: CurrentUser | null, now?: Date): Promise<{
        taskId: string;
        state: null;
        result: string;
    } | {
        taskId: string;
        state: string;
        result: string;
    }>;
    results(acting: CurrentUser | null, profileId?: string): Promise<{
        summary: {
            pending: number;
            preApproved: number;
            notPreApproved: number;
            noPermission: number;
            notFound: number;
        };
        rows: {
            taskId: string;
            profile: {
                id: string;
                name: string;
            };
            group: {
                id: string;
                name: string;
                url: string;
            };
            pending: boolean;
            mode: string | null;
            state: string | null;
            checkedAt: Date | null;
            detail: string | null;
        }[];
    }>;
}
