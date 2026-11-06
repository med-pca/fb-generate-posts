import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { CurrentUser } from '../auth/current-user';
import { RewriterService } from '../ingest/rewriter.service';
import { ImageTranslatorService } from '../ingest/image-translator.service';
export type ImageInput = {
    data: string;
    mimeType: string;
};
export type BuildOptions = {
    image: ImageInput;
    language?: string | null;
    translate: boolean;
    caption?: string | null;
    title?: string | null;
    fbCaption?: string | null;
    categoryId?: string | null;
    groupIds?: string[];
    createPosts: boolean;
    review?: boolean;
    origin: 'capture' | 'upload';
    ingestId?: string | null;
    ownerId?: string | null;
};
export declare class VisualsService {
    private readonly prisma;
    private readonly config;
    private readonly rewriter;
    private readonly images;
    private readonly logger;
    constructor(prisma: PrismaService, config: ConfigService, rewriter: RewriterService, images: ImageTranslatorService);
    audience(opts: {
        groupIds?: string[];
        language?: string | null;
        categoryId?: string | null;
    }, acting?: CurrentUser | null): Promise<{
        id: string;
    }[]>;
    create(opts: BuildOptions, acting?: CurrentUser | null): Promise<{
        visual: {
            language: string | null;
            id: string;
            createdAt: Date;
            status: import("@prisma/client").$Enums.RecordStatus;
            updatedAt: Date;
            categoryId: string | null;
            title: string;
            ownerId: string | null;
            hashtags: string[];
            imageUrl: string;
            caption: string;
            origin: string;
            ingestId: string | null;
            details: Prisma.JsonValue | null;
            approvedAt: Date | null;
            targetGroupIds: string[];
        };
        postId: string | null;
        groups: number;
        review: boolean;
    }>;
    private postFor;
    createPosts(id: string, opts: {
        groupIds?: string[];
    }, acting: CurrentUser | null): Promise<{
        postId: string;
        groups: number;
    }>;
    approve(id: string, acting: CurrentUser | null): Promise<{
        postId: string;
        groups: number;
    }>;
    list(q: {
        page?: number;
        limit?: number;
        language?: string;
        search?: string;
        review?: string;
    }, acting: CurrentUser | null): Promise<{
        data: {
            posts: number;
            groups: number;
            published: number;
            waiting: number;
            category: {
                id: string;
                name: string;
            } | null;
            language: string | null;
            id: string;
            createdAt: Date;
            status: import("@prisma/client").$Enums.RecordStatus;
            updatedAt: Date;
            categoryId: string | null;
            title: string;
            ownerId: string | null;
            hashtags: string[];
            imageUrl: string;
            caption: string;
            origin: string;
            ingestId: string | null;
            details: Prisma.JsonValue | null;
            approvedAt: Date | null;
            targetGroupIds: string[];
        }[];
        meta: {
            page: number;
            limit: number;
            total: number;
            pages: number;
        };
        pending: {
            total: number;
            byLanguage: {
                [k: string]: number;
            };
        };
    }>;
    update(id: string, dto: {
        title?: string;
        caption?: string;
        status?: 'ACTIVE' | 'INACTIVE';
        language?: string | null;
    }, acting: CurrentUser | null): Promise<{
        language: string | null;
        id: string;
        createdAt: Date;
        status: import("@prisma/client").$Enums.RecordStatus;
        updatedAt: Date;
        categoryId: string | null;
        title: string;
        ownerId: string | null;
        hashtags: string[];
        imageUrl: string;
        caption: string;
        origin: string;
        ingestId: string | null;
        details: Prisma.JsonValue | null;
        approvedAt: Date | null;
        targetGroupIds: string[];
    }>;
    remove(id: string, acting: CurrentUser | null): Promise<{
        deleted: boolean;
        postsDeleted: number;
    }>;
    private where;
    private reachable;
    private store;
}
