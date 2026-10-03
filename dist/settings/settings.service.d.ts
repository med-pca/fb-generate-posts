import { PrismaService } from '../prisma/prisma.service';
import { UpdateSettingsDto } from './dto/update-settings.dto';
export declare class SettingsService {
    private readonly prisma;
    constructor(prisma: PrismaService);
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
