import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePostDto } from './dto/create-post.dto';
import { UpdatePostDto } from './dto/update-post.dto';
import { PaginationDto } from '../common/dto/pagination.dto';
import { paginated } from '../common/paginated';

@Injectable()
export class PostsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreatePostDto) {
    const { groupIds, ...postData } = dto;
    const uniqueGroupIds = [...new Set(groupIds)];
    const validGroups = await this.prisma.group.count({
      where: {
        id: { in: uniqueGroupIds },
        profiles: {
          some: { profileId: dto.profileId, status: 'ACTIVE' },
        },
      },
    });
    if (validGroups !== uniqueGroupIds.length) {
      throw new BadRequestException(
        'Tous les groupes doivent appartenir au profil du post',
      );
    }

    return this.prisma.post.create({
      data: {
        ...postData,
        targets: {
          create: uniqueGroupIds.map((groupId) => ({ groupId })),
        },
      },
      include: { targets: true },
    });
  }

  async findAll(profileId: string | undefined, { page, limit }: PaginationDto) {
    const where = profileId ? { profileId } : {};
    const [data, total] = await this.prisma.$transaction([
      this.prisma.post.findMany({
      where,
      include: { targets: { include: { group: true } } },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
      }),
      this.prisma.post.count({ where }),
    ]);
    return paginated(data, total, page, limit);
  }

  findOne(id: string) {
    return this.prisma.post.findUniqueOrThrow({
      where: { id },
      include: { profile: true, targets: { include: { group: true } } },
    });
  }

  update(id: string, dto: UpdatePostDto) {
    return this.prisma.post.update({ where: { id }, data: dto });
  }
}
