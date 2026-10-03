"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LOG_DOMAIN_KEYS = exports.LOG_DOMAINS = void 0;
exports.domainOf = domainOf;
exports.domainWhere = domainWhere;
exports.LOG_DOMAINS = {
    publication: {
        label: 'Publication',
        prefixes: ['JOB_', 'JOBS_', 'CLAIM_', 'POST_', 'COMMENT_', 'TARGET_', 'WORKER_', 'VERIFY_'],
        exact: ['GROUP_POSTS_REMOVED', 'ARTICLE_ARCHIVED'],
    },
    capture: {
        label: 'Captures',
        prefixes: ['INGEST_', 'SCRAPE_', 'CAPTURE_'],
        exact: [],
    },
    sync: {
        label: 'Synchronisation',
        prefixes: ['WORDPRESS_', 'SITE_', 'PLUGIN_', 'PROFILES_', 'NST_'],
        exact: [],
    },
    security: {
        label: 'Sécurité',
        prefixes: ['AUTH_'],
        exact: [],
    },
    groups: {
        label: 'Groupes & pilotage',
        prefixes: ['GROUP_JOIN', 'BROWSER_', 'RUNNER_', 'MEMBER_', 'PROFILE_'],
        exact: [],
    },
};
exports.LOG_DOMAIN_KEYS = [
    ...Object.keys(exports.LOG_DOMAINS),
    'other',
];
const matches = (eventType, def) => def.exact.includes(eventType) ||
    def.prefixes.some((prefix) => eventType.startsWith(prefix));
function domainOf(eventType) {
    for (const [key, def] of Object.entries(exports.LOG_DOMAINS)) {
        if (def.exact.includes(eventType)) {
            return key;
        }
    }
    for (const [key, def] of Object.entries(exports.LOG_DOMAINS)) {
        if (matches(eventType, def))
            return key;
    }
    return 'other';
}
const conditionsOf = (def) => [
    ...(def.exact.length ? [{ eventType: { in: [...def.exact] } }] : []),
    ...def.prefixes.map((prefix) => ({ eventType: { startsWith: prefix } })),
];
function domainWhere(domain) {
    const all = Object.values(exports.LOG_DOMAINS).flatMap(conditionsOf);
    if (domain === 'other')
        return { NOT: { OR: all } };
    const own = { OR: conditionsOf(exports.LOG_DOMAINS[domain]) };
    const foreignExact = Object.entries(exports.LOG_DOMAINS)
        .filter(([key]) => key !== domain)
        .flatMap(([, def]) => [...def.exact]);
    return foreignExact.length
        ? { AND: [own, { eventType: { notIn: foreignExact } }] }
        : own;
}
//# sourceMappingURL=domains.js.map