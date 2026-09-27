"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.formatWindow = void 0;
exports.localClock = localClock;
exports.parseDays = parseDays;
exports.insideWindow = insideWindow;
const DAYS = {
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
    Sun: 7,
};
const DAY_NAMES = [
    '',
    'lundi',
    'mardi',
    'mercredi',
    'jeudi',
    'vendredi',
    'samedi',
    'dimanche',
];
function localClock(now, timeZone) {
    for (const zone of [timeZone, 'UTC']) {
        try {
            const parts = new Intl.DateTimeFormat('en-GB', {
                timeZone: zone,
                hour12: false,
                hour: '2-digit',
                minute: '2-digit',
                weekday: 'short',
            }).formatToParts(now);
            const get = (type) => parts.find((part) => part.type === type)?.value ?? '';
            const hour = Number(get('hour')) % 24;
            return {
                minutes: hour * 60 + Number(get('minute')),
                isoDay: DAYS[get('weekday')] ?? 1,
                fallback: zone !== timeZone,
            };
        }
        catch {
        }
    }
    return { minutes: 0, isoDay: 1, fallback: true };
}
function parseDays(days) {
    if (!days)
        return [];
    return [
        ...new Set(String(days)
            .split(/[,\s]+/)
            .map((part) => Number(part))
            .filter((day) => Number.isInteger(day) && day >= 1 && day <= 7)),
    ].sort();
}
const hhmm = (minutes) => `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
const formatWindow = (window) => {
    const hours = window.windowStart === null || window.windowEnd === null
        ? '24 h/24'
        : `${hhmm(window.windowStart)}–${hhmm(window.windowEnd)}`;
    const days = parseDays(window.days);
    return days.length && days.length < 7
        ? `${hours}, ${days.map((day) => DAY_NAMES[day]).join(', ')}`
        : hours;
};
exports.formatWindow = formatWindow;
function insideWindow(clock, window) {
    const { windowStart: start, windowEnd: end } = window;
    const allowed = parseDays(window.days);
    const overnight = start !== null && end !== null && start > end;
    const owningDay = overnight && clock.minutes < end
        ? ((clock.isoDay + 5) % 7) + 1
        : clock.isoDay;
    if (allowed.length && !allowed.includes(owningDay)) {
        return {
            inside: false,
            reason: `${DAY_NAMES[owningDay]} n’est pas un jour autorisé ` +
                `(${allowed.map((day) => DAY_NAMES[day]).join(', ')})`,
        };
    }
    if (start === null || end === null || start === end) {
        return { inside: true, reason: 'aucune limite d’heure' };
    }
    const inside = overnight
        ? clock.minutes >= start || clock.minutes < end
        : clock.minutes >= start && clock.minutes < end;
    return {
        inside,
        reason: inside
            ? `dans la fenêtre ${hhmm(start)}–${hhmm(end)}`
            : `hors de la fenêtre ${hhmm(start)}–${hhmm(end)} (il est ${hhmm(clock.minutes)} sur place)`,
    };
}
//# sourceMappingURL=window.js.map