import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { JoinStatus, Prisma, TargetStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CategoriesService } from '../categories/categories.service';
import type { CurrentUser } from '../auth/current-user';
import {
  groupManageWhere,
  groupWhere,
  postWhere,
  profileWhere,
  scopeOf,
} from '../auth/scope';
import { CreateGroupDto } from './dto/create-group.dto';
import { UpdateGroupDto } from './dto/update-group.dto';
import { PaginationDto } from '../common/dto/pagination.dto';
import { paginated } from '../common/paginated';
import { UpdateJoinStatusDto } from './dto/update-join-status.dto';

@Injectable()
export class GroupsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly categories: CategoriesService,
  ) {}

  /** `owner` est celui qui crée : voir `ProfilesService.create`. */
  async create(
    profileId: string,
    dto: CreateGroupDto,
    owner: CurrentUser | null,
  ) {
    await this.reachableProfile(profileId, owner);
    const { categoryId, ...fields } = dto;
    return this.prisma.group.create({
      data: {
        ...fields,
        categoryId: await this.requiredCategory(categoryId),
        ownerId: owner?.id ?? null,
        profiles: { create: { profileId } },
      },
      include: { profiles: true },
    });
  }

  async findAll(profileId: string, acting: CurrentUser | null) {
    await this.reachableProfile(profileId, acting);
    const links = await this.prisma.profileGroup.findMany({
      where: { profileId, status: 'ACTIVE' },
      include: { group: true },
      orderBy: { createdAt: 'desc' },
    });
    return links.map((link) => link.group);
  }

  async link(profileId: string, groupId: string, acting: CurrentUser | null) {
    await this.reachableProfile(profileId, acting);
    await this.reachableGroup(groupId, acting);
    return this.prisma.profileGroup.upsert({
      where: { profileId_groupId: { profileId, groupId } },
      update: { status: 'ACTIVE' },
      create: { profileId, groupId },
      include: { profile: true, group: true },
    });
  }

  async unlink(profileId: string, groupId: string, acting: CurrentUser | null) {
    await this.reachableProfile(profileId, acting);
    return this.prisma.profileGroup.delete({
      where: { profileId_groupId: { profileId, groupId } },
    });
  }

  async findCatalog(
    { page, limit }: PaginationDto,
    acting: CurrentUser | null,
  ) {
    const scoped = groupWhere(scopeOf(acting));
    const [groups, total] = await this.prisma.$transaction([
      this.prisma.group.findMany({
        where: scoped,
        include: {
          profiles: { include: { profile: true } },
          category: { select: { id: true, name: true } },
          _count: { select: { targets: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.group.count({ where: scoped }),
    ]);
    // Le stock encore publiable : c'est lui qui déclenche l'alimentation
    // automatique, pas le nombre total de cibles déjà distribuées.
    const stocks = await this.prisma.postTarget.groupBy({
      by: ['groupId'],
      where: {
        groupId: { in: groups.map(({ id }) => id) },
        status: 'AVAILABLE',
        post: { status: 'AVAILABLE' },
      },
      _count: { _all: true },
    });
    const available = new Map(
      stocks.map((stock) => [stock.groupId, stock._count._all]),
    );
    const data = groups.map((group) => ({
      ...group,
      availablePosts: available.get(group.id) ?? 0,
    }));
    return paginated(data, total, page, limit);
  }

  /** Ce qu'un appelant peut atteindre, ou une 404 : une ressource hors de
   * portée est introuvable, pas interdite — répondre 403 confirmerait son
   * existence. */
  private async reachableGroup(id: string, acting: CurrentUser | null) {
    const group = await this.prisma.group.findFirst({
      where: { id, ...groupWhere(scopeOf(acting)) },
      select: { id: true },
    });
    if (!group) throw new NotFoundException('Groupe introuvable');
    return group;
  }

  /** Modifier suppose posséder. Un groupe partagé se voit et sert à
   * publier ; le renommer ou le désactiver appartient à son propriétaire —
   * d'autres comptes s'en servent peut-être. */
  private async ownedGroup(id: string, acting: CurrentUser | null) {
    const group = await this.prisma.group.findFirst({
      where: { id, ...groupManageWhere(scopeOf(acting)) },
      select: { id: true },
    });
    if (!group) {
      const shared = await this.prisma.group.findFirst({
        where: { id, ...groupWhere(scopeOf(acting)) },
        select: { id: true },
      });
      throw shared
        ? new ForbiddenException(
            'Ce groupe vous est partagé pour publier : seul son propriétaire le modifie',
          )
        : new NotFoundException('Groupe introuvable');
    }
    return group;
  }

  private async requiredCategory(categoryId: string | undefined) {
    const category = await this.categories.resolve(categoryId ?? '');
    if (!category) {
      throw new BadRequestException('Choisissez la catégorie du groupe');
    }
    return category;
  }

  private async reachableProfile(id: string, acting: CurrentUser | null) {
    const profile = await this.prisma.profile.findFirst({
      where: { id, ...profileWhere(scopeOf(acting)) },
      select: { id: true },
    });
    if (!profile) throw new NotFoundException('Profil introuvable');
    return profile;
  }

  /** Une modification laisse toujours le groupe dans une catégorie. Seul un
   * changement d'état (activer, désactiver) passe sans elle : on doit pouvoir
   * couper un ancien groupe pas encore rangé. */
  async update(id: string, dto: UpdateGroupDto, acting: CurrentUser | null) {
    await this.ownedGroup(id, acting);
    const { categoryId, ...fields } = dto;
    const statusOnly = Object.keys(fields).every((key) => key === 'status');
    if (categoryId === undefined && !statusOnly) {
      const current = await this.prisma.group.findUnique({
        where: { id },
        select: { categoryId: true },
      });
      if (!current?.categoryId) {
        throw new BadRequestException('Choisissez la catégorie du groupe');
      }
    }
    const category =
      categoryId === undefined
        ? undefined
        : await this.requiredCategory(categoryId);
    return this.prisma.group.update({
      where: { id },
      data: {
        ...fields,
        ...(category !== undefined ? { categoryId: category } : {}),
      },
    });
  }

  /** Retire de ce groupe les posts qui y attendent encore.
   *
   * Un post peut viser plusieurs groupes d'une même catégorie : le supprimer
   * en entier le retirerait aussi des autres. On ne retire donc que sa cible
   * dans CE groupe ; seul un post qui ne vise plus aucun groupe disparaît.
   * Ce qui est publié, ou réservé par un automate en cours, reste : c'est
   * l'historique, et un post en train de partir ne doit pas s'évanouir.
   *
   * Un compte ne retire que ses propres posts, même d'un groupe partagé.
   * `dryRun` compte sans rien toucher, pour confirmer en connaissance. */
  async removePosts(id: string, acting: CurrentUser | null, dryRun = false) {
    await this.reachableGroup(id, acting);
    const now = new Date();
    const pending: Prisma.PostTargetWhereInput[] = [
      { status: TargetStatus.AVAILABLE },
      { status: TargetStatus.FAILED },
      // Une réservation expirée ne protège plus rien.
      { status: TargetStatus.CLAIMED, claimExpiresAt: { lt: now } },
    ];
    const where: Prisma.PostTargetWhereInput = {
      groupId: id,
      post: postWhere(scopeOf(acting)),
      OR: pending,
    };
    const [removable, kept] = await Promise.all([
      this.prisma.postTarget.findMany({ where, select: { id: true, postId: true } }),
      this.prisma.postTarget.count({
        where: {
          groupId: id,
          post: postWhere(scopeOf(acting)),
          OR: [
            { status: { in: [TargetStatus.PUBLISHED, TargetStatus.CONSUMED] } },
            { status: TargetStatus.CLAIMED, claimExpiresAt: { gte: now } },
          ],
        },
      }),
    ]);
    const postIds = [...new Set(removable.map((target) => target.postId))];
    // Les posts qui ne visaient que ce groupe : sans cible, ils disparaissent.
    const orphans = await this.prisma.post.findMany({
      where: {
        id: { in: postIds },
        // Toutes ses cibles sont ici ET retirables : rien d'autre ne le retient.
        targets: { every: { groupId: id, OR: pending } },
      },
      select: { id: true },
    });
    const report = {
      dryRun,
      removedFromGroup: removable.length,
      deletedPosts: orphans.length,
      stillInOtherGroups: postIds.length - orphans.length,
      kept,
    };
    if (dryRun || !removable.length) return report;

    await this.prisma.$transaction([
      this.prisma.postTarget.deleteMany({
        where: { id: { in: removable.map((target) => target.id) } },
      }),
      this.prisma.post.deleteMany({
        where: { id: { in: orphans.map((post) => post.id) }, targets: { none: {} } },
      }),
      this.prisma.activityLog.create({
        data: {
          groupId: id,
          eventType: 'GROUP_POSTS_REMOVED',
          level: 'WARN',
          message: `${removable.length} post(s) retiré(s) du groupe, ${orphans.length} supprimé(s)`,
          metadata: { ...report, by: acting?.username ?? 'clé globale' },
        },
      }),
    ]);
    return report;
  }

  /** Corriger à la main l'état d'une adhésion : le profil a rejoint le
   * groupe, mais rien ne l'a remonté (demande acceptée après coup, adhésion
   * faite à la main dans le navigateur). Sans cela, le groupe resterait sans
   * profil pour publier. */
  async setJoinStatus(
    groupId: string,
    profileId: string,
    joinStatus: JoinStatus,
    acting: CurrentUser | null,
  ) {
    await this.reachableGroup(groupId, acting);
    await this.reachableProfile(profileId, acting);
    const link = await this.prisma.profileGroup.findUnique({
      where: { profileId_groupId: { profileId, groupId } },
    });
    if (!link) throw new NotFoundException('Ce profil n’est pas lié à ce groupe');
    const updated = await this.prisma.profileGroup.update({
      where: { id: link.id },
      data: { joinStatus, joinCheckedAt: new Date(), joinError: null },
    });
    if (link.joinStatus !== joinStatus) {
      await this.prisma.activityLog.create({
        data: {
          profileId,
          groupId,
          eventType: 'GROUP_JOIN_UPDATED',
          message: `Adhésion corrigée à la main : ${link.joinStatus} → ${joinStatus}`,
          metadata: {
            previous: link.joinStatus,
            joinStatus,
            by: acting?.username ?? 'clé globale',
            manual: true,
          },
        },
      });
    }
    return { profileId, groupId, joinStatus: updated.joinStatus };
  }

  async remove(id: string, acting: CurrentUser | null) {
    await this.ownedGroup(id, acting);
    return this.prisma.group.delete({ where: { id } });
  }

  private async findAutomationProfile(profileExternalId: string) {
    const profile = await this.prisma.profile.findFirst({
      where: { externalId: profileExternalId, status: 'ACTIVE' },
    });
    if (!profile) throw new NotFoundException('Profil introuvable');
    return profile;
  }

  async findForJoin(profileExternalId: string, statuses?: JoinStatus[]) {
    const profile = await this.findAutomationProfile(profileExternalId);
    const links = await this.prisma.profileGroup.findMany({
      where: {
        profileId: profile.id,
        status: 'ACTIVE',
        group: { status: 'ACTIVE' },
        ...(statuses ? { joinStatus: { in: statuses } } : {}),
      },
      include: { group: true },
      orderBy: { createdAt: 'asc' },
    });
    return links.map(({ group, joinStatus, joinCheckedAt, joinError }) => ({
      id: group.id,
      externalId: group.externalId,
      name: group.name,
      url: group.url,
      joinStatus,
      joinCheckedAt,
      joinError,
    }));
  }

  async updateJoinStatus(
    profileExternalId: string,
    groupId: string,
    { joinStatus, error }: UpdateJoinStatusDto,
  ) {
    const profile = await this.findAutomationProfile(profileExternalId);
    const link = await this.prisma.profileGroup.findUnique({
      where: { profileId_groupId: { profileId: profile.id, groupId } },
    });
    if (!link) throw new NotFoundException('Groupe non lié à ce profil');

    const updated = await this.prisma.profileGroup.update({
      where: { id: link.id },
      data: { joinStatus, joinCheckedAt: new Date(), joinError: error ?? null },
    });
    // Une vérification qui confirme l'état connu ne s'écrit pas : l'extension
    // revérifie régulièrement les demandes en attente, et les journaux
    // seraient noyés.
    if (link.joinStatus !== joinStatus) {
      await this.prisma.activityLog.create({
        data: {
          profileId: profile.id,
          groupId,
          eventType: 'GROUP_JOIN_UPDATED',
          level: joinStatus === 'FAILED' ? 'WARN' : 'INFO',
          message: `Adhésion au groupe : ${link.joinStatus} → ${joinStatus}`,
          metadata: { previous: link.joinStatus, joinStatus, error },
        },
      });
    }
    return {
      groupId,
      joinStatus: updated.joinStatus,
      joinCheckedAt: updated.joinCheckedAt,
      joinError: updated.joinError,
    };
  }
}
