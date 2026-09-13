import { ArticlesService } from '../articles/articles.service';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateSettingsDto } from './dto/update-settings.dto';
export declare class SettingsService {
    private readonly prisma;
    private readonly articles;
    constructor(prisma: PrismaService, articles: ArticlesService);
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
    replenishAll(): Promise<({
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
    replenishProfile(profileId: string): Promise<{
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
    }>;
}
