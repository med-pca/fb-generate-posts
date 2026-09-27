export type Clock = {
    minutes: number;
    isoDay: number;
};
export type Window = {
    windowStart: number | null;
    windowEnd: number | null;
    days: string | null;
};
export declare function localClock(now: Date, timeZone: string): Clock & {
    fallback: boolean;
};
export declare function parseDays(days: string | null | undefined): number[];
export declare const formatWindow: (window: Window) => string;
export declare function insideWindow(clock: Clock, window: Window): {
    inside: boolean;
    reason: string;
};
