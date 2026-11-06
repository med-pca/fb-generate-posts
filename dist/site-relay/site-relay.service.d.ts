import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import type { CurrentUser } from '../auth/current-user';
import { WordpressService } from '../wordpress/wordpress.service';
import { WordpressWriterService } from '../ingest/wordpress-writer.service';
export declare const RELAY_PLUGIN_VERSION = "1.6.0";
export declare function versionAtLeast(version: string | null | undefined, wanted: string): boolean;
export declare class SiteRelayService {
    private readonly prisma;
    private readonly config;
    private readonly wordpress;
    private readonly writer?;
    private readonly logger;
    private readonly running;
    constructor(prisma: PrismaService, config: ConfigService, wordpress: WordpressService, writer?: WordpressWriterService | undefined);
    pause(id: string, dto: {
        reason?: string;
        relaySiteId?: string | null;
    }, acting: CurrentUser | null): Promise<{
        copies: number;
        warnings: string[];
        siteId: string;
        name: string;
        pausedAt: Date | null;
        reason: string | null;
        relay: {
            id: string;
            name: string;
            originUrl: string;
        } | null;
        redirect: {
            since: Date | null;
            error: string | null;
            target: string | null;
        };
        running: boolean;
        errors: {
            title: string;
            status: string;
            error: string | null;
        }[];
    }>;
    resume(id: string, acting: CurrentUser | null): Promise<{
        warnings: string[];
        siteId: string;
        name: string;
        pausedAt: Date | null;
        reason: string | null;
        relay: {
            id: string;
            name: string;
            originUrl: string;
        } | null;
        redirect: {
            since: Date | null;
            error: string | null;
            target: string | null;
        };
        running: boolean;
        copies: {
            total: number;
            pending: number;
            done: number;
            failed: number;
            skipped: number;
            movedPosts: number;
        };
        errors: {
            title: string;
            status: string;
            error: string | null;
        }[];
    }>;
    retry(id: string, acting: CurrentUser | null): Promise<{
        siteId: string;
        name: string;
        pausedAt: Date | null;
        reason: string | null;
        relay: {
            id: string;
            name: string;
            originUrl: string;
        } | null;
        redirect: {
            since: Date | null;
            error: string | null;
            target: string | null;
        };
        running: boolean;
        copies: {
            total: number;
            pending: number;
            done: number;
            failed: number;
            skipped: number;
            movedPosts: number;
        };
        errors: {
            title: string;
            status: string;
            error: string | null;
        }[];
    }>;
    redirectNow(id: string, acting: CurrentUser | null): Promise<{
        siteId: string;
        name: string;
        pausedAt: Date | null;
        reason: string | null;
        relay: {
            id: string;
            name: string;
            originUrl: string;
        } | null;
        redirect: {
            since: Date | null;
            error: string | null;
            target: string | null;
        };
        running: boolean;
        copies: {
            total: number;
            pending: number;
            done: number;
            failed: number;
            skipped: number;
            movedPosts: number;
        };
        errors: {
            title: string;
            status: string;
            error: string | null;
        }[];
    }>;
    detail(id: string, acting: CurrentUser | null): Promise<{
        siteId: string;
        name: string;
        pausedAt: Date | null;
        reason: string | null;
        relay: {
            id: string;
            name: string;
            originUrl: string;
        } | null;
        redirect: {
            since: Date | null;
            error: string | null;
            target: string | null;
        };
        running: boolean;
        copies: {
            total: number;
            pending: number;
            done: number;
            failed: number;
            skipped: number;
            movedPosts: number;
        };
        errors: {
            title: string;
            status: string;
            error: string | null;
        }[];
    }>;
    copyArticles(dto: {
        articleIds: string[];
        targetSiteId: string;
        posts?: 'new' | 'move';
    }, acting: CurrentUser | null): Promise<{
        target: {
            id: string;
            name: string;
        };
        postsMode: string;
        planned: number;
        copyIds: string[];
        skipped: {
            title: string;
            reason: string;
        }[];
    }>;
    copies(ids: string[], acting: CurrentUser | null): Promise<{
        total: number;
        pending: number;
        done: number;
        failed: number;
        posts: number;
        rows: {
            id: string;
            title: string;
            target: string;
            status: string;
            error: string | null;
            permalink: string | null;
            posts: number;
            postsMode: string;
        }[];
    }>;
    private readonly manualRunning;
    private startManual;
    private plan;
    private start;
    process(siteId: string): Promise<void>;
    private copyOne;
    private redirectTo;
    private setRedirect;
    private pluginStatus;
    private call;
    private manageable;
    private usable;
    private pausedWithRelay;
}
