import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { JoinStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { CurrentUser } from '../auth/current-user';
import {
  groupManageWhere,
  groupWhere,
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
  constructor(private readonly prisma: PrismaService) {}

  /** `owner` est celui qui crée : voir `ProfilesService.create`. */
  async create(
    profileId: string,
    dto: CreateGroupDto,
    owner: CurrentUser | null,
  ) {
    await this.reachableProfile(profileId, owner);
    return this.prisma.group.create({
      data: {
        ...dto,
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

  private async reachableProfile(id: string, acting: CurrentUser | null) {
    const profile = await this.prisma.profile.findFirst({
      where: { id, ...profileWhere(scopeOf(acting)) },
      select: { id: true },
    });
    if (!profile) throw new NotFoundException('Profil introuvable');
    return profile;
  }

  async update(id: string, dto: UpdateGroupDto, acting: CurrentUser | null) {
    await this.ownedGroup(id, acting);
    return this.prisma.group.update({ where: { id }, data: dto });
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
    await this.prisma.activityLog.create({
      data: {
        profileId: profile.id,
        groupId,
        eventType: 'GROUP_JOIN_UPDATED',
        level: joinStatus === 'FAILED' ? 'WARN' : 'INFO',
        message: `Adhésion au groupe : ${joinStatus}`,
        metadata: { previous: link.joinStatus, joinStatus, error },
      },
    });
    return {
      groupId,
      joinStatus: updated.joinStatus,
      joinCheckedAt: updated.joinCheckedAt,
      joinError: updated.joinError,
    };
  }
}
