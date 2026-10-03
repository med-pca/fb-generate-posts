"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PAGE_CSP = exports.SECURITY_HEADERS = exports.isAppRoute = exports.APP_ROUTES = void 0;
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
    '/posts': { view: 'posts', tab: 'queue', title: 'Posts — file d’attente' },
    '/posts/tous': { view: 'posts', tab: 'all', title: 'Posts — tous' },
    '/journaux': { view: 'logs', title: 'Journaux' },
    '/pilotage': { view: 'runners', title: 'Pilotage' },
    '/parametres': { view: 'settings', title: 'Paramètres' },
    '/comptes': { view: 'users', title: 'Comptes' },
};
function appPath(raw) {
    const path = (raw.split(/[?#]/)[0] || '/').replace(/\/+$/, '') || '/';
    return path.toLowerCase();
}
const isAppRoute = (raw) => Object.prototype.hasOwnProperty.call(exports.APP_ROUTES, appPath(raw));
exports.isAppRoute = isAppRoute;
function safeNext(raw) {
    const next = typeof raw === 'string' ? raw : '';
    if (!next.startsWith('/') || next.startsWith('//') || next.startsWith('/\\'))
        return '/';
    if (next.startsWith('/api/docs'))
        return '/api/docs';
    return (0, exports.isAppRoute)(next) ? appPath(next) + (next.includes('?') ? next.slice(next.indexOf('?')) : '') : '/';
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