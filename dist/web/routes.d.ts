export type AppRoute = {
    view: string;
    tab?: string;
    title: string;
};
export declare const APP_ROUTES: Record<string, AppRoute>;
export declare function appPath(raw: string): string;
export declare const isAppRoute: (raw: string) => boolean;
export declare function safeNext(raw: unknown): string;
export declare function legacyTarget(raw: string): string | null;
export declare const SECURITY_HEADERS: Record<string, string>;
export declare const PAGE_CSP: string;
