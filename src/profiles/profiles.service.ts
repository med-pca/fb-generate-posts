import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { CurrentUser } from '../auth/current-user';
import { CreateProfileDto } from './dto/create-profile.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { PaginationDto } from '../common/dto/pagination.dto';
import { paginated } from '../common/paginated';
import { profileWhere, scopeOf } from '../auth/scope';

@Injectable()
export class ProfilesService {
  constructor(private readonly prisma: PrismaService) {}

  /** `owner` est celui qui crée. Une ressource sans propriétaire n'est
   * visible que des ADMIN : la poser à la création évite d'avoir à la
   * réattribuer ensuite. */
  create(dto: CreateProfileDto, owner: CurrentUser | null) {
    if (dto.minPostsPerJob > dto.maxPostsPerJob) {
      throw new BadRequestException(
        'minPostsPerJob doit être inférieur ou égal à maxPostsPerJob',
      );
    }
    return this.prisma.profile.create({
      data: { ...dto, ownerId: owner?.id ?? null },
    });
  }

  async findAll({ page, limit }: PaginationDto, acting: CurrentUser | null) {
    const where = profileWhere(scopeOf(acting));
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

  /** Lire par identifiant sans vérifier la propriété reviendrait à laisser
   * lire n'importe quel profil en devinant son identifiant : la portée
   * s'applique ici comme aux listes. */
  async findOne(id: string, acting: CurrentUser | null) {
    const profile = await this.prisma.profile.findFirst({
      where: { id, ...profileWhere(scopeOf(acting)) },
      include: {
        profileGroups: { include: { group: true } },
        _count: { select: { posts: true, publicationJobs: true } },
      },
    });
    if (!profile) throw new NotFoundException('Profil introuvable');
    return profile;
  }

  /** Ce qu'un appelant peut atteindre, ou une 404. Une ressource qu'on n'a
   * pas le droit de voir est introuvable, pas interdite : répondre 403
   * confirmerait son existence. */
  private async reachable(id: string, acting: CurrentUser | null) {
    const profile = await this.prisma.profile.findFirst({
      where: { id, ...profileWhere(scopeOf(acting)) },
      select: { id: true },
    });
    if (!profile) throw new NotFoundException('Profil introuvable');
    return profile;
  }

  async update(id: string, dto: UpdateProfileDto, acting: CurrentUser | null) {
    if (
      dto.minPostsPerJob !== undefined &&
      dto.maxPostsPerJob !== undefined &&
      dto.minPostsPerJob > dto.maxPostsPerJob
    ) {
      throw new BadRequestException(
        'minPostsPerJob doit être inférieur ou égal à maxPostsPerJob',
      );
    }
    await this.reachable(id, acting);
    return this.prisma.profile.update({ where: { id }, data: dto });
  }

  async remove(id: string, acting: CurrentUser | null) {
    await this.reachable(id, acting);
    return this.prisma.profile.delete({ where: { id } });
  }
}
