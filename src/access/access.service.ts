import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { RecordStatus, Role } from '@prisma/client';
import type { CurrentUser } from '../auth/current-user';
import { PrismaService } from '../prisma/prisma.service';

/** Partager un groupe ou un site, en publication seule.
 *
 * Le bénéficiaire peut s'en servir — publier dans le groupe, déposer sur le
 * site — mais ni le renommer, ni le désactiver, ni le supprimer, ni le
 * repartager. C'est le propriétaire, ou un ADMIN, qui accorde.
 */
@Injectable()
export class AccessService {
  constructor(private readonly prisma: PrismaService) {}

  listGroupAccess(groupId: string, acting: CurrentUser | null) {
    return this.list('group', groupId, acting);
  }

  listSiteAccess(sourceId: string, acting: CurrentUser | null) {
    return this.list('site', sourceId, acting);
  }

  grantGroup(groupId: string, userId: string, acting: CurrentUser | null) {
    return this.grant('group', groupId, userId, acting);
  }

  grantSite(sourceId: string, userId: string, acting: CurrentUser | null) {
    return this.grant('site', sourceId, userId, acting);
  }

  revokeGroup(groupId: string, userId: string, acting: CurrentUser | null) {
    return this.revoke('group', groupId, userId, acting);
  }

  revokeSite(sourceId: string, userId: string, acting: CurrentUser | null) {
    return this.revoke('site', sourceId, userId, acting);
  }

  private async list(
    kind: 'group' | 'site',
    id: string,
    acting: CurrentUser | null,
  ) {
    await this.assertOwner(kind, id, acting);
    const rows =
      kind === 'group'
        ? await this.prisma.groupAccess.findMany({
            where: { groupId: id },
            include: {
              user: { select: { id: true, username: true, role: true } },
            },
            orderBy: { createdAt: 'asc' },
          })
        : await this.prisma.siteAccess.findMany({
            where: { sourceId: id },
            include: {
              user: { select: { id: true, username: true, role: true } },
            },
            orderBy: { createdAt: 'asc' },
          });
    return rows.map((row) => ({
      userId: row.user.id,
      username: row.user.username,
      role: row.user.role,
      grantedAt: row.createdAt,
    }));
  }

  private async grant(
    kind: 'group' | 'site',
    id: string,
    userId: string,
    acting: CurrentUser | null,
  ) {
    const owner = await this.assertOwner(kind, id, acting);
    if (userId === owner.ownerId) {
      throw new BadRequestException(
        'Le propriétaire a déjà tous les droits sur cette ressource',
      );
    }
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('Compte introuvable');
    if (user.status !== RecordStatus.ACTIVE) {
      throw new BadRequestException('Ce compte est désactivé');
    }
    // Un ADMIN voit déjà tout : lui partager quelque chose ne change rien
    // et laisserait croire que l'accès vient de là.
    if (user.role === Role.ADMIN) {
      throw new BadRequestException(
        'Un administrateur voit déjà toutes les ressources',
      );
    }
    const data = {
      userId,
      grantedBy: acting?.id ?? null,
      ...(kind === 'group' ? { groupId: id } : { sourceId: id }),
    };
    // Un partage déjà accordé n'est pas une erreur : on le laisse tel quel.
    if (kind === 'group') {
      await this.prisma.groupAccess.upsert({
        where: { groupId_userId: { groupId: id, userId } },
        create: data as {
          groupId: string;
          userId: string;
          grantedBy: string | null;
        },
        update: {},
      });
    } else {
      await this.prisma.siteAccess.upsert({
        where: { sourceId_userId: { sourceId: id, userId } },
        create: data as {
          sourceId: string;
          userId: string;
          grantedBy: string | null;
        },
        update: {},
      });
    }
    return { granted: true, userId, username: user.username };
  }

  private async revoke(
    kind: 'group' | 'site',
    id: string,
    userId: string,
    acting: CurrentUser | null,
  ) {
    await this.assertOwner(kind, id, acting);
    const { count } =
      kind === 'group'
        ? await this.prisma.groupAccess.deleteMany({
            where: { groupId: id, userId },
          })
        : await this.prisma.siteAccess.deleteMany({
            where: { sourceId: id, userId },
          });
    if (!count) throw new NotFoundException('Ce partage n’existe pas');
    return { revoked: true, userId };
  }

  /** Accorder et retirer appartiennent au propriétaire, ou à un ADMIN. Un
   * bénéficiaire ne repartage pas ce qu'on lui a prêté. */
  private async assertOwner(
    kind: 'group' | 'site',
    id: string,
    acting: CurrentUser | null,
  ) {
    const resource =
      kind === 'group'
        ? await this.prisma.group.findUnique({
            where: { id },
            select: { id: true, ownerId: true },
          })
        : await this.prisma.contentSource.findUnique({
            where: { id },
            select: { id: true, ownerId: true },
          });
    if (!resource) {
      throw new NotFoundException(
        kind === 'group' ? 'Groupe introuvable' : 'Site introuvable',
      );
    }
    if (!acting || acting.role === Role.ADMIN) return resource;
    if (resource.ownerId !== acting.id) {
      // Introuvable plutôt qu'interdit quand on n'y a aucun accès : un 403
      // confirmerait son existence à qui devine l'identifiant.
      throw resource.ownerId === null
        ? new NotFoundException('Ressource introuvable')
        : new ForbiddenException(
            'Seul le propriétaire partage cette ressource',
          );
    }
    return resource;
  }
}
