import { CaptureIngestDto } from './dto/capture-ingest.dto';
import { FailScrapeDto } from './dto/fail-scrape.dto';
import { ScrapeResultDto } from './dto/scrape-result.dto';
import { IngestService } from './ingest.service';
export declare class ScrapeController {
    private readonly ingest;
    constructor(ingest: IngestService);
    capture(dto: CaptureIngestDto): Promise<{
        accepted: boolean;
        ingestId: string;
        status: import("@prisma/client").$Enums.IngestStatus;
        followUrl: string;
    }>;
    claim(profileExternalId?: string): Promise<{
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
    result(id: string, dto: ScrapeResultDto): Promise<{
        accepted: boolean;
        ingestId: string;
        status: import("@prisma/client").$Enums.IngestStatus;
    }>;
    failed(id: string, dto: FailScrapeDto): Promise<{
        groupIds: string[];
        status: import("@prisma/client").$Enums.IngestStatus;
        id: string;
        createdAt: Date;
        updatedAt: Date;
        articleId: string | null;
        claimedAt: Date | null;
        claimExpiresAt: Date | null;
        lastError: string | null;
        siteUrl: string;
        facebookUrl: string;
        sourceUrl: string;
        language: string;
        fbCaption: string | null;
        fbImageUrl: string | null;
        sourceTitle: string | null;
        sourceText: string | null;
        generated: import("@prisma/client/runtime/library").JsonValue | null;
        wpPostId: string | null;
        wpPermalink: string | null;
        profileIds: string[];
        attempts: number;
    }>;
}
