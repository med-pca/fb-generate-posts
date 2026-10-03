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
import { Prisma } from '@prisma/client';
import { QueryProfilesDto } from './dto/query-profiles.dto';
import { ProfileHealthService } from './profile-health.service';
import { HEALTH_LABELS, healthOf } from './profile-health';

@Injectable()
export class ProfilesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly health: ProfileHealthService,
  ) {}

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

  /** La liste filtrée et triée, chaque profil avec sa santé (score, niveau,
   * indice de désactivation). Les filtres simples passent par la base ; la
   * santé, calculée, s'applique ensuite. */
  async findAll(query: PaginationDto & Partial<QueryProfilesDto>, acting: CurrentUser | null) {
    const { page, limit } = query;
    const and: Prisma.ProfileWhereInput[] = [profileWhere(scopeOf(acting))];
    const search = query.search?.trim();
    if (search) {
      and.push({
        OR: [
          { name: { contains: search, mode: 'insensitive' } },
          { externalId: { contains: search, mode: 'insensitive' } },
          { facebookUserId: { contains: search } },
          { facebookName: { contains: search, mode: 'insensitive' } },
        ],
      });
    }
    if (query.status) and.push({ status: query.status });
    if (query.activity === 'running') and.push({ runner: { mode: { not: 'OFF' } } });
    if (query.activity === 'off') and.push({ OR: [{ runner: null }, { runner: { mode: 'OFF' } }] });
    if (query.categoryId) {
      and.push({ profileGroups: { some: { status: 'ACTIVE', group: { categoryId: query.categoryId } } } });
    }
    const where: Prisma.ProfileWhereInput = { AND: and };
    const candidates = await this.prisma.profile.findMany({
      where,
      select: { id: true, name: true, createdAt: true },
    });
    const health = await this.health.inputs(candidates.map((c) => c.id));
    const scored = candidates.map((c) => {
      const input = health.get(c.id)!;
      return { ...c, input, health: healthOf(input) };
    });
    const kept = scored.filter((c) =>
      !query.health
        ? true
        : query.health === 'deactivate'
          ? c.health.suggestDeactivate
          : c.health.label === query.health,
    );
    const sort = query.sort ?? 'recent';
    kept.sort((a, b) => {
      if (sort === 'name') return a.name.localeCompare(b.name, 'fr');
      if (sort === 'score') return (b.health.score ?? -1) - (a.health.score ?? -1);
      if (sort === 'failures') return b.input.failed - a.input.failed || b.input.failStreak - a.input.failStreak;
      if (sort === 'published') return b.input.published - a.input.published;
      return b.createdAt.getTime() - a.createdAt.getTime();
    });
    const pageIds = kept.slice((page - 1) * limit, page * limit).map((c) => c.id);
    const rows = await this.prisma.profile.findMany({
      where: { id: { in: pageIds } },
      include: { _count: { select: { profileGroups: true, posts: true } } },
    });
    const byId = new Map(rows.map((r) => [r.id, r]));
    const byScore = new Map(kept.map((c) => [c.id, c]));
    const data = pageIds
      .map((id) => byId.get(id))
      .filter((r): r is NonNullable<typeof r> => Boolean(r))
      .map((r) => {
        const h = byScore.get(r.id)!;
        return {
          ...r,
          health: {
            score: h.health.score,
            label: h.health.label,
            labelText: HEALTH_LABELS[h.health.label],
            suggestDeactivate: h.health.suggestDeactivate,
            reasons: h.health.reasons,
            published: h.input.published,
            failed: h.input.failed,
            failStreak: h.input.failStreak,
          },
        };
      });
    return paginated(data, kept.length, page, limit);
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
