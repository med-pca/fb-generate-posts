import { Prisma } from '@prisma/client';

/* Chaque compte garde ses publications : qui peut publier quoi. */

/** Le profil qui publie, et le rôle de son propriétaire. */
export type ClaimProfile = {
  id: string;
  ownerId: string | null;
  owner?: { role: string } | null;
};

/** Les profils de la maison : sans propriétaire (synchronisation NSTBrowser)
 * ou à un ADMIN. Un propriétaire dont on ignore le rôle compte comme
 * gestionnaire : mieux vaut ne pas publier que publier chez un autre. */
export const isHouseProfile = (profile: ClaimProfile) =>
  !profile.ownerId || profile.owner?.role === 'ADMIN';

/** La même règle, pour un post déjà chargé (listes de profils proposés). */
export function mayPublishPost(
  profile: ClaimProfile,
  post: { profileId?: string | null; ownerId: string | null; owner?: { role: string } | null },
) {
  if (post.profileId) return post.profileId === profile.id;
  if (post.ownerId && post.ownerId === profile.ownerId) return true;
  return (!post.ownerId || post.owner?.role === 'ADMIN') && isHouseProfile(profile);
}

/** Chaque compte garde ses publications : un profil de gestionnaire ne
 * publie que les posts de son gestionnaire ; les profils de la maison, ceux
 * des ADMIN et ceux sans propriétaire. Un post créé à la main dans l'admin
 * appartient au compte admin, alors que les profils synchronisés n'ont pas
 * de propriétaire : les deux vont ensemble. */
export function claimablePostWhere(profile: ClaimProfile): Prisma.PostWhereInput {
  return {
    OR: [
      { profileId: profile.id },
      {
        profileId: null,
        OR: [
          ...(profile.ownerId ? [{ ownerId: profile.ownerId }] : []),
          ...(isHouseProfile(profile) ? [{ ownerId: null }, { owner: { role: 'ADMIN' as const } }] : []),
        ],
      },
    ],
  };
}

/** Côté profil : ceux qui peuvent toucher à ce post (le publier, y poser
 * le lien). Le compte du post, ou la maison pour un post d'ADMIN ou sans
 * propriétaire. */
export function profilesForPostWhere(post: {
  ownerId: string | null;
  owner?: { role: string } | null;
}): Prisma.ProfileWhereInput {
  if (post.ownerId && post.owner?.role !== 'ADMIN') return { ownerId: post.ownerId };
  return {
    OR: [
      { ownerId: null },
      { owner: { role: 'ADMIN' } },
      ...(post.ownerId ? [{ ownerId: post.ownerId }] : []),
    ],
  };
}
