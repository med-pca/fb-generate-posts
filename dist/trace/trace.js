"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TRACE_KINDS = void 0;
exports.trace = trace;
exports.normalizeFacebookUrl = normalizeFacebookUrl;
exports.TRACE_KINDS = {
    PUBLISHED: 'Publié',
    URL_MISSING: 'Publié sans adresse Facebook',
    COMMENTED: 'Commentaire posé',
    LINK_PLACED: 'Lien de l’article posé',
    FAILED: 'Échec de publication',
    RETRIED: 'Relancé',
    MARKED_PUBLISHED: 'Marqué publié à la main',
    URL_SET: 'Adresse Facebook enregistrée',
    URL_FOUND: 'Adresse retrouvée par le vérificateur',
    VERIFIED_OK: 'Vérifié : en ligne avec son lien',
    VERIFY_PENDING: 'Vérifié : en attente de validation',
    VERIFY_UNREACHABLE: 'Vérification impossible',
    VERIFY_MISSING_POST: 'Vérifié : introuvable',
    VERIFY_MISSING_LINK: 'Vérifié : en ligne sans son lien',
    DELETED: 'Supprimé par le vérificateur',
    DELETE_FAILED: 'Suppression impossible',
    REQUEUED: 'Remis dans la file',
    NEEDS_ACTION: 'À traiter',
    RESOLVED_OK: 'Validé à la main',
};
function trace(client, input) {
    return client.publicationTrace.create({
        data: {
            postTargetId: input.postTargetId,
            kind: input.kind,
            facebookUrl: input.facebookUrl || null,
            actor: input.actor ?? null,
            profileId: input.profileId ?? null,
            jobId: input.jobId ?? null,
            detail: input.detail ? String(input.detail).slice(0, 2000) : null,
        },
    });
}
function normalizeFacebookUrl(raw) {
    if (!raw)
        return null;
    try {
        const u = new URL(String(raw).trim());
        if (!/(^|\.)facebook\.com$/i.test(u.hostname))
            return null;
        const keep = new URLSearchParams();
        for (const k of ['story_fbid', 'id', 'fbid', 'set']) {
            const v = u.searchParams.get(k);
            if (v)
                keep.set(k, v);
        }
        const q = keep.toString();
        return `https://www.facebook.com${u.pathname.replace(/\/+$/, '')}${q ? `?${q}` : ''}`;
    }
    catch {
        return null;
    }
}
//# sourceMappingURL=trace.js.map