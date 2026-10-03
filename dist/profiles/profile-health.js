"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.HEALTH_LABELS = exports.HEALTH_WINDOW_DAYS = void 0;
exports.healthOf = healthOf;
exports.rankCandidates = rankCandidates;
exports.HEALTH_WINDOW_DAYS = 14;
exports.HEALTH_LABELS = {
    good: 'Bon',
    watch: 'À surveiller',
    bad: 'Mauvais',
    new: 'Pas assez de données',
};
const MIN_ATTEMPTS = 3;
const pct = (n) => `${Math.round(n * 100)} %`;
function healthOf(input) {
    const attempts = input.published + input.failed;
    const verified = input.verifiedOk + input.verifiedBad;
    const successRate = attempts ? input.published / attempts : null;
    const verifyRate = verified ? input.verifiedOk / verified : null;
    const linkRate = input.withLink ? input.linkPlaced / input.withLink : null;
    const reasons = [];
    if (input.failStreak >= 3)
        reasons.push(`${input.failStreak} échecs d'affilée sur ses dernières tentatives`);
    if (input.failed >= 5 && successRate !== null && successRate < 0.5) {
        reasons.push(`${input.failed} échecs en ${exports.HEALTH_WINDOW_DAYS} jours (${pct(successRate)} de réussite)`);
    }
    if (input.verifiedBad >= 3 && verifyRate !== null && verifyRate < 0.5) {
        reasons.push(`${input.verifiedBad} publications introuvables ou sans lien au contrôle du vérificateur`);
    }
    if (input.withLink >= 5 && linkRate !== null && linkRate < 0.5) {
        reasons.push(`lien de l'article posé sur ${pct(linkRate)} de ses publications seulement`);
    }
    if (input.claimsLost >= 3)
        reasons.push(`${input.claimsLost} réservations perdues (navigateur muet en pleine publication)`);
    if (attempts < MIN_ATTEMPTS && verified < MIN_ATTEMPTS) {
        return {
            score: null,
            label: 'new',
            successRate,
            verifyRate,
            linkRate,
            suggestDeactivate: input.failStreak >= 3,
            reasons,
        };
    }
    const s = successRate ?? 1;
    const v = verifyRate ?? s;
    const l = linkRate ?? 1;
    let score = 100 * (0.5 * s + 0.3 * v + 0.2 * l);
    if (input.failStreak > 1)
        score -= Math.min(30, (input.failStreak - 1) * 10);
    score = Math.max(0, Math.min(100, Math.round(score)));
    const label = score >= 80 ? 'good' : score >= 50 ? 'watch' : 'bad';
    return {
        score,
        label,
        successRate,
        verifyRate,
        linkRate,
        suggestDeactivate: reasons.length > 0 && (label === 'bad' || input.failStreak >= 3),
        reasons,
    };
}
function rankCandidates(candidates) {
    const value = (c) => c.score ?? 60;
    return [...candidates].sort((a, b) => b.coverage - a.coverage || value(b) - value(a) || Number(b.running) - Number(a.running));
}
//# sourceMappingURL=profile-health.js.map