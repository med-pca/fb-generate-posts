import { Prisma } from '@prisma/client';
export declare const LOG_DOMAINS: {
    readonly publication: {
        readonly label: "Publication";
        readonly prefixes: readonly ["JOB_", "JOBS_", "CLAIM_", "POST_", "COMMENT_", "TARGET_", "WORKER_", "VERIFY_"];
        readonly exact: readonly ["GROUP_POSTS_REMOVED", "ARTICLE_ARCHIVED"];
    };
    readonly capture: {
        readonly label: "Captures";
        readonly prefixes: readonly ["INGEST_", "SCRAPE_", "CAPTURE_"];
        readonly exact: string[];
    };
    readonly sync: {
        readonly label: "Synchronisation";
        readonly prefixes: readonly ["WORDPRESS_", "SITE_", "PLUGIN_", "PROFILES_", "NST_"];
        readonly exact: string[];
    };
    readonly security: {
        readonly label: "Sécurité";
        readonly prefixes: readonly ["AUTH_"];
        readonly exact: string[];
    };
    readonly groups: {
        readonly label: "Groupes & pilotage";
        readonly prefixes: readonly ["GROUP_JOIN", "BROWSER_", "RUNNER_", "MEMBER_", "PROFILE_"];
        readonly exact: string[];
    };
};
export type LogDomain = keyof typeof LOG_DOMAINS | 'other';
export declare const LOG_DOMAIN_KEYS: readonly [...("groups" | "security" | "publication" | "capture" | "sync")[], "other"];
export declare function domainOf(eventType: string): LogDomain;
export declare function domainWhere(domain: LogDomain): Prisma.ActivityLogWhereInput;
