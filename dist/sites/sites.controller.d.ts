import type { CurrentUser } from '../auth/current-user';
import { CreateSiteDto, UpdateSiteDto } from './dto/site.dto';
import { SitesService } from './sites.service';
import { PluginCheckService } from './plugin-check.service';
export declare class SitesController {
    private readonly sites;
    private readonly plugins;
    constructor(sites: SitesService, plugins: PluginCheckService);
    checkAll(acting: CurrentUser): Promise<{
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
    check(id: string, acting: CurrentUser): Promise<{
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
    findAll(acting: CurrentUser): Promise<{
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
    create(dto: CreateSiteDto, acting: CurrentUser): Promise<{
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
    update(id: string, dto: UpdateSiteDto, acting: CurrentUser): Promise<{
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
    remove(id: string, acting: CurrentUser): Promise<{
        deleted: boolean;
    }>;
}
export declare class SiteTargetsController {
    private readonly sites;
    constructor(sites: SitesService);
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
}
