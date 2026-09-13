import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateGroupDto } from './dto/create-group.dto';
import { UpdateGroupDto } from './dto/update-group.dto';
import { PaginationDto } from '../common/dto/pagination.dto';
import { paginated } from '../common/paginated';

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
    const [data, total] = await this.prisma.$transaction([
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
    return paginated(data, total, page, limit);
  }

  update(id: string, dto: UpdateGroupDto) {
    return this.prisma.group.update({ where: { id }, data: dto });
  }

  remove(id: string) {
    return this.prisma.group.delete({ where: { id } });
  }
}
