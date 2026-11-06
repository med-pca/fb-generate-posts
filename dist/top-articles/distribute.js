"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.OTHERS_COOLDOWN_DAYS = exports.PER_USER = void 0;
exports.distribute = distribute;
exports.PER_USER = 10;
exports.OTHERS_COOLDOWN_DAYS = 7;
const addDays = (day, n) => {
    const d = new Date(`${day}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
};
function distribute(pool, userIds, past, today, taken = new Set(), perUser = exports.PER_USER) {
    const want = (userId) => (typeof perUser === 'number' ? perUser : perUser.get(userId) ?? 0);
    const out = new Map(userIds.map((id) => [id, []]));
    const used = new Set(taken);
    const seenBy = new Map();
    const recentOwners = new Map();
    const since = addDays(today, -exports.OTHERS_COOLDOWN_DAYS);
    for (const p of past) {
        if (!seenBy.has(p.userId))
            seenBy.set(p.userId, new Set());
        seenBy.get(p.userId).add(p.url);
        if (p.day >= since && p.day < today) {
            if (!recentOwners.has(p.url))
                recentOwners.set(p.url, new Set());
            recentOwners.get(p.url).add(p.userId);
        }
    }
    const allowed = (userId, a, strict) => !used.has(a.url) &&
        !seenBy.get(userId)?.has(a.url) &&
        (!strict || ![...(recentOwners.get(a.url) ?? [])].some((u) => u !== userId));
    for (const strict of [true, false]) {
        let round = 0;
        for (;;) {
            const order = round % 2 === 0 ? userIds : [...userIds].reverse();
            let progressed = false;
            for (const userId of order) {
                const list = out.get(userId);
                if (list.length >= want(userId))
                    continue;
                const a = pool.find((x) => allowed(userId, x, strict));
                if (!a)
                    continue;
                list.push(a);
                used.add(a.url);
                progressed = true;
            }
            if (!progressed)
                break;
            round += 1;
        }
    }
    return out;
}
//# sourceMappingURL=distribute.js.map