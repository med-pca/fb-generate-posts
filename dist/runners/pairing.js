"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BROKEN_PAIRINGS = exports.PAIRING_STALE_HOURS = exports.keyHash = void 0;
exports.pairingHealth = pairingHealth;
const node_crypto_1 = require("node:crypto");
const keyHash = (key) => (0, node_crypto_1.createHash)('sha256').update(key).digest('hex');
exports.keyHash = keyHash;
exports.PAIRING_STALE_HOURS = 24;
exports.BROKEN_PAIRINGS = ['key_changed', 'id_changed', 'rejected'];
function pairingHealth(runner, profile, currentKeyHash, now = new Date()) {
    const ok = (state, detail) => ({
        state,
        detail,
        broken: exports.BROKEN_PAIRINGS.includes(state),
    });
    const codePending = Boolean(runner?.pairCode) &&
        (runner?.pairCodeExpiresAt?.getTime() ?? 0) > now.getTime();
    if (!runner?.pairedAt) {
        return codePending
            ? ok('code_pending', 'Code émis : à coller dans l’extension du navigateur')
            : ok('never', 'Jamais appairé');
    }
    if (runner.pairedExternalId && runner.pairedExternalId !== profile.externalId) {
        return ok('id_changed', `L’identifiant NSTBrowser a changé depuis l’appairage (${runner.pairedExternalId} → ${profile.externalId ?? 'aucun'}) : ré-appairer`);
    }
    if (runner.pairedKeyHash && currentKeyHash && runner.pairedKeyHash !== currentKeyHash) {
        return ok('key_changed', 'La clé du compte a changé depuis l’appairage (clé régénérée, ou profil passé à un autre compte) : ré-appairer');
    }
    if (runner.keyRejectedAt &&
        (!runner.lastSeenAt || runner.keyRejectedAt > runner.lastSeenAt)) {
        return ok('rejected', `Le navigateur bat, mais il est refusé : ${runner.keyRejectReason ?? 'clé invalide'} — ré-appairer`);
    }
    const seenSincePairing = runner.lastSeenAt && runner.lastSeenAt.getTime() >= runner.pairedAt.getTime();
    if (!seenSincePairing) {
        return ok('unconfirmed', 'Appairé, mais aucun battement depuis : ouvrez le navigateur pour le confirmer');
    }
    const hours = (now.getTime() - runner.lastSeenAt.getTime()) / 3_600_000;
    if (hours > exports.PAIRING_STALE_HOURS) {
        return ok('stale', `Pas vu depuis ${Math.round(hours / 24) || 1} j : ouvrez le navigateur pour le confirmer`);
    }
    return ok('confirmed', 'Confirmé par un battement récent');
}
//# sourceMappingURL=pairing.js.map