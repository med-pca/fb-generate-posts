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
    heartbeat(profileExternalId: string, dto: HeartbeatDto, acting: CurrentUser | null, apiKey?: string): Promise<{
        facebookSuspension: string | null;
        sleepUntil: string | null;
        run: boolean;
        reason: string;
        mode: import("@prisma/client").RunnerMode;
        pollAfterSeconds: number;
        settings: import("@prisma/client/runtime/library").JsonValue | null;
        serverTime: string;
        window: string;
    }>;
    autoPair(dto: AutoPairDto, acting: CurrentUser | null, apiKey?: string): Promise<{
        profileExternalId: string;
        profileName: string;
        profileActive: boolean;
        created: boolean;
    }>;
    launcher(acting: CurrentUser | null, agent?: string, version?: string, os?: string, running?: string): Promise<{
        nstApiKey: string | null;
        pollAfterSeconds: number;
        serverTime: string;
        profiles: {
            externalId: string;
            name: string;
            shouldRun: boolean;
            reason: string;
            resting: boolean;
            moveTo: {
                groupId: string | null;
                groupName: string;
                why: string;
            } | null;
            sleepUntil: Date | null;
            mayClose: boolean;
            forceClose: boolean;
            workerRunning: boolean;
            workerSeenAt: Date | null;
            browserState: import("@prisma/client").$Enums.BrowserState;
            nstApiKey: string | null;
        }[];
    }>;
    syncProfiles(dto: SyncProfilesDto, acting: CurrentUser | null): Promise<{
        created: never[];
        existing: number;
        received: number;
        renamed?: undefined;
    } | {
        created: {
            externalId: string;
            name: string;
        }[];
        renamed: {
            externalId: string;
            from: string;
            to: string;
        }[];
        existing: number;
        received: number;
    }>;
    reportBrowser(profileExternalId: string, dto: BrowserReportDto, acting: CurrentUser | null): Promise<import("./runners.service").Decision>;
}
