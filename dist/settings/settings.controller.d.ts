import { UpdateSettingsDto } from './dto/update-settings.dto';
import { SettingsService } from './settings.service';
export declare class SettingsController {
    private readonly settings;
    constructor(settings: SettingsService);
    get(): import("@prisma/client").Prisma.Prisma__AutomationSettingClient<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        autoReplenishEnabled: boolean;
        minimumAvailablePerProfile: number;
    }, never, import("@prisma/client/runtime/library").DefaultArgs, import("@prisma/client").Prisma.PrismaClientOptions>;
    update(dto: UpdateSettingsDto): import("@prisma/client").Prisma.Prisma__AutomationSettingClient<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        autoReplenishEnabled: boolean;
        minimumAvailablePerProfile: number;
    }, never, import("@prisma/client/runtime/library").DefaultArgs, import("@prisma/client").Prisma.PrismaClientOptions>;
    replenishNow(): Promise<({
        profileId: string;
        generated: number;
        skipped: string;
        available?: undefined;
        remaining?: undefined;
    } | {
        profileId: string;
        available: number;
        generated: number;
        skipped?: undefined;
        remaining?: undefined;
    } | {
        profileId: string;
        available: number;
        generated: number;
        skipped: string;
        remaining?: undefined;
    } | {
        profileId: string;
        available: number;
        generated: number;
        remaining: number;
        skipped?: undefined;
    })[]>;
}
