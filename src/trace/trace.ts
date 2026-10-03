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
