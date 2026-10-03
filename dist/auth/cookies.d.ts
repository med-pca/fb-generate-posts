import type { IncomingHttpHeaders } from 'node:http';
export declare const SESSION_COOKIE = "pf_session";
export declare const SECURE_SESSION_COOKIE = "__Host-pf_session";
export declare function parseCookies(header: string | undefined): Record<string, string>;
export declare function isSecure(headers: IncomingHttpHeaders): boolean;
export declare function sessionTokenFrom(headers: IncomingHttpHeaders): string;
export declare function sessionCookie(token: string, maxAgeSeconds: number, secure: boolean): string;
export declare function clearSessionCookies(secure: boolean): string[];
export declare function clientIp(headers: IncomingHttpHeaders, fallback?: string): string | null;
