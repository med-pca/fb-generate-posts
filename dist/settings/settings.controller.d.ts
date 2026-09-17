import { UpdateSettingsDto } from './dto/update-settings.dto';
import { ReplenishScheduler } from './replenish.scheduler';
import { SettingsService } from './settings.service';
export declare class SettingsController {
    private readonly settings;
    private readonly scheduler;
    constructor(settings: SettingsService, scheduler: ReplenishScheduler);
    get(): Promise<{
        replenishIntervalMinutes: number;
        id: string;
        createdAt: Date;
        updatedAt: Date;
        minimumAvailablePerGroup: number;
        autoReplenishEnabled: boolean;
        minimumAvailablePerProfile: number;
    }>;
    update(dto: UpdateSettingsDto): import("@prisma/client").Prisma.Prisma__AutomationSettingClient<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        minimumAvailablePerGroup: number;
        autoReplenishEnabled: boolean;
        minimumAvailablePerProfile: number;
    }, never, import("@prisma/client/runtime/library").DefaultArgs, import("@prisma/client").Prisma.PrismaClientOptions>;
    replenishNow(): Promise<({
        profileId: string;
        available: number;
        generated: number;
        reused: number;
        skipped: string;
        thresholds: {
            perProfile: number;
            perGroup: number;
        } | undefined;
        groups: never[];
    } | {
        profileId: string;
        available: number;
        generated: number;
        reused: number;
        skipped: string | undefined;
        thresholds: {
            perProfile: number;
            perGroup: number;
        } | undefined;
        groups: {
            groupId: string;
            name: string;
            available: number;
            missing: number;
        }[];
        remaining: number;
    })[]>;
    runScheduledPass(): Promise<{
        skipped: "already_running";
        profiles?: undefined;
        generated?: undefined;
        reused?: undefined;
        error?: undefined;
    } | {
        profiles: number;
        generated: number;
        reused: number;
        skipped?: undefined;
        error?: undefined;
    } | {
        error: string;
        skipped?: undefined;
        profiles?: undefined;
        generated?: undefined;
        reused?: undefined;
    }>;
    replenishProfile(profileId: string): Promise<{
        profileId: string;
        available: number;
        generated: number;
        reused: number;
        skipped: string;
        thresholds: {
            perProfile: number;
            perGroup: number;
        } | undefined;
        groups: never[];
    } | {
        profileId: string;
        available: number;
        generated: number;
        reused: number;
        skipped: string | undefined;
        thresholds: {
            perProfile: number;
            perGroup: number;
        } | undefined;
        groups: {
            groupId: string;
            name: string;
            available: number;
            missing: number;
        }[];
        remaining: number;
    }>;
}
