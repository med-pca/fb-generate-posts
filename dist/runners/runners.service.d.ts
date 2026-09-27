import { Prisma, RunnerMode } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { CurrentUser } from '../auth/current-user';
import { UpdateRunnerDto } from './dto/update-runner.dto';
import { HeartbeatDto } from './dto/heartbeat.dto';
import { BrowserReportDto } from './dto/browser-report.dto';
export type Decision = {
    run: boolean;
    reason: string;
    mode: RunnerMode;
    pollAfterSeconds: number;
    settings: Prisma.JsonValue | null;
    serverTime: string;
    window: string;
};
type RunnerRow = {
    mode: RunnerMode;
    windowStart: number | null;
    windowEnd: number | null;
    days: string | null;
    timezone: string;
    settings: Prisma.JsonValue | null;
    running: boolean;
    lastSeenAt: Date | null;
};
export declare class RunnersService {
    private readonly prisma;
    constructor(prisma: PrismaService);
    decide(runner: RunnerRow | null, profileActive: boolean, publishingEnabled: boolean, now?: Date): Omit<Decision, 'serverTime'>;
    control(profileExternalId: string, acting?: CurrentUser | null): Promise<Decision>;
    heartbeat(profileExternalId: string, dto: HeartbeatDto, acting?: CurrentUser | null): Promise<Decision>;
    launcherPlan(acting?: CurrentUser | null, now?: Date): Promise<{
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
    reportBrowser(profileExternalId: string, dto: BrowserReportDto, acting?: CurrentUser | null): Promise<Decision>;
    list(acting?: CurrentUser | null, now?: Date): Promise<{
        publishingEnabled: boolean;
        serverTime: string;
        profiles: {
            profileId: string;
            name: string;
            externalId: string | null;
            status: import("@prisma/client").$Enums.RecordStatus;
            mode: import("@prisma/client").$Enums.RunnerMode;
            shouldRun: boolean;
            reason: string;
            window: string;
            timezone: string;
            windowStart: number | null;
            windowEnd: number | null;
            days: string | null;
            settings: string | number | boolean | Prisma.JsonObject | Prisma.JsonArray | null;
            atWork: boolean;
            running: boolean;
            phase: string | null;
            message: string | null;
            published: number;
            failed: number;
            links: number;
            agent: string | null;
            lastSeenAt: Date | null;
            browserState: import("@prisma/client").$Enums.BrowserState;
            browserSeenAt: Date | null;
            browserMessage: string | null;
        }[];
    }>;
    update(profileId: string, dto: UpdateRunnerDto, acting?: CurrentUser | null): Promise<{
        profileId: string;
        run: boolean;
        reason: string;
        mode: RunnerMode;
        pollAfterSeconds: number;
        settings: Prisma.JsonValue | null;
        serverTime: string;
        window: string;
    }>;
    updateAll(dto: UpdateRunnerDto, acting?: CurrentUser | null): Promise<{
        updated: number;
    }>;
    private atWork;
    private answer;
    private globalSettings;
    private context;
}
export {};
