import type { CurrentUser } from '../auth/current-user';
import { BrowserReportDto } from './dto/browser-report.dto';
import { HeartbeatDto } from './dto/heartbeat.dto';
import { SyncProfilesDto } from './dto/sync-profiles.dto';
import { AutoPairDto } from './dto/auto-pair.dto';
import { RunnersService } from './runners.service';
export declare class ControlController {
    private readonly runners;
    constructor(runners: RunnersService);
    control(profileExternalId: string, acting: CurrentUser | null): Promise<import("./runners.service").Decision>;
    heartbeat(profileExternalId: string, dto: HeartbeatDto, acting: CurrentUser | null, apiKey?: string): Promise<import("./runners.service").Decision>;
    autoPair(dto: AutoPairDto, acting: CurrentUser | null, apiKey?: string): Promise<{
        profileExternalId: string;
        profileName: string;
        profileActive: boolean;
        created: boolean;
    }>;
    launcher(acting: CurrentUser | null): Promise<{
        nstApiKey: string | null;
        pollAfterSeconds: number;
        serverTime: string;
        profiles: {
            externalId: string;
            name: string;
            shouldRun: boolean;
            reason: string;
            mayClose: boolean;
            workerRunning: boolean;
            workerSeenAt: Date | null;
            browserState: import("@prisma/client").$Enums.BrowserState;
            nstApiKey: string | null;
        }[];
    }>;
    syncProfiles(dto: SyncProfilesDto, acting: CurrentUser | null): Promise<{
        created: {
            externalId: string;
            name: string;
        }[];
        existing: number;
        received: number;
    }>;
    reportBrowser(profileExternalId: string, dto: BrowserReportDto, acting: CurrentUser | null): Promise<import("./runners.service").Decision>;
}
