import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma, JoinStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { CurrentUser } from '../auth/current-user';
import { groupWhere, profileWhere, scopeOf, siteWhere } from '../auth/scope';
import { AccessService } from '../access/access.service';
import { isAdmin } from '../auth/moderator-guard';

/** Le travail en masse : on gère des dizaines de profils et des centaines
 * de groupes, un par un ne tient pas. */
const MAX_PAIRS = 50_000;

@Injectable()
export class BulkService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
  ) {}

  /** Tous les groupes visibles, en léger : de quoi cocher en masse. */
  async groupOptions(query: { search?: string; categoryId?: string }, acting: CurrentUser | null) {
    const and: Prisma.GroupWhereInput[] = [groupWhere(scopeOf(acting))];
    const search = query.search?.trim();
    if (search) and.push({ OR: [{ name: { contains: search, mode: 'insensitive' } }, { url: { contains: search, mode: 'insensitive' } }] });
    if (query.categoryId) and.push({ categoryId: query.categoryId === 'none' ? null : query.categoryId });
    return this.prisma.group.findMany({
      where: { AND: and },
      orderBy: { name: 'asc' },
      take: 3000,
      select: {
        id: true,
        name: true,
        url: true,
        status: true,
        ownerId: true,
        category: { select: { id: true, name: true } },
        _count: { select: { profiles: true } },
      },
    });
  }

  /** Tous les profils visibles, en léger. */
  profileOptions(query: { search?: string }, acting: CurrentUser | null) {
    const search = query.search?.trim();
    return this.prisma.profile.findMany({
      where: {
        AND: [
          profileWhere(scopeOf(acting)),
          // Les modérateurs se gèrent dans leur rubrique.
          { isModerator: false },
          search ? { OR: [{ name: { contains: search, mode: 'insensitive' } }, { externalId: { contains: search } }] } : {},
        ],
      },
      orderBy: { name: 'asc' },
      take: 1000,
      select: { id: true, name: true, status: true, externalId: true, _count: { select: { profileGroups: true } } },
    });
  }

  /** Lier ou délier chaque profil choisi à chaque groupe choisi. Seuls les
   * profils et groupes que l'appelant voit comptent ; le reste est ignoré et
   * compté à part. Une liaison existante n'est pas dupliquée ; une liaison
   * désactivée est réactivée. Un nouveau lien part « à rejoindre ». */
  async link(input: { profileIds: string[]; groupIds: string[]; action: 'link' | 'unlink' }, acting: CurrentUser | null) {
    const scope = scopeOf(acting);
    const profileIds = [...new Set(input.profileIds)];
    const groupIds = [...new Set(input.groupIds)];
    if (profileIds.length * groupIds.length > MAX_PAIRS) {
      throw new BadRequestException(`Trop de liaisons d’un coup (${profileIds.length} × ${groupIds.length}) : découpez la sélection`);
    }
    const [profiles, groups] = await Promise.all([
      // Un modérateur n'est touché en masse que par un administrateur.
      this.prisma.profile.findMany({
        where: { id: { in: profileIds }, ...profileWhere(scope), ...(isAdmin(acting) ? {} : { isModerator: false }) },
        select: { id: true, name: true },
      }),
      this.prisma.group.findMany({ where: { id: { in: groupIds }, ...groupWhere(scope) }, select: { id: true, name: true } }),
    ]);
    const pIds = profiles.map((p) => p.id);
    const gIds = groups.map((g) => g.id);
    const ignored = profileIds.length - pIds.length + (groupIds.length - gIds.length);
    if (!pIds.length || !gIds.length) {
      return { action: input.action, profiles: pIds.length, groups: gIds.length, created: 0, reactivated: 0, already: 0, removed: 0, ignored };
    }

    if (input.action === 'unlink') {
      const { count } = await this.prisma.profileGroup.deleteMany({ where: { profileId: { in: pIds }, groupId: { in: gIds } } });
      await this.log('GROUP_BULK_UNLINK', `${count} liaison(s) retirée(s) : ${pIds.length} profil(s) × ${gIds.length} groupe(s)`, acting, { profiles: pIds, groups: gIds, removed: count });
      return { action: 'unlink', profiles: pIds.length, groups: gIds.length, created: 0, reactivated: 0, already: 0, removed: count, ignored };
    }

    const existing = await this.prisma.profileGroup.findMany({
      where: { profileId: { in: pIds }, groupId: { in: gIds } },
      select: { profileId: true, groupId: true, status: true },
    });
    const key = (p: string, g: string) => `${p}|${g}`;
    const have = new Map(existing.map((e) => [key(e.profileId, e.groupId), e.status]));
    const toCreate: Prisma.ProfileGroupCreateManyInput[] = [];
    for (const p of pIds) for (const g of gIds) if (!have.has(key(p, g))) toCreate.push({ profileId: p, groupId: g });
    const inactive = existing.filter((e) => e.status !== 'ACTIVE');
    const [created, reactivated] = await this.prisma.$transaction([
      this.prisma.profileGroup.createMany({ data: toCreate, skipDuplicates: true }),
      this.prisma.profileGroup.updateMany({
        where: { OR: inactive.map((e) => ({ profileId: e.profileId, groupId: e.groupId })) },
        data: { status: 'ACTIVE' },
      }),
    ]);
    const already = existing.length - inactive.length;
    await this.log(
      'GROUP_BULK_LINK',
      `${created.count} liaison(s) créée(s), ${inactive.length ? `${reactivated.count} réactivée(s), ` : ''}${already} déjà en place : ${pIds.length} profil(s) × ${gIds.length} groupe(s)`,
      acting,
      { profiles: pIds, groups: gIds, created: created.count, reactivated: reactivated.count, already },
    );
    return {
      action: 'link',
      profiles: pIds.length,
      groups: gIds.length,
      created: created.count,
      reactivated: inactive.length ? reactivated.count : 0,
      already,
      removed: 0,
      ignored,
    };
  }

  /** Ce qu'on a fait soi-même sur Facebook, reporté d'un coup : « rejoint »,
   * « demande envoyée », « à rejoindre », et/ou « pré-approuvé » — pour
   * chaque profil choisi dans chaque groupe choisi. Sans passer par le
   * modérateur. Pré-approuvé implique rejoint. Les liens absents sont créés
   * si demandé, sinon comptés à part. */
  async memberships(
    input: { profileIds: string[]; groupIds: string[]; joinStatus?: JoinStatus; preApproved?: boolean; linkMissing?: boolean },
    acting: CurrentUser | null,
    now = new Date(),
  ) {
    if (!input.joinStatus && input.preApproved === undefined) throw new BadRequestException('Choisissez un état d’adhésion ou la pré-approbation');
    if (input.preApproved && input.joinStatus && input.joinStatus !== 'JOINED') {
      throw new BadRequestException('Un profil pré-approuvé est forcément membre (« Rejoint »)');
    }
    let linked = { created: 0, reactivated: 0 };
    if (input.linkMissing) {
      const r = await this.link({ profileIds: input.profileIds, groupIds: input.groupIds, action: 'link' }, acting);
      linked = { created: r.created, reactivated: r.reactivated };
    }
    const scope = scopeOf(acting);
    const where: Prisma.ProfileGroupWhereInput = {
      profileId: { in: [...new Set(input.profileIds)] },
      groupId: { in: [...new Set(input.groupIds)] },
      profile: { ...profileWhere(scope), ...(isAdmin(acting) ? {} : { isModerator: false }) },
      group: groupWhere(scope),
    };
    const by = acting?.username ?? 'un administrateur';
    const data: Prisma.ProfileGroupUpdateManyMutationInput = {};
    const joinStatus = input.preApproved ? 'JOINED' : input.joinStatus;
    if (joinStatus) {
      Object.assign(data, { joinStatus, joinCheckedAt: now, joinError: null });
      if (joinStatus === 'JOINED') Object.assign(data, { memberApprovedAt: now, memberRequestedAt: null, memberClaimedUntil: null, memberActionError: null, memberAttempts: 0 });
    }
    if (input.preApproved === true) {
      Object.assign(data, { preApprovedAt: now, preApprovalState: 'PREAPPROVED', preApprovalCheckedAt: now, preApprovalDetail: `marqué à la main par ${by}` });
    } else if (input.preApproved === false || (joinStatus && joinStatus !== 'JOINED')) {
      // Plus membre : plus pré-approuvé non plus.
      Object.assign(data, { preApprovedAt: null, preApprovalState: null, preApprovalDetail: null });
    }
    const { count } = await this.prisma.profileGroup.updateMany({ where, data });
    const pairs = new Set(input.profileIds).size * new Set(input.groupIds).size;
    const what = [
      joinStatus ? `« ${({ JOINED: 'rejoint', REQUESTED: 'demande envoyée', QUESTIONS: 'questions', NOT_JOINED: 'à rejoindre' } as Record<string, string>)[joinStatus]} »` : '',
      input.preApproved === true ? 'pré-approuvé' : input.preApproved === false ? 'pré-approbation retirée' : '',
    ].filter(Boolean).join(' + ');
    await this.log('MEMBERSHIP_BULK_MANUAL', `${count} adhésion(s) marquée(s) ${what} à la main${linked.created ? ` (${linked.created} lien(s) créé(s))` : ''}`, acting, {
      profiles: input.profileIds, groups: input.groupIds, joinStatus: joinStatus ?? null, preApproved: input.preApproved ?? null, updated: count, ...linked,
    });
    return { updated: count, notLinked: Math.max(0, pairs - count), ...linked };
  }

  /** Partager (ou retirer) des groupes ou des sites avec des comptes. Chaque
   * couple passe par les règles du partage unitaire (propriétaire, compte
   * actif, pas un ADMIN) ; un refus n'arrête pas les autres, il est dit. */
  async share(input: { kind: 'groups' | 'sites'; ids: string[]; userIds: string[]; action: 'grant' | 'revoke' }, acting: CurrentUser | null) {
    const ids = [...new Set(input.ids)];
    const userIds = [...new Set(input.userIds)];
    const scope = scopeOf(acting);
    const items =
      input.kind === 'groups'
        ? await this.prisma.group.findMany({ where: { id: { in: ids }, ...groupWhere(scope) }, select: { id: true, name: true } })
        : await this.prisma.contentSource.findMany({ where: { id: { in: ids }, ...siteWhere(scope) }, select: { id: true, name: true } });
    let done = 0;
    const failures: Array<{ item: string; userId: string; reason: string }> = [];
    for (const item of items) {
      for (const userId of userIds) {
        try {
          if (input.kind === 'groups') {
            if (input.action === 'grant') await this.access.grantGroup(item.id, userId, acting);
            else await this.access.revokeGroup(item.id, userId, acting);
          } else if (input.action === 'grant') await this.access.grantSite(item.id, userId, acting);
          else await this.access.revokeSite(item.id, userId, acting);
          done += 1;
        } catch (error) {
          failures.push({ item: item.name, userId, reason: (error as Error).message });
        }
      }
    }
    await this.log(
      input.action === 'grant' ? 'GROUP_BULK_SHARE' : 'GROUP_BULK_UNSHARE',
      `${input.action === 'grant' ? 'Partage' : 'Retrait de partage'} en masse : ${done} fait(s) sur ${items.length} ${input.kind === 'groups' ? 'groupe(s)' : 'site(s)'} × ${userIds.length} compte(s)${failures.length ? `, ${failures.length} refus` : ''}`,
      acting,
      { kind: input.kind, ids: items.map((i) => i.id), userIds, done, failures: failures.slice(0, 50) },
    );
    return { done, items: items.length, users: userIds.length, ignored: ids.length - items.length, failures: failures.slice(0, 100) };
  }

  private log(eventType: string, message: string, acting: CurrentUser | null, metadata: Record<string, unknown>) {
    return this.prisma.activityLog.create({
      data: { eventType, message, metadata: { ...metadata, by: acting?.username ?? 'clé globale' } as Prisma.InputJsonValue },
    });
  }
}
