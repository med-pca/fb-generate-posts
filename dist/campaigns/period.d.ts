export type Period = 'day' | 'week' | 'month';
export declare function periodBounds(period: Period, now: Date, timeZone: string): {
    from: Date;
    to: Date;
    days: number;
    dayIndex: number;
};
export declare function campaignPace(input: {
    period: Period;
    target: number;
    published: number;
    lastHour: number;
    now: Date;
    timezone: string;
    windowStart: number;
    windowEnd: number;
    startsAt?: Date;
}): {
    from: Date;
    to: Date;
    days: number;
    expected: number;
    remaining: number;
    neededPerHour: number;
    ratePerHour: number;
    projection: number;
    minutesLeft: number;
    elapsed: number;
    status: "not_started" | "ahead" | "on_track" | "late" | "reached" | "missed";
};
export declare function rotationTeamOf(teams: string[], startsAt: Date, now: Date, timeZone: string): {
    team: string;
    index: number;
    day: number;
} | null;
export declare function inWindow(minutes: number, start: number, end: number): boolean;
export declare function campaignGate(input: {
    now: Date;
    timezone: string;
    windowStart: number;
    windowEnd: number;
    target: number;
    published: number;
    expected: number;
    spread?: boolean;
}): string | null;
export type PoolCandidate = {
    id: string;
    name: string;
    createdAt: Date;
    status: string;
    externalId: string | null;
    facebookSuspension: string | null;
    runner: {
        mode: string;
        pausedUntil: Date | null;
        running: boolean;
        lastSeenAt: Date | null;
        browserState: string;
    } | null;
};
export declare function unavailableReason(p: PoolCandidate, now: Date): string | null;
export declare function poolOf(candidates: PoolCandidate[], size: number, now: Date): {
    size: number;
    active: {
        id: string;
        name: string;
    }[];
    standby: {
        id: string;
        name: string;
    }[];
    unavailable: {
        id: string;
        name: string;
        why: string;
    }[];
    missing: number;
};
export declare function campaignCapacity(input: {
    candidates: PoolCandidate[];
    now: Date;
    minGap: number;
    publishMinutes: number;
    neededPerHour: number;
    ratePerHour: number;
    remaining: number;
    stock: number;
    status: string;
}): {
    working: number;
    idle: number;
    unavailable: {
        why: string;
        count: number;
    }[];
    perProfile: number;
    perHour: number;
    neededPerHour: number;
    neededProfiles: number;
    missingProfiles: number;
    reasons: string[];
};
