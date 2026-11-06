import type { CurrentUser } from '../auth/current-user';
import { SiteRelayService } from './site-relay.service';
export declare class PauseSiteDto {
    reason?: string;
    relaySiteId?: string;
}
export declare class CopyArticlesDto {
    articleIds: string[];
    targetSiteId: string;
    posts?: 'new' | 'move';
}
export declare class ArticleCopiesController {
    private readonly relay;
    constructor(relay: SiteRelayService);
    copy(dto: CopyArticlesDto, acting: CurrentUser): Promise<{
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
    status(ids: string | undefined, acting: CurrentUser): Promise<{
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
}
export declare class SiteRelayController {
    private readonly relay;
    constructor(relay: SiteRelayService);
    detail(id: string, acting: CurrentUser): Promise<{
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
    pause(id: string, dto: PauseSiteDto, acting: CurrentUser): Promise<{
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
    resume(id: string, acting: CurrentUser): Promise<{
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
    retry(id: string, acting: CurrentUser): Promise<{
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
    redirect(id: string, acting: CurrentUser): Promise<{
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
}
export declare class SiteRelayModule {
}
