import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
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
import { assertMayManage } from '../auth/moderator-guard';

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
    if (query.status === 'SUSPENDED') and.push({ facebookSuspension: { not: null } });
    else if (query.status) and.push({ status: query.status });
    // Les modérateurs ont leur rubrique : ils ne se mêlent pas aux profils
    // qui publient (sauf pour les listes de filtres, qui les demandent).
    if (!query.withModerators) and.push({ isModerator: false });
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
      include: {
        _count: { select: { profileGroups: true, posts: true } },
        owner: { select: { id: true, username: true } },
      },
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

  /** Retirer de nos groupes un profil que Facebook a SUSPENDU (« Nous avons
   * suspendu votre compte ») — sur clic d'un administrateur. Le modérateur
   * le retire de chaque groupe (Facebook) et le lien passe « retiré » dans la
   * plateforme. Jamais pour une limite de publication ni une vérification
   * demandée (récupérable : le compte devrait redemander chaque groupe). */
  async requestGroupRemoval(id: string, acting: CurrentUser | null) {
    const profile = await this.prisma.profile.findFirst({
      where: { id, ...profileWhere(scopeOf(acting)) },
      select: { id: true, name: true, facebookSuspension: true, facebookUserId: true },
    });
    if (!profile) throw new NotFoundException('Profil introuvable');
    if (profile.facebookSuspension !== 'disabled') {
      throw new BadRequestException('Seul un compte suspendu par Facebook (« Nous avons suspendu votre compte ») peut être retiré des groupes');
    }
    if (!profile.facebookUserId) {
      throw new BadRequestException('Identifiant Facebook inconnu : le modérateur ne pourrait pas le reconnaître sûrement. Renseignez-le d’abord.');
    }
    const { count } = await this.prisma.profileGroup.updateMany({
      where: { profileId: id, status: 'ACTIVE', removedAt: null },
      data: { removalRequestedAt: new Date(), removalAttempts: 0, removalClaimedUntil: null, removalError: null },
    });
    await this.prisma.activityLog.create({
      data: { profileId: id, eventType: 'PROFILE_REMOVAL_REQUESTED', message: `Retrait de « ${profile.name} » (suspendu par Facebook) de ${count} groupe(s) demandé au modérateur`, metadata: { groups: count, by: acting?.username ?? 'clé globale' } },
    });
    return { requested: count };
  }

  /** Le compte est récupéré : il peut reprendre (son mode reste à rallumer
   * dans le Pilotage). Les retraits pas encore faits sont annulés. */
  async clearSuspension(id: string, acting: CurrentUser | null) {
    const profile = await this.prisma.profile.findFirst({ where: { id, ...profileWhere(scopeOf(acting)) }, select: { id: true, name: true } });
    if (!profile) throw new NotFoundException('Profil introuvable');
    await this.prisma.profile.update({ where: { id }, data: { facebookSuspension: null, suspendedAt: null, suspensionDetail: null } });
    const { count } = await this.prisma.profileGroup.updateMany({
      where: { profileId: id, removalRequestedAt: { not: null }, removedAt: null },
      data: { removalRequestedAt: null, removalClaimedUntil: null },
    });
    await this.prisma.activityLog.create({
      data: { profileId: id, eventType: 'PROFILE_SUSPENSION_CLEARED', message: `« ${profile.name} » marqué rétabli${count ? ` (${count} retrait(s) annulé(s))` : ''}`, metadata: { cancelled: count, by: acting?.username ?? 'clé globale' } },
    });
    return { cleared: true, cancelledRemovals: count };
  }

  /** Confier des profils à un gestionnaire (ADMIN seulement) : il les voit,
   * les pilote (mode, pause, appairage, objectif) et les fait publier.
   * `ownerId: null` les rend à l'administration. Avec `shareGroups`, les
   * groupes où ils publient lui sont partagés (droit de publier et de voir,
   * pas de gérer) : sans eux, ses écrans de pilotage seraient vides.
   *
   * Un profil qui appartenait à un AUTRE gestionnaire doit être réappairé :
   * son extension garde la clé de l'ancien compte, qui ne le voit plus. */
  async assign(
    dto: { profileIds: string[]; ownerId: string | null; shareGroups?: boolean },
    acting: CurrentUser | null,
  ) {
    let owner: { id: string; username: string } | null = null;
    if (dto.ownerId) {
      const user = await this.prisma.user.findUnique({ where: { id: dto.ownerId }, select: { id: true, username: true, role: true, status: true } });
      if (!user) throw new NotFoundException('Compte introuvable');
      if (user.status !== 'ACTIVE') throw new BadRequestException('Ce compte est désactivé');
      if (user.role === 'ADMIN') throw new BadRequestException('Un administrateur voit déjà tous les profils : choisissez « Administration »');
      owner = { id: user.id, username: user.username };
    }
    const profiles = await this.prisma.profile.findMany({
      where: { id: { in: dto.profileIds } },
      select: { id: true, name: true, ownerId: true, owner: { select: { role: true } } },
    });
    if (!profiles.length) throw new NotFoundException('Aucun profil trouvé');
    const ids = profiles.map((p) => p.id);
    // Leur ancienne clé ne les voit plus : à réappairer.
    const repair = profiles
      .filter((p) => p.ownerId && p.ownerId !== (owner?.id ?? null) && p.owner?.role !== 'ADMIN')
      .map((p) => p.name);
    const { count } = await this.prisma.profile.updateMany({ where: { id: { in: ids } }, data: { ownerId: owner?.id ?? null } });

    let groupsShared = 0;
    if (owner && dto.shareGroups) {
      const links = await this.prisma.profileGroup.findMany({
        where: { profileId: { in: ids }, status: 'ACTIVE', group: { ownerId: { not: owner.id } } },
        select: { groupId: true },
        distinct: ['groupId'],
      });
      for (const { groupId } of links) {
        await this.prisma.groupAccess.upsert({
          where: { groupId_userId: { groupId, userId: owner.id } },
          create: { groupId, userId: owner.id, grantedBy: acting?.id ?? null },
          update: {},
        });
      }
      groupsShared = links.length;
    }
    await this.prisma.activityLog.create({
      data: {
        eventType: 'PROFILE_ASSIGNED',
        message: `${count} profil(s) confié(s) à ${owner ? owner.username : 'l’administration'}${groupsShared ? `, ${groupsShared} groupe(s) partagé(s)` : ''}`,
        metadata: { profileIds: ids, ownerId: owner?.id ?? null, groupsShared, repair, by: acting?.username ?? 'clé globale' },
      },
    });
    return { updated: count, owner, groupsShared, repair };
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
  /** Atteignable ET modifiable : un profil modérateur ne se modifie que
   * par un administrateur de la plateforme. */
  private async reachable(id: string, acting: CurrentUser | null) {
    const profile = await this.prisma.profile.findFirst({
      where: { id, ...profileWhere(scopeOf(acting)) },
      select: { id: true, isModerator: true },
    });
    if (!profile) throw new NotFoundException('Profil introuvable');
    assertMayManage(profile, acting);
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
