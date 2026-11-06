"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.bucketOf = exports.BUCKETS = void 0;
exports.callerOf = callerOf;
exports.percentile = percentile;
exports.readRoute = readRoute;
exports.BUCKETS = [25, 50, 100, 250, 500, 1000, 2000, 5000, 10000];
const bucketOf = (ms) => {
    const i = exports.BUCKETS.findIndex((edge) => ms <= edge);
    return i === -1 ? exports.BUCKETS.length : i;
};
exports.bucketOf = bucketOf;
function callerOf(input) {
    if (!input.hasApiKey) {
        if (input.user)
            return `${input.user.role === 'ADMIN' ? 'page admin' : 'page gestionnaire'} · ${input.user.username}`;
        return 'sans compte';
    }
    const r = input.route;
    if (/^\/api\/verify\b/.test(r))
        return 'extension Modérateur';
    if (/^\/api\/join\b/.test(r))
        return 'extension Adhésion';
    if (/^\/api\/(control|runners)\b/.test(r) || /python/i.test(input.userAgent || ''))
        return 'agent NSTBrowser';
    if (/^\/api\/(jobs|ingest)\b/.test(r))
        return 'extension Publication / Capture';
    return 'automate (clé d’API)';
}
function percentile(buckets, q) {
    const total = buckets.reduce((n, b) => n + b, 0);
    if (!total)
        return 0;
    let seen = 0;
    for (let i = 0; i < buckets.length; i += 1) {
        seen += buckets[i];
        if (seen / total >= q)
            return i < exports.BUCKETS.length ? exports.BUCKETS[i] : 10_000;
    }
    return 10_000;
}
function readRoute(m, minutes) {
    const avgMs = m.count ? m.totalMs / m.count : 0;
    const sqlAvg = m.count ? m.sqlCount / m.count : 0;
    const repeatRatio = m.gets ? m.repeats / m.gets : 0;
    const perHour = minutes ? (m.count / minutes) * 60 : 0;
    const p95 = percentile(m.buckets, 0.95);
    const advice = [];
    if (m.method === 'GET' && m.gets >= 20 && repeatRatio >= 0.6 && perHour >= 30) {
        const ttl = perHour >= 600 ? 30 : perHour >= 120 ? 15 : 10;
        advice.push({ kind: 'cache', text: `${Math.round(repeatRatio * 100)} % des réponses identiques à la précédente : un cache de ${ttl} s éviterait ~${Math.round(m.repeats)} calcul(s)` });
    }
    if (sqlAvg >= 20)
        advice.push({ kind: 'n+1', text: `${Math.round(sqlAvg)} requêtes SQL par appel : des requêtes en boucle (N+1) à regrouper` });
    const dbShare = m.totalMs ? m.sqlMs / m.totalMs : 0;
    if (p95 >= 1000 && dbShare > 1.2)
        advice.push({ kind: 'db', text: `${Math.round(dbShare * 100)} % : requêtes lancées en parallèle, qui occupent les connexions à la base ; à regrouper ou limiter` });
    else if (p95 >= 1000 && dbShare >= 0.6)
        advice.push({ kind: 'db', text: `${Math.round(dbShare * 100)} % du temps passé en base : requête lente, un index peut-être` });
    else if (p95 >= 1000)
        advice.push({ kind: 'slow', text: 'lent hors de la base : calcul lourd ou appel à un service extérieur' });
    if (perHour >= 600 && avgMs >= 100)
        advice.push({ kind: 'poll', text: `${Math.round(perHour)} appels par heure : un rafraîchissement automatique à espacer ?` });
    if (m.count && m.errors / m.count >= 0.1)
        advice.push({ kind: 'errors', text: `${Math.round((m.errors / m.count) * 100)} % d’erreurs (HTTP ≥ 500)` });
    return {
        method: m.method,
        route: m.route,
        ...(m.caller ? { caller: m.caller } : {}),
        count: m.count,
        perHour: Math.round(perHour * 10) / 10,
        avgMs: Math.round(avgMs),
        p50: percentile(m.buckets, 0.5),
        p95,
        maxMs: Math.round(m.maxMs),
        costSeconds: Math.round(m.totalMs / 1000),
        sqlAvg: Math.round(sqlAvg * 10) / 10,
        sqlShare: m.totalMs ? Math.round((m.sqlMs / m.totalMs) * 100) : 0,
        errors: m.errors,
        avgKb: m.count ? Math.round(m.bytes / m.count / 102.4) / 10 : 0,
        repeatRatio: Math.round(repeatRatio * 100),
        advice,
    };
}
//# sourceMappingURL=perf-report.js.map