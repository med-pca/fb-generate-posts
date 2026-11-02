import { Prisma } from '@prisma/client';

/** Pourquoi le lien de l'article n'est pas posé (« Manquant ») : la première
 * raison qui s'applique, dans cet ordre. Le filtre « Lien » de l'audit suit
 * le même ordre, pour qu'une ligne tombe sous un seul titre. */
export const MISSING_WHY = ['approval', 'removed', 'rescue', 'rescue_failed', 'no_url', 'comment_error', 'unknown'] as const;
export type MissingWhy = (typeof MISSING_WHY)[number];

/** Au-delà, une publication jamais validée par le groupe est tenue pour
 * refusée (ou classée en spam). Même délai que la vérification. */
const APPROVAL_GIVE_UP_MS = 24 * 3_600_000;

export type WhyRow = {
  approvalPendingSince: Date | null;
  verifyDetail: string | null;
  rescueStatus: string | null;
  rescueDetail: string | null;
  facebookUrl: string | null;
  jobItems: Array<{ error?: string | null }>;
};

/** Ce que la plateforme sait d'un lien manquant : un titre court, une
 * explication et ce qu'il faut faire. */
export function missingWhy(r: WhyRow, now = new Date()): { code: MissingWhy; title: string; detail: string; todo: string } {
  if (r.approvalPendingSince) {
    const late = now.getTime() - r.approvalPendingSince.getTime() > APPROVAL_GIVE_UP_MS;
    return late
      ? {
          code: 'approval',
          title: '🚫 Refusé ou spam',
          detail: `Envoyé au groupe le ${fr(r.approvalPendingSince)}, jamais validé par ses administrateurs : refusé, ou classé en spam par Facebook.`,
          todo: 'Regarder dans le groupe (publications en attente / spam). Si le post est en ligne, coller son lien.',
        }
      : {
          code: 'approval',
          title: '⏳ En attente de validation',
          detail: `Le groupe exige la validation d’un administrateur (envoyé le ${fr(r.approvalPendingSince)}) : le post n’est pas encore visible, le lien sera posé une fois validé.`,
          todo: 'Rien à faire : le profil revient voir après chaque lot.',
        };
  }
  if (r.verifyDetail && /introuvable/i.test(r.verifyDetail)) {
    return {
      code: 'removed',
      title: '🗑 Introuvable (supprimé ou spam)',
      detail: `Le vérificateur ne trouve plus le post dans le groupe : supprimé par un administrateur, ou masqué/classé en spam par Facebook. (${r.verifyDetail})`,
      todo: 'Il sera republié automatiquement, dans la limite des republications.',
    };
  }
  if (r.rescueStatus === 'pending' || r.rescueStatus === 'claimed') {
    return {
      code: 'rescue',
      title: '🛟 Sauvetage en cours',
      detail: 'L’auteur n’a pas posé le lien : un autre de nos profils du groupe va ouvrir le post et le poser en commentaire.',
      todo: 'Rien à faire : attendre le passage d’un profil sauveteur.',
    };
  }
  if (r.rescueStatus === 'failed') {
    return {
      code: 'rescue_failed',
      title: '🛟 Sauvetage échoué',
      detail: `Aucun autre profil n’a pu poser le lien${r.rescueDetail ? ` : ${r.rescueDetail}` : ''}.`,
      todo: 'Poser le lien à la main en commentaire, ou republier le post.',
    };
  }
  if (!r.facebookUrl) {
    return {
      code: 'no_url',
      title: '❓ Adresse du post inconnue',
      detail: 'L’extension n’a pas retrouvé l’adresse du post après la publication : impossible d’y poser le lien. Souvent un post bloqué par Facebook (spam) ou en attente sans que la page le dise.',
      todo: 'Chercher le post dans le groupe et coller son lien (⋯ → Coller le lien Facebook).',
    };
  }
  const error = r.jobItems.find((i) => i.error)?.error;
  if (error) {
    return {
      code: 'comment_error',
      title: '💬 Commentaire refusé',
      detail: `Le profil n’a pas pu commenter : ${error}`,
      todo: 'Commentaires fermés, ou profil limité par Facebook : vérifier le post et le profil.',
    };
  }
  return {
    code: 'unknown',
    title: '⚠ Commentaire non posé',
    detail: 'Le post est en ligne, mais son auteur n’a pas posé le commentaire et n’a donné aucune raison (navigateur fermé, page changée…).',
    todo: 'Le vérificateur le contrôlera ; sinon, poser le lien à la main.',
  };
}

/** Le filtre de chaque raison, dans le même ordre que `missingWhy`. */
export function missingWhyWhere(code: MissingWhy): Prisma.PostTargetWhereInput {
  const conds: Record<MissingWhy, Prisma.PostTargetWhereInput> = {
    approval: { approvalPendingSince: { not: null } },
    removed: { verifyDetail: { contains: 'introuvable', mode: 'insensitive' } },
    rescue: { rescueStatus: { in: ['pending', 'claimed'] } },
    rescue_failed: { rescueStatus: 'failed' },
    no_url: { facebookUrl: null },
    comment_error: { jobItems: { some: { status: 'PUBLISHED', error: { not: null } } } },
    unknown: {},
  };
  const before = MISSING_WHY.slice(0, MISSING_WHY.indexOf(code)).map((c) => conds[c]);
  return { AND: [conds[code], ...before.map((c) => ({ NOT: c }))] };
}

const fr = (d: Date) =>
  d.toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris' });
