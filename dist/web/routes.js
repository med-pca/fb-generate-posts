"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PAGE_CSP = exports.SECURITY_HEADERS = exports.isAppRoute = exports.DYNAMIC_ROUTES = exports.APP_ROUTES = void 0;
exports.appPath = appPath;
exports.safeNext = safeNext;
exports.legacyTarget = legacyTarget;
exports.APP_ROUTES = {
    '/': { view: 'dashboard', title: 'Vue d’ensemble' },
    '/profils': { view: 'profiles', title: 'Profils' },
    '/groupes': { view: 'groups', title: 'Groupes' },
    '/categories': { view: 'categories', title: 'Catégories' },
    '/sites': { view: 'sites', title: 'Sites' },
    '/articles': { view: 'articles', title: 'Articles' },
    '/articles/visuels': { view: 'articles', title: 'Articles — visuels' },
    '/posts': { view: 'posts', tab: 'queue', title: 'Posts — file d’attente' },
    '/posts/en-cours': { view: 'posts', tab: 'queue', title: 'Posts — en cours' },
    '/posts/publies': { view: 'posts', tab: 'queue', title: 'Posts — publiés' },
    '/posts/echecs': { view: 'posts', tab: 'queue', title: 'Posts — en échec' },
    '/posts/a-traiter': { view: 'posts', tab: 'queue', title: 'Posts — à traiter' },
    '/posts/tous': { view: 'posts', tab: 'all', title: 'Posts — tous' },
    '/posts/duplication': { view: 'posts', tab: 'repeat', title: 'Posts — duplication' },
    '/journaux': { view: 'logs', title: 'Journaux' },
    '/analyse': { view: 'analytics', title: 'Analyse' },
    '/pilotage': { view: 'runners', title: 'Pilotage' },
    '/pilotage/objectif': { view: 'runners', title: 'Pilotage — campagnes' },
    '/pilotage/campagnes': { view: 'runners', title: 'Pilotage — campagnes' },
    '/pilotage/adhesions': { view: 'runners', title: 'Pilotage — nos profils dans les groupes' },
    '/pilotage/regles': { view: 'runners', title: 'Pilotage — règles & priorités' },
    '/parametres': { view: 'settings', title: 'Paramètres' },
    '/comptes': { view: 'users', title: 'Comptes' },
    '/actions-en-masse': { view: 'bulk', title: 'Actions en masse' },
    '/moderateurs': { view: 'moderators', title: 'Modérateurs' },
    '/extensions': { view: 'extensions', title: 'Extensions' },
    '/pre-approbations': { view: 'preapprovals', title: 'Pré-approbations' },
    '/top-articles': { view: 'toparticles', title: 'Top 10 articles' },
    '/performance': { view: 'perf', title: 'Performance' },
};
exports.DYNAMIC_ROUTES = [
    { pattern: /^\/profils\/[a-z0-9_-]{6,64}$/i, fastify: '/profils/:id', view: 'profile-page' },
    { pattern: /^\/moderateurs\/[a-z0-9_-]{6,64}$/i, fastify: '/moderateurs/:id', view: 'moderator-page' },
];
function appPath(raw) {
    const path = (raw.split(/[?#]/)[0] || '/').replace(/\/+$/, '') || '/';
    return path.toLowerCase();
}
const isAppRoute = (raw) => {
    const path = (raw.split(/[?#]/)[0] || '/').replace(/\/+$/, '') || '/';
    return Object.prototype.hasOwnProperty.call(exports.APP_ROUTES, path.toLowerCase()) || exports.DYNAMIC_ROUTES.some((r) => r.pattern.test(path));
};
exports.isAppRoute = isAppRoute;
function safeNext(raw) {
    const next = typeof raw === 'string' ? raw : '';
    if (!next.startsWith('/') || next.startsWith('//') || next.startsWith('/\\'))
        return '/';
    if (next.startsWith('/api/docs'))
        return '/api/docs';
    if (!(0, exports.isAppRoute)(next))
        return '/';
    const path = (next.split(/[?#]/)[0] || '/').replace(/\/+$/, '') || '/';
    const clean = exports.DYNAMIC_ROUTES.some((r) => r.pattern.test(path)) ? path : appPath(next);
    return clean + (next.includes('?') ? next.slice(next.indexOf('?')) : '');
}
function legacyTarget(raw) {
    const path = appPath(raw);
    if (path !== '/admin' && !path.startsWith('/admin/'))
        return null;
    const rest = path.slice('/admin'.length) || '/';
    if (rest === '/' || rest === '/index.html')
        return '/';
    return (0, exports.isAppRoute)(rest) ? rest : '/';
}
exports.SECURITY_HEADERS = {
    'x-content-type-options': 'nosniff',
    'x-frame-options': 'DENY',
    'referrer-policy': 'same-origin',
    'permissions-policy': 'camera=(), microphone=(), geolocation=(), payment=()',
    'cross-origin-opener-policy': 'same-origin',
};
exports.PAGE_CSP = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' https: data: blob:",
    "connect-src 'self'",
    "font-src 'self' data:",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'self'",
    "frame-ancestors 'none'",
].join('; ');
//# sourceMappingURL=routes.js.map