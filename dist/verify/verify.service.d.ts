import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import type { CurrentUser } from '../auth/current-user';
export declare const VERIFY_OUTCOMES: readonly ["ok", "missing_post", "missing_link", "pending", "unreachable"];
export type VerifyOutcome = (typeof VERIFY_OUTCOMES)[number];
export declare class VerifyService {
    private readonly prisma;
    private readonly config;
    constructor(prisma: PrismaService, config: ConfigService);
    private verifyAfterMinutes;
    moderator(profileExternalId: string, acting: CurrentUser | null): Promise<{
        id: string;
        name: string;
        status: import("@prisma/client").$Enums.RecordStatus;
        isModerator: boolean;
    }>;
    private dueWhere;
    claim(profileExternalId: string, limit: number, acting: CurrentUser | null, now?: Date): Promise<{
        verifyAfterMinutes: number;
        tasks: {
            targetId: string;
            postUrl: string | null;
            postText: string;
            postTitle: string;
            linkUrl: string | null;
            author: string;
            group: {
                name: string;
                url: string;
            };
            publishedAt: Date | null;
            republishCount: number;
        }[];
    }>;
    report(targetId: string, input: {
        profileExternalId: string;
        outcome: VerifyOutcome;
        detail?: string;
        deleted?: boolean;
        postUrl?: string;
    }, acting: CurrentUser | null, now?: Date): Promise<{
        targetId: string;
        result: string;
    }>;
    private target;
    private retryLater;
    private needsAction;
    private republish;
    review(acting: CurrentUser | null): Promise<{
        targetId: string;
        detail: string | null;
        since: Date;
        republishCount: number;
        post: {
            id: string;
            description: string;
            title: string;
            imageUrl: string | null;
            priority: number;
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
        facebookUrl: string | null;
    }[]>;
    resolve(targetId: string, action: 'ok' | 'republish', acting: CurrentUser | null, now?: Date): Promise<{
        targetId: string;
        result: string;
    }>;
    setModerator(profileId: string, patch: {
        isModerator?: boolean;
        facebookUserId?: string;
    }, acting: CurrentUser | null): Promise<{
        id: string;
        name: string;
        isModerator: boolean;
        facebookUserId: string | null;
    }>;
    stats(acting: CurrentUser | null, now?: Date): Promise<{
        due: number;
        verified: number;
        republished: number;
        needsAction: number;
        verifyAfterMinutes: number;
    }>;
}
