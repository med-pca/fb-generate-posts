import { BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { CurrentUser } from '../auth/current-user';
import { groupWhere, scopeOf } from '../auth/scope';

/** Les groupes d'un post, validés une seule fois pour tous les chemins qui
 * en créent (à la main, depuis un article, import JSON, génération).
 *
 * Un post n'est lié qu'à des groupes, jamais à un profil : c'est le profil
 * qui vient le chercher dans le groupe où il publie. Ses groupes doivent donc
 * être atteignables par l'appelant, actifs, et d'une même catégorie — le
 * public d'un même contenu. Rend les identifiants dédoublonnés. */
export async function postGroupIds(
  prisma: Pick<PrismaService, 'group'>,
  groupIds: string[],
  acting: CurrentUser | null,
) {
  const unique = [...new Set(groupIds)];
  if (!unique.length) {
    throw new BadRequestException('Choisissez au moins un groupe');
  }
  const groups = await prisma.group.findMany({
    where: {
      id: { in: unique },
      status: 'ACTIVE',
      ...groupWhere(scopeOf(acting)),
    },
    select: { categoryId: true },
  });
  if (groups.length !== unique.length) {
    throw new BadRequestException('Groupe introuvable ou inactif');
  }
  if (new Set(groups.map((group) => group.categoryId)).size > 1) {
    throw new BadRequestException(
      'Les groupes d’un post doivent appartenir à la même catégorie',
    );
  }
  return unique;
}
