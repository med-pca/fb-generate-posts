import { RunnerMode } from '@prisma/client';
export declare class UpdateRunnerDto {
    mode?: RunnerMode;
    windowStart?: number | null;
    windowEnd?: number | null;
    days?: string;
    timezone?: string;
    settings?: Record<string, unknown> | null;
}
