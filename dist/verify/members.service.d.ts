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
    private kindWhere;
    markManual(profileGroupIds: string[], state: 'preapproved' | 'clear', acting: CurrentUser | null, now?: Date): Promise<{
        updated: number;
        state: "preapproved" | "clear";
    }>;
    request(kind: MemberKind, scope: {
        profileGroupIds?: string[];
        profileId?: string;
    }, acting: CurrentUser | null, now?: Date): Promise<{
        kind: "approve" | "preapprove";
        requested: number;
        blocked: {
            noFacebookId: number;
            profiles: string[];
        };
        moderators: number;
        moderatorsTotal: number;
    }>;
    preapprovals(query: {
        profileId?: string;
        state?: string;
        search?: string;
    }, acting: CurrentUser | null): Promise<{
        state: string;
        total: number;
        counts: {
            [k: string]: number;
        };
        profiles: {
            id: string;
            name: string;
            createdAt: Date;
            facebookKnown: boolean;
            todo: number;
        }[];
        rows: {
            linkId: string;
            linkedAt: Date;
            profile: {
                id: string;
                name: string;
                createdAt: Date;
                facebookKnown: boolean;
            };
            group: {
                category: {
                    id: string;
                    name: string;
                } | null;
                id: string;
                name: string;
                url: string;
            };
            state: string;
            preApprovedAt: Date | null;
            requestedAt: Date | null;
            error: string | null;
            errorAt: Date | null;
            attempts: number;
            auditPending: boolean;
            audit: {
                state: string;
                at: Date | null;
                detail: string | null;
            } | null;
        }[];
    }>;
    summary(acting: CurrentUser | null): Promise<{
        approve: number;
        approveBlocked: number;
        preapprove: number;
        preapproveBlocked: number;
        requested: number;
        preApproved: number;
    }>;
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
