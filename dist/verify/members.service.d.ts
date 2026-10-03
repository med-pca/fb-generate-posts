import { PrismaService } from '../prisma/prisma.service';
import type { CurrentUser } from '../auth/current-user';
import { VerifyService } from './verify.service';
export declare const MEMBER_KINDS: readonly ["approve", "preapprove"];
export type MemberKind = (typeof MEMBER_KINDS)[number];
export declare const MEMBER_OUTCOMES: readonly ["done", "already", "not_found", "no_permission", "unreachable"];
export type MemberOutcome = (typeof MEMBER_OUTCOMES)[number];
export declare class MembersService {
    private readonly prisma;
    private readonly verify;
    constructor(prisma: PrismaService, verify: VerifyService);
    private dueWhere;
    claim(profileExternalId: string, limit: number, acting: CurrentUser | null, now?: Date): Promise<{
        tasks: {
            taskId: string;
            kind: MemberKind;
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
        kind: MemberKind;
        outcome: MemberOutcome;
        facebookUserId: string;
        detail?: string;
    }, acting: CurrentUser | null, now?: Date): Promise<{
        taskId: string;
        result: string;
    }>;
    private log;
    overview(acting: CurrentUser | null, now?: Date): Promise<{
        due: number;
        preApproved: number;
        approved: number;
        unknownIdentity: number;
        problems: {
            taskId: string;
            kind: string;
            error: string | null;
            at: Date | null;
            attempts: number;
            gaveUp: boolean;
            profile: {
                id: string;
                name: string;
            };
            group: {
                id: string;
                name: string;
                url: string;
            };
        }[];
    }>;
    retry(taskId: string, acting: CurrentUser | null): Promise<{
        taskId: string;
        result: string;
    }>;
}
