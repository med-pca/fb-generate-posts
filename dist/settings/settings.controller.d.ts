import { UpdateSettingsDto } from './dto/update-settings.dto';
import { SettingsService } from './settings.service';
export declare class SettingsController {
    private readonly settings;
    constructor(settings: SettingsService);
    get(): import("@prisma/client").Prisma.Prisma__AutomationSettingClient<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        minimumAvailablePerGroup: number;
        autoReplenishEnabled: boolean;
        publishingEnabled: boolean;
        minimumAvailablePerProfile: number;
        dailyTarget: number;
        objectiveStart: number;
        objectiveEnd: number;
        objectiveTimezone: string;
    }, never, import("@prisma/client/runtime/library").DefaultArgs, import("@prisma/client").Prisma.PrismaClientOptions>;
    update(dto: UpdateSettingsDto): import("@prisma/client").Prisma.Prisma__AutomationSettingClient<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        minimumAvailablePerGroup: number;
        autoReplenishEnabled: boolean;
        publishingEnabled: boolean;
        minimumAvailablePerProfile: number;
        dailyTarget: number;
        objectiveStart: number;
        objectiveEnd: number;
        objectiveTimezone: string;
    }, never, import("@prisma/client/runtime/library").DefaultArgs, import("@prisma/client").Prisma.PrismaClientOptions>;
}
