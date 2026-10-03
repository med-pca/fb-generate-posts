"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LoginThrottle = exports.MAX_PER_IP = exports.MAX_PER_USER = exports.WINDOW_MS = void 0;
exports.WINDOW_MS = 15 * 60_000;
exports.MAX_PER_USER = 5;
exports.MAX_PER_IP = 20;
class LoginThrottle {
    failures = new Map();
    recent(key, now) {
        const kept = (this.failures.get(key) || []).filter((t) => now - t < exports.WINDOW_MS);
        if (kept.length)
            this.failures.set(key, kept);
        else
            this.failures.delete(key);
        return kept;
    }
    blockedFor(ip, username, now = Date.now()) {
        const user = this.recent(`u:${ip}:${username.toLowerCase()}`, now);
        const byIp = this.recent(`ip:${ip}`, now);
        const over = [
            user.length >= exports.MAX_PER_USER ? user[user.length - exports.MAX_PER_USER] : null,
            byIp.length >= exports.MAX_PER_IP ? byIp[byIp.length - exports.MAX_PER_IP] : null,
        ].filter((t) => t !== null);
        if (!over.length)
            return null;
        return Math.max(1, Math.ceil((Math.max(...over) + exports.WINDOW_MS - now) / 1000));
    }
    fail(ip, username, now = Date.now()) {
        for (const key of [`u:${ip}:${username.toLowerCase()}`, `ip:${ip}`]) {
            this.failures.set(key, [...this.recent(key, now), now]);
        }
    }
    succeed(ip, username) {
        this.failures.delete(`u:${ip}:${username.toLowerCase()}`);
    }
}
exports.LoginThrottle = LoginThrottle;
//# sourceMappingURL=login-throttle.js.map