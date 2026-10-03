import { ContentSource, PluginState } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CategoriesService } from '../categories/categories.service';
import type { CurrentUser } from '../auth/current-user';
import { CreateSiteDto, UpdateSiteDto } from './dto/site.dto';
export declare function normalizeSiteUrl(value: string): string;
export declare function publicSite(site: ContentSource & {
    _count?: {
        articles: number;
    };
    owner?: {
        username: string;
    } | null;
    category?: {
        id: string;
        name: string;
    } | null;
}): {
    id: string;
    name: string;
    originUrl: string;
    status: import("@prisma/client").$Enums.RecordStatus;
    ownerId: string | null;
    owner: string | null;
    hasOwnKey: boolean;
    categoryId: string | null;
    category: string | null;
    plugin: {
        state: import("@prisma/client").$Enums.PluginState;
        version: string | null;
        message: string | null;
        checkedAt: Date | null;
        lastDeliveryAt: Date | null;
    };
    articles: number;
    createdAt: Date;
};
export declare function pluginBlocker(state: PluginState): string | null;
export declare function siteBlocker(site: {
    pluginState: PluginState;
    categoryId: string | null;
}): string | null;
export declare class SitesService {
    private readonly prisma;
    private readonly categories;
    constructor(prisma: PrismaService, categories: CategoriesService);
    findAll(acting: CurrentUser | null): Promise<{
        id: string;
        name: string;
        originUrl: string;
        status: import("@prisma/client").$Enums.RecordStatus;
        ownerId: string | null;
        owner: string | null;
        hasOwnKey: boolean;
        categoryId: string | null;
        category: string | null;
        plugin: {
            state: import("@prisma/client").$Enums.PluginState;
            version: string | null;
            message: string | null;
            checkedAt: Date | null;
            lastDeliveryAt: Date | null;
        };
        articles: number;
        createdAt: Date;
    }[]>;
    targets(acting: CurrentUser | null): Promise<{
        sites: {
            id: string;
            name: string;
            siteUrl: string;
            category: string | null;
            plugin: import("@prisma/client").$Enums.PluginState;
            ready: boolean;
            reason: string | null;
        }[];
    }>;
    findOne(id: string, acting: CurrentUser | null): Promise<{
        id: string;
        name: string;
        originUrl: string;
        status: import("@prisma/client").$Enums.RecordStatus;
        ownerId: string | null;
        owner: string | null;
        hasOwnKey: boolean;
        categoryId: string | null;
        category: string | null;
        plugin: {
            state: import("@prisma/client").$Enums.PluginState;
            version: string | null;
            message: string | null;
            checkedAt: Date | null;
            lastDeliveryAt: Date | null;
        };
        articles: number;
        createdAt: Date;
    }>;
    create(dto: CreateSiteDto, owner: CurrentUser | null): Promise<{
        id: string;
        name: string;
        originUrl: string;
        status: import("@prisma/client").$Enums.RecordStatus;
        ownerId: string | null;
        owner: string | null;
        hasOwnKey: boolean;
        categoryId: string | null;
        category: string | null;
        plugin: {
            state: import("@prisma/client").$Enums.PluginState;
            version: string | null;
            message: string | null;
            checkedAt: Date | null;
            lastDeliveryAt: Date | null;
        };
        articles: number;
        createdAt: Date;
    }>;
    update(id: string, dto: UpdateSiteDto, acting: CurrentUser | null): Promise<{
        id: string;
        name: string;
        originUrl: string;
        status: import("@prisma/client").$Enums.RecordStatus;
        ownerId: string | null;
        owner: string | null;
        hasOwnKey: boolean;
        categoryId: string | null;
        category: string | null;
        plugin: {
            state: import("@prisma/client").$Enums.PluginState;
            version: string | null;
            message: string | null;
            checkedAt: Date | null;
            lastDeliveryAt: Date | null;
        };
        articles: number;
        createdAt: Date;
    }>;
    remove(id: string, acting: CurrentUser | null): Promise<{
        deleted: boolean;
    }>;
    private load;
    private owned;
}
