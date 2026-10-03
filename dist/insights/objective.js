"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.windowLength = windowLength;
exports.minutesIntoWindow = minutesIntoWindow;
exports.pace = pace;
function windowLength(start, end) {
    if (start === end)
        return 1440;
    return end > start ? end - start : 1440 - start + end;
}
function minutesIntoWindow(now, start, end) {
    const length = windowLength(start, end);
    if (start === end)
        return now;
    if (end > start)
        return Math.min(length, Math.max(0, now - start));
    if (now >= start)
        return now - start;
    if (now < end)
        return 1440 - start + now;
    return length;
}
function pace(input) {
    const { target, start, end, nowMinutes, published, lastHour } = input;
    const length = windowLength(start, end);
    const into = minutesIntoWindow(nowMinutes, start, end);
    const elapsed = length ? into / length : 1;
    const minutesLeft = Math.max(0, length - into);
    const expected = Math.round(target * elapsed);
    const remaining = Math.max(0, target - published);
    const ratePerHour = lastHour;
    const neededPerHour = minutesLeft
        ? Math.ceil((remaining / minutesLeft) * 60)
        : remaining;
    const projection = published + Math.round((ratePerHour * minutesLeft) / 60);
    let status;
    if (target <= 0)
        status = 'no_target';
    else if (published >= target)
        status = 'reached';
    else if (into <= 0 && end > start)
        status = 'not_started';
    else if (minutesLeft === 0)
        status = 'missed';
    else if (published >= expected)
        status = 'ahead';
    else if (published >= expected * 0.9)
        status = 'on_track';
    else
        status = 'late';
    return {
        status,
        target,
        published,
        expected,
        delta: published - expected,
        remaining,
        elapsed,
        minutesLeft,
        ratePerHour,
        neededPerHour,
        projection,
    };
}
//# sourceMappingURL=objective.js.map