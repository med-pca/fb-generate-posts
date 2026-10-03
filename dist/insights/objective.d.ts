export type PaceStatus = 'no_target' | 'not_started' | 'ahead' | 'on_track' | 'late' | 'reached' | 'missed';
export type Pace = {
    status: PaceStatus;
    target: number;
    published: number;
    expected: number;
    delta: number;
    remaining: number;
    elapsed: number;
    minutesLeft: number;
    ratePerHour: number;
    neededPerHour: number;
    projection: number;
};
export declare function windowLength(start: number, end: number): number;
export declare function minutesIntoWindow(now: number, start: number, end: number): number;
export declare function pace(input: {
    target: number;
    start: number;
    end: number;
    nowMinutes: number;
    published: number;
    lastHour: number;
}): Pace;
