"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.periodBounds = periodBounds;
exports.campaignPace = campaignPace;
exports.rotationTeamOf = rotationTeamOf;
exports.inWindow = inWindow;
exports.campaignGate = campaignGate;
exports.unavailableReason = unavailableReason;
exports.poolOf = poolOf;
exports.campaignCapacity = campaignCapacity;
const insights_service_1 = require("../insights/insights.service");
const window_1 = require("../runners/window");
const objective_1 = require("../insights/objective");
const DAY = 86_400_000;
function dayOfMonth(now, timeZone) {
    try {
        return Number(new Intl.DateTimeFormat('en-GB', { timeZone, day: 'numeric' }).format(now));
    }
    catch {
        return now.getUTCDate();
    }
}
function midnightShift(now, timeZone, days) {
    const noon = new Date((0, insights_service_1.startOfLocalDay)(now, timeZone).getTime() + 12 * 3_600_000 + days * DAY);
    return (0, insights_service_1.startOfLocalDay)(noon, timeZone);
}
function periodBounds(period, now, timeZone) {
    let from;
    if (period === 'week')
        from = midnightShift(now, timeZone, -((0, window_1.localClock)(now, timeZone).isoDay - 1));
    else if (period === 'month')
        from = midnightShift(now, timeZone, -(dayOfMonth(now, timeZone) - 1));
    else
        from = (0, insights_service_1.startOfLocalDay)(now, timeZone);
    let days = 1;
    if (period === 'week')
        days = 7;
    if (period === 'month') {
        const next = midnightShift(from, timeZone, 32);
        const firstNext = midnightShift(next, timeZone, -(dayOfMonth(next, timeZone) - 1));
        days = Math.round((firstNext.getTime() - from.getTime()) / DAY);
    }
    const to = midnightShift(from, timeZone, days);
    const dayIndex = Math.min(days - 1, Math.max(0, Math.round(((0, insights_service_1.startOfLocalDay)(now, timeZone).getTime() - from.getTime()) / DAY)));
    return { from, to, days, dayIndex };
}
function campaignPace(input) {
    const { from, to, days, dayIndex } = periodBounds(input.period, input.now, input.timezone);
    const perDay = (0, objective_1.windowLength)(input.windowStart, input.windowEnd);
    const worked = (t) => {
        const index = Math.min(days - 1, Math.max(0, Math.round(((0, insights_service_1.startOfLocalDay)(t, input.timezone).getTime() - from.getTime()) / DAY)));
        return index * perDay + (0, objective_1.minutesIntoWindow)((0, window_1.localClock)(t, input.timezone).minutes, input.windowStart, input.windowEnd);
    };
    const offset = input.startsAt && input.startsAt > from ? Math.min(perDay * days, worked(input.startsAt)) : 0;
    const today = (0, objective_1.minutesIntoWindow)((0, window_1.localClock)(input.now, input.timezone).minutes, input.windowStart, input.windowEnd);
    const total = perDay * days - offset;
    const into = Math.max(0, Math.min(total, dayIndex * perDay + today - offset));
    const left = Math.max(0, total - into);
    const elapsed = total ? into / total : 1;
    const expected = Math.round(input.target * elapsed);
    const remaining = Math.max(0, input.target - input.published);
    const neededPerHour = left ? Math.ceil((remaining / left) * 60) : remaining;
    const projection = input.published + Math.round((input.lastHour * left) / 60);
    let status;
    if (input.published >= input.target)
        status = 'reached';
    else if (into <= 0)
        status = 'not_started';
    else if (!left)
        status = 'missed';
    else if (input.published >= expected)
        status = 'ahead';
    else if (input.published >= expected * 0.9)
        status = 'on_track';
    else
        status = 'late';
    return { from, to, days, expected, remaining, neededPerHour, ratePerHour: input.lastHour, projection, minutesLeft: left, elapsed, status };
}
function localDate(d, timeZone) {
    try {
        return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
    }
    catch {
        return d.toISOString().slice(0, 10);
    }
}
function rotationTeamOf(teams, startsAt, now, timeZone) {
    if (!teams.length)
        return null;
    const day = (d) => Date.parse(`${localDate(d, timeZone)}T00:00:00Z`) / 86_400_000;
    const index = Math.max(0, Math.round(day(now) - day(startsAt)));
    return { team: teams[index % teams.length], index: index % teams.length, day: index };
}
function inWindow(minutes, start, end) {
    if (start === end)
        return true;
    return end > start ? minutes >= start && minutes < end : minutes >= start || minutes < end;
}
const hhmm = (m) => `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
function campaignGate(input) {
    const minutes = (0, window_1.localClock)(input.now, input.timezone).minutes;
    if (!inWindow(minutes, input.windowStart, input.windowEnd)) {
        return `hors de sa plage horaire (${hhmm(input.windowStart)} → ${hhmm(input.windowEnd)})`;
    }
    if (input.target > 0 && input.published >= input.target) {
        return `objectif atteint (${input.published}/${input.target})`;
    }
    const slack = Math.max(1, Math.ceil(input.target * 0.05));
    if (input.spread && input.target > 0 && input.published >= input.expected + slack) {
        return `en avance sur son rythme (${input.published} publiés, ${input.expected} attendus à cette heure)`;
    }
    return null;
}
function unavailableReason(p, now) {
    if (p.status !== 'ACTIVE')
        return 'désactivé dans la plateforme';
    if (!p.externalId)
        return 'sans profil NSTBrowser';
    if (p.facebookSuspension === 'disabled')
        return 'compte suspendu par Facebook';
    if (p.facebookSuspension === 'checkpoint')
        return 'vérification demandée par Facebook';
    if (p.facebookSuspension === 'logged_out')
        return 'déconnecté de Facebook';
    if (p.runner?.pausedUntil && p.runner.pausedUntil.getTime() > now.getTime()) {
        return `limité par Facebook jusqu’au ${p.runner.pausedUntil.toISOString().slice(0, 16).replace('T', ' ')} UTC`;
    }
    if (!p.runner || p.runner.mode === 'OFF')
        return 'arrêté dans le Pilotage';
    if (p.runner.browserState === 'ERROR')
        return 'NSTBrowser n’a pas pu ouvrir son navigateur';
    return null;
}
function poolOf(candidates, size, now) {
    const unavailable = candidates
        .map((p) => ({ p, why: unavailableReason(p, now) }))
        .filter((x) => Boolean(x.why))
        .map(({ p, why }) => ({ id: p.id, name: p.name, why }));
    const down = new Set(unavailable.map((u) => u.id));
    const atWork = (p) => Boolean(p.runner?.running && p.runner.lastSeenAt && now.getTime() - p.runner.lastSeenAt.getTime() < 180_000) ||
        p.runner?.browserState === 'RUNNING' ||
        p.runner?.browserState === 'STARTING';
    const healthy = candidates
        .filter((p) => !down.has(p.id))
        .sort((a, b) => Number(atWork(b)) - Number(atWork(a)) || a.createdAt.getTime() - b.createdAt.getTime());
    const active = healthy.slice(0, size).map((p) => ({ id: p.id, name: p.name }));
    const standby = healthy.slice(size).map((p) => ({ id: p.id, name: p.name }));
    return { size, active, standby, unavailable, missing: Math.max(0, size - active.length) };
}
function campaignCapacity(input) {
    const { candidates, now } = input;
    const atWork = (p) => Boolean(p.runner?.running && p.runner.lastSeenAt && now.getTime() - p.runner.lastSeenAt.getTime() < 180_000) ||
        p.runner?.browserState === 'RUNNING' ||
        p.runner?.browserState === 'STARTING';
    const down = new Map();
    let working = 0;
    let idle = 0;
    for (const p of candidates) {
        const why = unavailableReason(p, now);
        if (why) {
            const key = why.replace(/ jusqu.au .*$/, '');
            down.set(key, (down.get(key) ?? 0) + 1);
        }
        else if (atWork(p))
            working += 1;
        else
            idle += 1;
    }
    const perProfile = 60 / Math.max(1, input.minGap + input.publishMinutes);
    const perHour = Math.floor(working * perProfile);
    const need = input.remaining > 0 ? input.neededPerHour : 0;
    const neededProfiles = need ? Math.ceil(need / perProfile) : 0;
    const missingProfiles = Math.max(0, neededProfiles - working);
    const unavailable = [...down].map(([why, count]) => ({ why, count })).sort((a, b) => b.count - a.count);
    const reasons = [];
    if (input.remaining > 0 && ['late', 'on_track', 'missed', 'ahead'].includes(input.status)) {
        if (missingProfiles) {
            reasons.push(`${working} profil(s) au travail : ~${perHour}/h au mieux, il faut ${need}/h — il faudrait ~${neededProfiles} profils au travail (${missingProfiles} de plus)`);
        }
        if (input.stock < input.remaining) {
            reasons.push(`pas assez de posts en file : ${input.stock} pour ${input.remaining} à publier — ajoutez des articles ou des groupes`);
        }
        if (working && input.ratePerHour < perHour * 0.5) {
            reasons.push(`les profils au travail publient ${input.ratePerHour}/h au lieu de ~${perHour}/h : cycles de repos, plafonds par groupe ou par profil, groupes déjà servis`);
        }
        if (idle)
            reasons.push(`${idle} profil(s) en état mais pas au travail : navigateur fermé, au repos, en veille ou hors rotation`);
        for (const u of unavailable)
            reasons.push(`${u.count} profil(s) hors service : ${u.why}`);
    }
    return { working, idle, unavailable, perProfile: Math.round(perProfile * 10) / 10, perHour, neededPerHour: need, neededProfiles, missingProfiles, reasons };
}
//# sourceMappingURL=period.js.map