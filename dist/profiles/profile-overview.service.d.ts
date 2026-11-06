import { PrismaService } from '../prisma/prisma.service';
import type { CurrentUser } from '../auth/current-user';
import { ProfileHealthService } from './profile-health.service';
import { type HealthLabel } from './profile-health';
export type ProfileState = 'working' | 'waiting' | 'off' | 'paused' | 'suspended' | 'checkpoint' | 'logged_out' | 'inactive';
export declare function stateOf(p: {
    status: string;
    facebookSuspension: string | null;
    runner: {
        mode: string;
        running: boolean;
        lastSeenAt: Date | null;
        pausedUntil: Date | null;
    } | null;
}, now: Date): ProfileState;
export declare class ProfileOverviewService {
    private readonly prisma;
    private readonly health;
    constructor(prisma: PrismaService, health: ProfileHealthService);
    overview(acting: CurrentUser | null, days?: number, now?: Date): Promise<{
        days: number;
        timeZone: string;
        today: string;
        totals: {
            profiles: number;
            active: number;
            usable: number;
            published: number;
            failed: number;
            successRate: number | null;
            last24h: number;
            perUsableProfile: number;
            withFacebookLink: number;
        };
        states: Record<ProfileState, number>;
        health: Record<HealthLabel, number>;
        groups: {
            joined: number;
            requested: number;
            pending: number;
            questions: number;
            failed: number;
        };
        series: {
            published: number;
            failed: number;
            day: string;
        }[];
        top: {
            id: string;
            name: string;
            facebookName: string | null;
            facebookUserId: string | null;
            facebookProfileUrl: string | null;
            state: ProfileState;
            published: number;
            failed: number;
            successRate: number | null;
            lastPublishedAt: Date | null;
            score: number | null;
            label: HealthLabel;
        }[];
        worst: {
            id: string;
            name: string;
            facebookName: string | null;
            facebookUserId: string | null;
            facebookProfileUrl: string | null;
            state: ProfileState;
            published: number;
            failed: number;
            successRate: number | null;
            lastPublishedAt: Date | null;
            score: number | null;
            label: HealthLabel;
        }[];
        attention: {
            why: string;
            id: string;
            name: string;
            facebookName: string | null;
            facebookUserId: string | null;
            facebookProfileUrl: string | null;
            state: ProfileState;
            published: number;
            failed: number;
            successRate: number | null;
            lastPublishedAt: Date | null;
            score: number | null;
            label: HealthLabel;
        }[];
        byOwner: {
            owner: string;
            profiles: number;
            working: number;
            outOfService: number;
            published: number;
            failed: number;
        }[];
    }>;
}
