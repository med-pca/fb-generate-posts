"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SECURE_SESSION_COOKIE = exports.SESSION_COOKIE = void 0;
exports.parseCookies = parseCookies;
exports.isSecure = isSecure;
exports.sessionTokenFrom = sessionTokenFrom;
exports.sessionCookie = sessionCookie;
exports.clearSessionCookies = clearSessionCookies;
exports.clientIp = clientIp;
exports.SESSION_COOKIE = 'pf_session';
exports.SECURE_SESSION_COOKIE = '__Host-pf_session';
function parseCookies(header) {
    const out = {};
    for (const part of (header || '').split(';')) {
        const index = part.indexOf('=');
        if (index < 0)
            continue;
        const name = part.slice(0, index).trim();
        if (!name)
            continue;
        try {
            out[name] = decodeURIComponent(part.slice(index + 1).trim());
        }
        catch {
            out[name] = part.slice(index + 1).trim();
        }
    }
    return out;
}
function isSecure(headers) {
    const forwarded = String(headers['x-forwarded-proto'] || '').split(',')[0].trim();
    return forwarded === 'https' || process.env.NODE_ENV === 'production';
}
function sessionTokenFrom(headers) {
    const cookies = parseCookies(headers.cookie);
    return cookies[exports.SECURE_SESSION_COOKIE] || cookies[exports.SESSION_COOKIE] || '';
}
function sessionCookie(token, maxAgeSeconds, secure) {
    const name = secure ? exports.SECURE_SESSION_COOKIE : exports.SESSION_COOKIE;
    return `${name}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAgeSeconds}${secure ? '; Secure' : ''}`;
}
function clearSessionCookies(secure) {
    return [
        `${exports.SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0`,
        ...(secure ? [`${exports.SECURE_SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0; Secure`] : []),
    ];
}
function clientIp(headers, fallback) {
    const forwarded = String(headers['x-forwarded-for'] || '').split(',')[0].trim();
    return (forwarded || String(headers['x-real-ip'] || '') || fallback || '').slice(0, 100) || null;
}
//# sourceMappingURL=cookies.js.map