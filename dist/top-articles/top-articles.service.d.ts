import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import type { CurrentUser } from '../auth/current-user';
export declare const MAX_PER_USER = 50;
export declare class TopArticlesService {
    private readonly prisma;
    private readonly config;
    constructor(prisma: PrismaService, config: ConfigService);
    today(now?: Date): string;
    list(acting: CurrentUser | null, day?: string): Promise<{
        day: string;
        admin: boolean;
        perUser: number;
        error: string | null;
        lists: {
            user: {
                id: string;
                username: string;
            };
            items: {
                rank: number;
                url: string;
                title: string;
                image: string | null;
                domain: string;
                views: number;
                viral: boolean;
            }[];
        }[];
    }>;
    regenerate(day?: string): Promise<{
        day: string;
        admin: boolean;
        perUser: number;
        error: string | null;
        lists: {
            user: {
                id: string;
                username: string;
            };
            items: {
                rank: number;
                url: string;
                title: string;
                image: string | null;
                domain: string;
                views: number;
                viral: boolean;
            }[];
        }[];
    }>;
    settings(): Promise<{
        perUser: number;
        max: number;
        managers: {
            id: string;
            username: string;
            active: boolean;
            enabled: boolean;
        }[];
    }>;
    updateSettings(dto: {
        perUser?: number;
        enabledUserIds?: string[];
    }): Promise<{
        perUser: number;
        max: number;
        managers: {
            id: string;
            username: string;
            active: boolean;
            enabled: boolean;
        }[];
    }>;
    private perUser;
    private ensure;
    private fetchTop;
}
