import { PrismaService } from '../prisma/prisma.service';
import type { CurrentUser } from '../auth/current-user';
export declare const MAX_RESCUES = 2;
export declare class RescueService {
    private readonly prisma;
    constructor(prisma: PrismaService);
    private rescuersWhere;
    private authorOf;
    private sweptAt;
    sweep(now?: Date, force?: boolean): Promise<{
        requested: number;
        gaveUp: number;
    }>;
    authorGaveUp(jobId: string, postId: string, now?: Date): Promise<boolean>;
    request(targetId: string, reason: string, now?: Date): Promise<boolean>;
    due(profileExternalId: string, acting: CurrentUser | null, limit?: number, now?: Date): Promise<{
        targetId: string;
        postId: string;
        postUrl: string;
        url: string;
        title: string;
        group: string;
    }[]>;
    report(targetId: string, profileExternalId: string, input: {
        outcome: 'done' | 'already' | 'failed';
        detail?: string;
        commentExternalId?: string;
    }, acting: CurrentUser | null, now?: Date): Promise<{
        targetId: string;
        result: string;
    }>;
}
