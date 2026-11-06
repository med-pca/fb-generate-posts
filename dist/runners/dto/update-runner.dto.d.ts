import { RunnerMode } from '@prisma/client';
export declare class UpdateRunnerDto {
    mode?: RunnerMode;
    windowStart?: number | null;
    windowEnd?: number | null;
    days?: string;
    timezone?: string;
    dailyQuota?: number | null;
    cycleMaxPosts?: number | null;
    cyclePauseHours?: number | null;
    settings?: Record<string, unknown> | null;
}
