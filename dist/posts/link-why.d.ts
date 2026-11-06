import { Prisma } from '@prisma/client';
export declare const MISSING_WHY: readonly ["approval", "removed", "rescue", "rescue_failed", "no_url", "comment_error", "unknown"];
export type MissingWhy = (typeof MISSING_WHY)[number];
export type WhyRow = {
    approvalPendingSince: Date | null;
    verifyDetail: string | null;
    rescueStatus: string | null;
    rescueDetail: string | null;
    facebookUrl: string | null;
    jobItems: Array<{
        error?: string | null;
    }>;
};
export declare function missingWhy(r: WhyRow, now?: Date): {
    code: MissingWhy;
    title: string;
    detail: string;
    todo: string;
};
export declare function missingWhyWhere(code: MissingWhy): Prisma.PostTargetWhereInput;
