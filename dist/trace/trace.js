"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TRACE_KINDS = void 0;
exports.trace = trace;
exports.canonicalGroupPostUrl = canonicalGroupPostUrl;
exports.groupKeyOf = groupKeyOf;
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
    URL_ATTACHED: 'Lien collé à la main : publication retrouvée et complétée',
    VERIFIED_OK: 'Vérifié : en ligne avec son lien',
    VERIFY_PENDING: 'Vérifié : en attente de validation',
    APPROVAL_PENDING: 'Soumis : en attente de validation par l’administrateur du groupe',
    APPROVED: 'Validé par l’administrateur du groupe : visible',
    NOT_APPROVED: 'Non validé en 24 h',
    VERIFY_UNREACHABLE: 'Vérification impossible',
    VERIFY_MISSING_POST: 'Vérifié : introuvable',
    VERIFY_MISSING_LINK: 'Vérifié : en ligne sans son lien',
    DELETED: 'Supprimé par le vérificateur',
    DELETE_FAILED: 'Suppression impossible',
    REQUEUED: 'Remis dans la file',
    REPEAT_QUEUED: 'Republication programmée (duplication)',
    RECREATED: 'Recréé à la main depuis l’article',
    NEEDS_ACTION: 'À traiter',
    RESOLVED_OK: 'Validé à la main',
    RESCUE_REQUESTED: '🛟 Lien manquant : sauvetage demandé à un autre profil du groupe',
    RESCUED: '🛟 Lien posé par un profil sauveteur',
    RESCUE_FAILED: '🛟 Sauvetage impossible : le vérificateur reprend la main',
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
function canonicalGroupPostUrl(raw) {
    let u;
    try {
        u = new URL(String(raw ?? '').trim());
    }
    catch {
        return null;
    }
    if (!/(^|\.)facebook\.com$/i.test(u.hostname))
        return null;
    const make = (group, post) => `https://www.facebook.com/groups/${group}/posts/${post}`;
    const path = u.pathname.replace(/\/+$/, '');
    const inGroup = /^\/groups\/([^/]+)(?:\/(posts|permalink)\/(\d+))?$/i.exec(path);
    if (inGroup) {
        if (inGroup[3])
            return make(inGroup[1], inGroup[3]);
        const multi = (u.searchParams.get('multi_permalinks') || '').split(',')[0];
        return /^\d+$/.test(multi) ? make(inGroup[1], multi) : null;
    }
    if (/^\/photo(\.php)?$/i.test(path)) {
        const set = /^gm\.(\d+)$/.exec(u.searchParams.get('set') || '');
        const group = u.searchParams.get('idorvanity');
        return set && group ? make(group, set[1]) : null;
    }
    return null;
}
function groupKeyOf(raw) {
    const canonical = canonicalGroupPostUrl(raw);
    const m = /\/groups\/([^/?#]+)/i.exec(canonical ?? String(raw ?? ''));
    if (!m)
        return null;
    try {
        return decodeURIComponent(m[1]).toLowerCase();
    }
    catch {
        return m[1].toLowerCase();
    }
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