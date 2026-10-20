import { Prisma } from '@prisma/client';

/* Chaque compte garde ses publications : qui peut publier quoi. */

/** Le profil qui publie, et le rôle de son propriétaire. */
export type ClaimProfile = {
  id: string;
  ownerId: string | null;
  owner?: { role: string } | null;
};

/** Ce qu'il faut savoir d'un post pour dire qui le publie : son compte, et
 * les comptes avec qui le site de son article est partagé. */
export type ClaimPost = {
  profileId?: string | null;
  ownerId: string | null;
  owner?: { role: string } | null;
  article?: { source: { access: Array<{ userId: string }> } } | null;
};

/** Les profils de la maison : sans propriétaire (synchronisation NSTBrowser)
 * ou à un ADMIN. Un propriétaire dont on ignore le rôle compte comme
 * gestionnaire : mieux vaut ne pas publier que publier chez un autre. */
export const isHouseProfile = (profile: ClaimProfile) =>
  !profile.ownerId || profile.owner?.role === 'ADMIN';

const sharedWith = (post: ClaimPost) => post.article?.source.access.map((a) => a.userId) ?? [];

/** La même règle, pour un post déjà chargé (listes de profils proposés). */
export function mayPublishPost(profile: ClaimProfile, post: ClaimPost) {
  if (post.profileId) return post.profileId === profile.id;
  if (post.ownerId && post.ownerId === profile.ownerId) return true;
  if (profile.ownerId && sharedWith(post).includes(profile.ownerId)) return true;
  return (!post.ownerId || post.owner?.role === 'ADMIN') && isHouseProfile(profile);
}

/** Chaque compte garde ses publications : un profil de gestionnaire publie
 * les posts de son gestionnaire, et ceux des sites qu'on lui a partagés (le
 * dépôt WordPress donne au post le propriétaire du site, pas celui qui
 * l'exploite) ; les profils de la maison, ceux des ADMIN et ceux sans
 * propriétaire. Un post créé à la main dans l'admin appartient au compte
 * admin, alors que les profils synchronisés n'ont pas de propriétaire : les
 * deux vont ensemble. */
export function claimablePostWhere(profile: ClaimProfile): Prisma.PostWhereInput {
  return {
    OR: [
      { profileId: profile.id },
      {
        profileId: null,
        OR: [
          ...(profile.ownerId
            ? [
                { ownerId: profile.ownerId },
                { article: { source: { access: { some: { userId: profile.ownerId } } } } },
              ]
            : []),
          ...(isHouseProfile(profile) ? [{ ownerId: null }, { owner: { role: 'ADMIN' as const } }] : []),
        ],
      },
    ],
  };
}

/** Côté profil : ceux qui peuvent toucher à ce post (le publier, y poser
 * le lien). Le compte du post, ceux avec qui son site est partagé, ou la
 * maison pour un post d'ADMIN ou sans propriétaire. */
export function profilesForPostWhere(post: ClaimPost): Prisma.ProfileWhereInput {
  const shared = sharedWith(post);
  const sharedProfiles = shared.length ? [{ ownerId: { in: shared } }] : [];
  if (post.ownerId && post.owner?.role !== 'ADMIN') {
    return { OR: [{ ownerId: post.ownerId }, ...sharedProfiles] };
  }
  return {
    OR: [
      { ownerId: null },
      { owner: { role: 'ADMIN' } },
      ...(post.ownerId ? [{ ownerId: post.ownerId }] : []),
      ...sharedProfiles,
    ],
  };
}

/** Un post qui peut partir : sans article, ou d'un article actif dont le
 * site n'est pas en pause (⏸ limite publicitaire…). Un site en pause garde
 * ses posts, qui repartent à sa réactivation — ou sont déplacés vers le site
 * qui prend le relais. */
export const publishableArticleWhere: Prisma.PostWhereInput = {
  OR: [{ articleId: null }, { article: { status: 'ACTIVE', source: { pausedAt: null } } }],
};
