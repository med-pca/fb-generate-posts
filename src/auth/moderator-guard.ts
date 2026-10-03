import { ForbiddenException } from '@nestjs/common';
import { Role } from '@prisma/client';
import type { CurrentUser } from './current-user';

export const MODERATOR_LOCKED =
  'Profil modérateur : seul un administrateur de la plateforme peut le modifier (rubrique Modérateurs)';

/** Un profil modérateur ne se touche que par un ADMIN de la plateforme :
 * ni un gestionnaire, ni une action en masse lancée par lui. La clé
 * d'automatisation globale (acting = null) reste autorisée : c'est l'admin. */
export function assertMayManage(profile: { isModerator: boolean }, acting: CurrentUser | null | undefined) {
  if (profile.isModerator && acting && acting.role !== Role.ADMIN) {
    throw new ForbiddenException(MODERATOR_LOCKED);
  }
}

export const isAdmin = (acting: CurrentUser | null | undefined) => !acting || acting.role === Role.ADMIN;
