"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.cycleRule = cycleRule;
exports.cycleSince = cycleSince;
function cycleRule(settings, runner) {
    const own = runner?.cycleMaxPosts;
    const max = own != null ? (own > 0 ? own : null) : settings?.cycleMaxPosts && settings.cycleMaxPosts > 0 ? settings.cycleMaxPosts : null;
    const hours = Math.max(1, runner?.cyclePauseHours ?? settings?.cyclePauseHours ?? 12);
    return { max, hours };
}
function cycleSince(runner, now) {
    const day = new Date(now.getTime() - 24 * 3_600_000);
    const start = runner?.cycleStartedAt;
    return start && start > day ? start : day;
}
//# sourceMappingURL=cycle.js.map