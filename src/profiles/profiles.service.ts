import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateProfileDto } from './dto/create-profile.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { PaginationDto } from '../common/dto/pagination.dto';
import { paginated } from '../common/paginated';

@Injectable()
export class ProfilesService {
  constructor(private readonly prisma: PrismaService) {}

  create(dto: CreateProfileDto) {
    if (dto.minPostsPerJob > dto.maxPostsPerJob) {
      throw new BadRequestException(
        'minPostsPerJob doit être inférieur ou égal à maxPostsPerJob',
      );
    }
    return this.prisma.profile.create({ data: dto });
  }

  async findAll({ page, limit }: PaginationDto) {
    const where = {};
    const [data, total] = await this.prisma.$transaction([
      this.prisma.profile.findMany({
        where,
        include: { _count: { select: { profileGroups: true, posts: true } } },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.profile.count({ where }),
    ]);
    return paginated(data, total, page, limit);
  }

  findOne(id: string) {
    return this.prisma.profile.findUniqueOrThrow({
      where: { id },
      include: {
        profileGroups: { include: { group: true } },
        _count: { select: { posts: true, publicationJobs: true } },
      },
    });
  }

  update(id: string, dto: UpdateProfileDto) {
    if (
      dto.minPostsPerJob !== undefined &&
      dto.maxPostsPerJob !== undefined &&
      dto.minPostsPerJob > dto.maxPostsPerJob
    ) {
      throw new BadRequestException(
        'minPostsPerJob doit être inférieur ou égal à maxPostsPerJob',
      );
    }
    return this.prisma.profile.update({ where: { id }, data: dto });
  }

  remove(id: string) {
    return this.prisma.profile.delete({ where: { id } });
  }
}
