import { Injectable, NotFoundException } from '@nestjs/common';
import { JoinStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateGroupDto } from './dto/create-group.dto';
import { UpdateGroupDto } from './dto/update-group.dto';
import { PaginationDto } from '../common/dto/pagination.dto';
import { paginated } from '../common/paginated';
import { UpdateJoinStatusDto } from './dto/update-join-status.dto';

@Injectable()
export class GroupsService {
  constructor(private readonly prisma: PrismaService) {}

  create(profileId: string, dto: CreateGroupDto) {
    return this.prisma.group.create({
      data: {
        ...dto,
        profiles: { create: { profileId } },
      },
      include: { profiles: true },
    });
  }

  async findAll(profileId: string) {
    const links = await this.prisma.profileGroup.findMany({
      where: { profileId, status: 'ACTIVE' },
      include: { group: true },
      orderBy: { createdAt: 'desc' },
    });
    return links.map((link) => link.group);
  }

  link(profileId: string, groupId: string) {
    return this.prisma.profileGroup.upsert({
      where: { profileId_groupId: { profileId, groupId } },
      update: { status: 'ACTIVE' },
      create: { profileId, groupId },
      include: { profile: true, group: true },
    });
  }

  unlink(profileId: string, groupId: string) {
    return this.prisma.profileGroup.delete({
      where: { profileId_groupId: { profileId, groupId } },
    });
  }

  async findCatalog({ page, limit }: PaginationDto) {
    const [groups, total] = await this.prisma.$transaction([
      this.prisma.group.findMany({
      include: {
        profiles: { include: { profile: true } },
        _count: { select: { targets: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
      }),
      this.prisma.group.count(),
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

  update(id: string, dto: UpdateGroupDto) {
    return this.prisma.group.update({ where: { id }, data: dto });
  }

  remove(id: string) {
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
