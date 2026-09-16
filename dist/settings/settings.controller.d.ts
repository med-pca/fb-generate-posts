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
        minimumAvailablePerGroup: number;
    }, never, import("@prisma/client/runtime/library").DefaultArgs, import("@prisma/client").Prisma.PrismaClientOptions>;
    update(dto: UpdateSettingsDto): import("@prisma/client").Prisma.Prisma__AutomationSettingClient<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        autoReplenishEnabled: boolean;
        minimumAvailablePerProfile: number;
        minimumAvailablePerGroup: number;
    }, never, import("@prisma/client/runtime/library").DefaultArgs, import("@prisma/client").Prisma.PrismaClientOptions>;
    replenishNow(): Promise<({
        profileId: string;
        available: number;
        generated: number;
        reused: number;
        skipped: string;
        groups: never[];
    } | {
        profileId: string;
        available: number;
        generated: number;
        reused: number;
        skipped: string | undefined;
        groups: {
            groupId: string;
            name: string;
            available: number;
            missing: number;
        }[];
        remaining: number;
    })[]>;
    replenishProfile(profileId: string): Promise<{
        profileId: string;
        available: number;
        generated: number;
        reused: number;
        skipped: string;
        groups: never[];
    } | {
        profileId: string;
        available: number;
        generated: number;
        reused: number;
        skipped: string | undefined;
        groups: {
            groupId: string;
            name: string;
            available: number;
            missing: number;
        }[];
        remaining: number;
    }>;
}
