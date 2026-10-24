import { Prisma } from '@prisma/client';

/** Ce qui arrive à une publication, dans l'ordre où ça arrive. */
export const TRACE_KINDS = {
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
} as const;
export type TraceKind = keyof typeof TRACE_KINDS;

export type TraceInput = {
  postTargetId: string;
  kind: TraceKind;
  facebookUrl?: string | null;
  actor?: string | null;
  profileId?: string | null;
  jobId?: string | null;
  detail?: string | null;
};

type Client = { publicationTrace: Prisma.TransactionClient['publicationTrace'] };

/** Une ligne d'historique. Écrite dans la même transaction que le
 * changement qu'elle raconte : l'un ne va pas sans l'autre. */
export function trace(client: Client, input: TraceInput) {
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

/** Le lien d'un post de groupe sous sa forme de référence,
 * `https://www.facebook.com/groups/<groupe>/posts/<post>`, quand l'adresse
 * collée en a une autre :
 *   - lien de la PHOTO d'un post : `/photo/?fbid=…&set=gm.<post>&idorvanity=<groupe>` ;
 *   - fil du groupe ouvert sur le post : `/groups/<groupe>/?multi_permalinks=<post>` ;
 *   - ancienne forme : `/groups/<groupe>/permalink/<post>`.
 * `null` si l'adresse ne désigne pas un post de groupe reconnaissable. */
export function canonicalGroupPostUrl(raw: string | null | undefined): string | null {
  let u: URL;
  try {
    u = new URL(String(raw ?? '').trim());
  } catch {
    return null;
  }
  if (!/(^|\.)facebook\.com$/i.test(u.hostname)) return null;
  const make = (group: string, post: string) => `https://www.facebook.com/groups/${group}/posts/${post}`;
  const path = u.pathname.replace(/\/+$/, '');
  const inGroup = /^\/groups\/([^/]+)(?:\/(posts|permalink)\/(\d+))?$/i.exec(path);
  if (inGroup) {
    if (inGroup[3]) return make(inGroup[1], inGroup[3]);
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

/** Le groupe nommé dans une adresse Facebook (`/groups/<id ou nom>/…`, ou le
 * paramètre `idorvanity` d'un lien de photo), en minuscules ; `null` si
 * l'adresse ne le dit pas. */
export function groupKeyOf(raw: string | null | undefined): string | null {
  const canonical = canonicalGroupPostUrl(raw);
  const m = /\/groups\/([^/?#]+)/i.exec(canonical ?? String(raw ?? ''));
  if (!m) return null;
  try {
    return decodeURIComponent(m[1]).toLowerCase();
  } catch {
    return m[1].toLowerCase();
  }
}

/** Une adresse Facebook comparable : sans protocole, sans www/m., sans
 * paramètres de suivi, sans barre finale. Garde ce qui identifie le post. */
export function normalizeFacebookUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;
  try {
    const u = new URL(String(raw).trim());
    if (!/(^|\.)facebook\.com$/i.test(u.hostname)) return null;
    const keep = new URLSearchParams();
    for (const k of ['story_fbid', 'id', 'fbid', 'set']) {
      const v = u.searchParams.get(k);
      if (v) keep.set(k, v);
    }
    const q = keep.toString();
    return `https://www.facebook.com${u.pathname.replace(/\/+$/, '')}${q ? `?${q}` : ''}`;
  } catch {
    return null;
  }
}
