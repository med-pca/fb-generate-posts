import { ConfigService } from '@nestjs/config';
import { Prisma, RunnerMode } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CampaignsService } from '../campaigns/campaigns.service';
import type { CurrentUser } from '../auth/current-user';
import { UpdateRunnerDto } from './dto/update-runner.dto';
import { HeartbeatDto } from './dto/heartbeat.dto';
import { BrowserReportDto } from './dto/browser-report.dto';
import { NstProfileDto } from './dto/sync-profiles.dto';
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
    sleepUntil?: Date | null;
    pausedUntil?: Date | null;
    restUntil?: Date | null;
};
export declare function sleepUntilOf(raw: string | undefined, now?: Date): Date | null;
export declare class RunnersService {
    private readonly prisma;
    private readonly config;
    private readonly campaigns?;
    constructor(prisma: PrismaService, config: ConfigService, campaigns?: CampaignsService | undefined);
    private dayPlan;
    private restOf;
    private newPairCode;
    createPairCode(profileId: string, acting?: CurrentUser | null): Promise<{
        code: string;
        expiresAt: string;
        expiresInMinutes: number;
        profileId: string;
        profileName: string;
    }>;
    pair(rawCode: string, apiBaseUrl: string, from?: string): Promise<{
        apiBaseUrl: string;
        apiKey: string;
        profileExternalId: string;
        profileName: string;
        profileActive: boolean;
    }>;
    autoPair(rawExternalId: string, rawName: string | undefined, acting: CurrentUser | null, providedKey?: string): Promise<{
        profileExternalId: string;
        profileName: string;
        profileActive: boolean;
        created: boolean;
    }>;
    private keyFor;
    private readonly pairAttempts;
    private guardPairAttempts;
    private countPairFailure;
    decide(runner: RunnerRow | null, profileActive: boolean, publishingEnabled: boolean, now?: Date): Omit<Decision, 'serverTime'>;
    control(profileExternalId: string, acting?: CurrentUser | null): Promise<Decision>;
    heartbeat(profileExternalId: string, dto: HeartbeatDto, acting?: CurrentUser | null, providedKey?: string): Promise<{
        facebookSuspension: string | null;
        sleepUntil: string | null;
        run: boolean;
        reason: string;
        mode: RunnerMode;
        pollAfterSeconds: number;
        settings: Prisma.JsonValue | null;
        serverTime: string;
        window: string;
    }>;
    private noteFacebookIdentity;
    noteAgent(acting: CurrentUser | null, info: {
        host: string;
        version?: string;
        os?: string;
        running: number;
    }, now?: Date): Promise<void>;
    private agents;
    launcherPlan(acting?: CurrentUser | null, now?: Date): Promise<{
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
    syncProfiles(rows: NstProfileDto[], acting?: CurrentUser | null): Promise<{
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
    reportBrowser(profileExternalId: string, dto: BrowserReportDto, acting?: CurrentUser | null): Promise<Decision>;
    list(acting?: CurrentUser | null, now?: Date): Promise<{
        agents: {
            host: string;
            owner: string | null;
            version: string | null;
            os: string | null;
            runningBrowsers: number;
            lastSeenAt: Date;
            alive: boolean;
        }[];
        publishingEnabled: boolean;
        serverTime: string;
        profiles: {
            profileId: string;
            team: {
                id: string;
                name: string;
            } | null;
            nstGroupName: string | null;
            resting: boolean;
            restReason: string | null;
            name: string;
            externalId: string | null;
            status: import("@prisma/client").$Enums.RecordStatus;
            isModerator: boolean;
            facebookUserId: string | null;
            facebookName: string | null;
            facebookSuspension: string | null;
            owner: {
                id: string;
                username: string;
            } | null;
            groupIds: string[];
            suspendedAt: Date | null;
            suspensionDetail: string | null;
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
            sleepUntil: Date | null;
            pausedUntil: Date | null;
            dailyQuota: number | null;
            pauseReason: string | null;
            restUntil: Date | null;
            cycleMaxPosts: number | null;
            cyclePauseHours: number | null;
            browserState: import("@prisma/client").$Enums.BrowserState;
            browserSeenAt: Date | null;
            browserMessage: string | null;
            pairedAt: Date | null;
            pairing: import("./pairing").PairingHealth;
            pairCodePending: boolean;
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
    resume(profileId: string, acting: CurrentUser): Promise<{
        profileId: string;
        resumed: boolean;
    }>;
    updateAll(dto: UpdateRunnerDto, acting?: CurrentUser | null): Promise<{
        updated: number;
    }>;
    private nstKeyOf;
    private atWork;
    private answer;
    private globalSettings;
    private context;
    noteRejectedKey(profileExternalId: string, reason: string): Promise<void>;
    private currentKeyHashes;
    checkPairings(acting?: CurrentUser | null, now?: Date): Promise<{
        checkedAt: string;
        checked: number;
        byState: Record<string, number>;
        broken: {
            state: import("./pairing").PairingState;
            detail: string;
            broken: boolean;
            profileId: string;
            name: string;
        }[];
        unconfirmed: {
            state: import("./pairing").PairingState;
            detail: string;
            broken: boolean;
            profileId: string;
            name: string;
        }[];
    }>;
}
export declare function stateGroupNames(settings: Partial<Record<'nstGroupLimited' | 'nstGroupCheckpoint' | 'nstGroupDisabled' | 'nstGroupLoggedOut', string | null>> | null | undefined): {
    limited: string;
    checkpoint: string;
    disabled: string;
    loggedOut: string;
};
export declare function wantedNstGroup(p: {
    facebookSuspension?: string | null;
    nstGroupId?: string | null;
    nstGroupName?: string | null;
    teamNstGroupId?: string | null;
    teamNstGroupName?: string | null;
}, pausedUntil: Date | null, names: ReturnType<typeof stateGroupNames>, now: Date): {
    groupId: string | null;
    groupName: string;
    why: string;
} | null;
export declare function withSuspension<D extends {
    run: boolean;
    reason: string;
}>(decision: D, suspension: string | null | undefined): D;
export {};
