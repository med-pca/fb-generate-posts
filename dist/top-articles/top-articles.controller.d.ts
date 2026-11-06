import type { CurrentUser } from '../auth/current-user';
import { TopArticlesService } from './top-articles.service';
export declare class TopArticlesController {
    private readonly top;
    constructor(top: TopArticlesService);
    list(acting: CurrentUser | null): Promise<{
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
    updateSettings(body: {
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
    regenerate(): Promise<{
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
}
