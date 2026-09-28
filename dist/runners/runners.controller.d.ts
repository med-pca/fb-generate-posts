import type { CurrentUser } from '../auth/current-user';
import { UpdateRunnerDto } from './dto/update-runner.dto';
import { RunnersService } from './runners.service';
export declare class RunnersController {
    private readonly runners;
    constructor(runners: RunnersService);
    list(acting: CurrentUser): Promise<{
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
            browserState: import("@prisma/client").$Enums.BrowserState;
            browserSeenAt: Date | null;
            browserMessage: string | null;
            pairedAt: Date | null;
            pairCodePending: boolean;
        }[];
    }>;
    updateAll(dto: UpdateRunnerDto, acting: CurrentUser): Promise<{
        updated: number;
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
