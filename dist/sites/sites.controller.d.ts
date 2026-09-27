import type { CurrentUser } from '../auth/current-user';
import { CreateSiteDto, UpdateSiteDto } from './dto/site.dto';
import { SitesService } from './sites.service';
export declare class SitesController {
    private readonly sites;
    constructor(sites: SitesService);
    findAll(acting: CurrentUser): Promise<{
        id: string;
        name: string;
        originUrl: string;
        status: import("@prisma/client").$Enums.RecordStatus;
        ownerId: string | null;
        owner: string | null;
        hasOwnKey: boolean;
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
        }[];
    }>;
}
