import type { CurrentUser } from '../auth/current-user';
import { VisualsService } from './visuals.service';
export declare class UploadVisualDto {
    imageData: string;
    mimeType: string;
    title?: string;
    caption?: string;
    language?: string | null;
    categoryId?: string;
    groupIds?: string[];
    translate?: boolean;
    createPosts?: boolean;
}
export declare class VisualPostsDto {
    groupIds?: string[];
}
export declare class UpdateVisualDto {
    title?: string;
    caption?: string;
    status?: 'ACTIVE' | 'INACTIVE';
    language?: string | null;
}
export declare class VisualQueryDto {
    page?: number;
    limit?: number;
    language?: string;
    search?: string;
    review?: 'pending' | 'approved';
}
export declare class VisualsController {
    private readonly visuals;
    constructor(visuals: VisualsService);
    list(q: VisualQueryDto, acting: CurrentUser): Promise<{
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
            details: import("@prisma/client/runtime/library").JsonValue | null;
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
    upload(dto: UploadVisualDto, acting: CurrentUser): Promise<{
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
            details: import("@prisma/client/runtime/library").JsonValue | null;
            approvedAt: Date | null;
            targetGroupIds: string[];
        };
        postId: string | null;
        groups: number;
        review: boolean;
    }>;
    posts(id: string, dto: VisualPostsDto, acting: CurrentUser): Promise<{
        postId: string;
        groups: number;
    }>;
    approve(id: string, acting: CurrentUser): Promise<{
        postId: string;
        groups: number;
    }>;
    update(id: string, dto: UpdateVisualDto, acting: CurrentUser): Promise<{
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
        details: import("@prisma/client/runtime/library").JsonValue | null;
        approvedAt: Date | null;
        targetGroupIds: string[];
    }>;
    remove(id: string, acting: CurrentUser): Promise<{
        deleted: boolean;
        postsDeleted: number;
    }>;
}
