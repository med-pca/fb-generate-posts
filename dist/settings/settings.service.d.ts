import { Prisma } from '@prisma/client';
import { ArticlesService } from '../articles/articles.service';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateSettingsDto } from './dto/update-settings.dto';
type GroupStock = {
    groupId: string;
    name: string;
    available: number;
    missing: number;
};
export declare class SettingsService {
    private readonly prisma;
    private readonly articles;
    private readonly logger;
    constructor(prisma: PrismaService, articles: ArticlesService);
    get(): Prisma.Prisma__AutomationSettingClient<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        minimumAvailablePerGroup: number;
        autoReplenishEnabled: boolean;
        minimumAvailablePerProfile: number;
    }, never, import("@prisma/client/runtime/library").DefaultArgs, Prisma.PrismaClientOptions>;
    update(dto: UpdateSettingsDto): Prisma.Prisma__AutomationSettingClient<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        minimumAvailablePerGroup: number;
        autoReplenishEnabled: boolean;
        minimumAvailablePerProfile: number;
    }, never, import("@prisma/client/runtime/library").DefaultArgs, Prisma.PrismaClientOptions>;
    replenishAll(): Promise<({
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
        groups: GroupStock[];
        remaining: number;
    })[]>;
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
        groups: GroupStock[];
        remaining: number;
    }>;
    private groupStocks;
    private reuseExistingPosts;
    private generatePosts;
    private takenSlots;
    private nextFreeSlot;
    private groupsToFill;
    private countAvailablePosts;
    private availablePostWhere;
    private fill;
    private isUniqueViolation;
    private logReplenishment;
    private empty;
    private report;
}
export {};
