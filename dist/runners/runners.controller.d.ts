import type { CurrentUser } from '../auth/current-user';
import { UpdateRunnerDto } from './dto/update-runner.dto';
import { RunnersService } from './runners.service';
export declare class RunnersController {
    private readonly runners;
    constructor(runners: RunnersService);
    list(acting: CurrentUser): Promise<{
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
            settings: string | number | boolean | import("@prisma/client/runtime/library").JsonObject | import("@prisma/client/runtime/library").JsonArray | null;
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
    checkPairings(acting: CurrentUser): Promise<{
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
    updateAll(dto: UpdateRunnerDto, acting: CurrentUser): Promise<{
        updated: number;
    }>;
    resume(profileId: string, acting: CurrentUser): Promise<{
        profileId: string;
        resumed: boolean;
    }>;
    pairCode(profileId: string, acting: CurrentUser): Promise<{
        code: string;
        expiresAt: string;
        expiresInMinutes: number;
        profileId: string;
        profileName: string;
    }>;
    update(profileId: string, dto: UpdateRunnerDto, acting: CurrentUser): Promise<{
        profileId: string;
        run: boolean;
        reason: string;
        mode: import("@prisma/client").RunnerMode;
        pollAfterSeconds: number;
        settings: import("@prisma/client/runtime/library").JsonValue | null;
        serverTime: string;
        window: string;
    }>;
}
