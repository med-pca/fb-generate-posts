export declare const WINDOW_MS: number;
export declare const MAX_PER_USER = 5;
export declare const MAX_PER_IP = 20;
export declare class LoginThrottle {
    private readonly failures;
    private recent;
    blockedFor(ip: string, username: string, now?: number): number | null;
    fail(ip: string, username: string, now?: number): void;
    succeed(ip: string, username: string): void;
}
