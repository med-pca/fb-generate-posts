import { ContentSource } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
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
}): {
    id: string;
    name: string;
    originUrl: string;
    status: import("@prisma/client").$Enums.RecordStatus;
    ownerId: string | null;
    owner: string | null;
    hasOwnKey: boolean;
    articles: number;
    createdAt: Date;
};
export declare class SitesService {
    private readonly prisma;
    constructor(prisma: PrismaService);
    findAll(acting: CurrentUser | null): Promise<{
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
    targets(acting: CurrentUser | null): Promise<{
        sites: {
            id: string;
            name: string;
            siteUrl: string;
        }[];
    }>;
    create(dto: CreateSiteDto, owner: CurrentUser | null): Promise<{
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
    update(id: string, dto: UpdateSiteDto, acting: CurrentUser | null): Promise<{
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
    remove(id: string, acting: CurrentUser | null): Promise<{
        deleted: boolean;
    }>;
    private load;
    private owned;
}
