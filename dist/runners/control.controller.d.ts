import type { CurrentUser } from '../auth/current-user';
import { BrowserReportDto } from './dto/browser-report.dto';
import { HeartbeatDto } from './dto/heartbeat.dto';
import { RunnersService } from './runners.service';
export declare class ControlController {
    private readonly runners;
    constructor(runners: RunnersService);
    control(profileExternalId: string, acting: CurrentUser | null): Promise<import("./runners.service").Decision>;
    heartbeat(profileExternalId: string, dto: HeartbeatDto, acting: CurrentUser | null): Promise<import("./runners.service").Decision>;
    launcher(acting: CurrentUser | null): Promise<{
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
        }[];
    }>;
    reportBrowser(profileExternalId: string, dto: BrowserReportDto, acting: CurrentUser | null): Promise<import("./runners.service").Decision>;
}
