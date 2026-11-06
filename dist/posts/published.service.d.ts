import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { CurrentUser } from '../auth/current-user';
import { PublishedQueryDto } from './dto/queue.dto';
export declare function linkState(r: {
    linkUpdatedAt: Date | null;
    commentedAt: Date | null;
    post: {
        url: string | null;
    };
}): "none" | "missing" | "placed" | "waiting";
export declare class PublishedService {
    private readonly prisma;
    constructor(prisma: PrismaService);
    where(q: PublishedQueryDto, acting: CurrentUser | null): Prisma.PostTargetWhereInput;
    audit(q: PublishedQueryDto, acting: CurrentUser | null): Promise<{
        timeZone: string;
        total: number;
        truncated: boolean;
        summary: {
            total: number;
            withUrl: number;
            verify: {
                [k: string]: number;
            };
            link: {
                [k: string]: number;
            };
            missingWhy: {
                [k: string]: number;
            };
            byProfile: {
                id: string;
                name: string;
                count: number;
            }[];
            byGroup: {
                id: string;
                name: string;
                count: number;
            }[];
            byDay: {
                day: string;
                count: number;
            }[];
            byHour: number[];
        };
        rows: {
            targetId: string;
            publishedAt: Date | null;
            post: {
                id: string;
                title: string;
                priority: number;
                url: string | null;
                imageUrl: string | null;
                articleId: string | null;
                visualId: string | null;
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
            profile: {
                id: null;
                name: string;
            } | {
                id: string;
                name: string;
            } | null;
            facebookUrl: string | null;
            link: "none" | "missing" | "placed" | "waiting";
            why: {
                code: import("./link-why").MissingWhy;
                title: string;
                detail: string;
                todo: string;
            } | null;
            verify: {
                status: import("@prisma/client").$Enums.VerifyStatus | null;
                at: Date | null;
                detail: string | null;
                republishCount: number;
            };
            repeatRound: number;
        }[];
        page: number;
        limit: number;
    }>;
    csv(q: PublishedQueryDto, acting: CurrentUser | null): Promise<string>;
}
