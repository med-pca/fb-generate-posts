import type { CurrentUser } from '../auth/current-user';
import { CaptureIngestDto } from './dto/capture-ingest.dto';
import { FailScrapeDto } from './dto/fail-scrape.dto';
import { ScrapeResultDto } from './dto/scrape-result.dto';
import { IngestService } from './ingest.service';
export declare class ScrapeController {
    private readonly ingest;
    constructor(ingest: IngestService);
    capture(dto: CaptureIngestDto, acting: CurrentUser | null): Promise<{
        accepted: boolean;
        ingestId: string;
        status: import("@prisma/client").$Enums.IngestStatus;
        followUrl: string;
    }>;
    claim(acting: CurrentUser | null, profileExternalId?: string): Promise<{
        scrape: null;
        message: string;
    } | {
        scrape: {
            scrapeId: string;
            facebookUrl: string;
            claimExpiresAt: Date;
        };
        message?: undefined;
    }>;
    result(id: string, dto: ScrapeResultDto, acting: CurrentUser | null): Promise<{
        accepted: boolean;
        ingestId: string;
        status: import("@prisma/client").$Enums.IngestStatus;
    }>;
    failed(id: string, dto: FailScrapeDto, acting: CurrentUser | null): Promise<{
        id: string;
        createdAt: Date;
        status: import("@prisma/client").$Enums.IngestStatus;
        updatedAt: Date;
        groupIds: string[];
        ownerId: string | null;
        articleId: string | null;
        claimedAt: Date | null;
        claimExpiresAt: Date | null;
        lastError: string | null;
        facebookUrl: string;
        siteUrl: string;
        generated: import("@prisma/client/runtime/library").JsonValue | null;
        sourceUrl: string;
        language: string;
        fbCaption: string | null;
        fbImageUrl: string | null;
        sourceTitle: string | null;
        sourceText: string | null;
        wpPostId: string | null;
        wpPermalink: string | null;
        profileIds: string[];
        attempts: number;
    }>;
}
