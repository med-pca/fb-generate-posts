import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, TargetStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { CurrentUser } from '../auth/current-user';
import { articleWhere, groupWhere, ownedWhere, profileWhere, scopeOf, siteWhere } from '../auth/scope';
import { localClock } from '../runners/window';
import { campaignGate, campaignPace, periodBounds, poolOf, rotationTeamOf, type Period } from './period';
import type { CreateCampaignDto, UpdateCampaignDto } from './dto/campaign.dto';

const CAMPAIGN_INCLUDE = {
  site: { select: { id: true, name: true, categoryId: true } },
  category: { select: { id: true, name: true } },
  groups: { select: { group: { select: { id: true, name: true } } } },
  profiles: { select: { profile: { select: { id: true, name: true } } } },
  articles: { select: { article: { select: { id: true, title: true } } } },
} satisfies Prisma.CampaignInclude;
type CampaignRow = Prisma.CampaignGetPayload<{ include: typeof CAMPAIGN_INCLUDE }>;

/** Les campagnes : un objectif de publications par site (et, au choix, par
 * catégorie, groupes, profils, articles), par jour, semaine ou mois.
 *
 * Une publication compte pour une campagne quand son article vient du site,
 * qu'elle part dans un de ses groupes (ou de sa catégorie), par un de ses
 * profils, et que c'est un de ses articles — chaque filtre absent ne
 * restreint rien. Une campagne en retard fait passer ses articles devant
 * dans la file (JobsService). */
@Injectable()
export class CampaignsService {
  constructor(private readonly prisma: PrismaService) {}

  /* ── Lire ────────────────────────────────────────────────────────────── */

  async list(acting: CurrentUser | null, now = new Date()) {
    const rows = await this.prisma.campaign.findMany({
      where: ownedWhere(scopeOf(acting)),
      include: CAMPAIGN_INCLUDE,
      orderBy: [{ status: 'asc' }, { priority: 'desc' }, { createdAt: 'desc' }],
    });
    return Promise.all(
      rows.map(async (c) => {
        const pool = c.activeProfiles && c.status === 'ACTIVE' ? await this.pool(c, now) : null;
        return {
          ...this.shape(c),
          progress: await this.progress(c, now),
          // Le résumé du pool, pour la carte : actifs, réserve, tombés, manque.
          pool: pool && { size: pool.size, active: pool.active.length, standby: pool.standby.length, unavailable: pool.unavailable.length, missing: pool.missing },
        };
      }),
    );
  }

  async detail(id: string, acting: CurrentUser | null, now = new Date()) {
    const c = await this.reachable(id, acting);
    const progress = await this.progress(c, now);
    // Le pool : qui publie, qui attend en réserve, qui est tombé et pourquoi.
    const pool = c.activeProfiles ? await this.pool(c, now) : null;
    const items = await this.publications(c, progress.since, progress.to);
    const count = <K extends string>(key: (i: (typeof items)[number]) => K | null, label: (k: K) => string) => {
      const map = new Map<K, number>();
      for (const i of items) {
        const k = key(i);
        if (k) map.set(k, (map.get(k) ?? 0) + 1);
      }
      return [...map].map(([k, n]) => ({ id: k, name: label(k), published: n })).sort((a, b) => b.published - a.published);
    };
    const names = await this.names(items);
    // Jour par jour (semaine, mois) ou heure par heure (jour).
    const series =
      c.period === 'day'
        ? Array.from({ length: 24 }, (_, h) => ({ label: `${String(h).padStart(2, '0')} h`, published: 0 }))
        : Array.from({ length: progress.days }, (_, d) => ({ label: new Date(progress.from.getTime() + d * 86_400_000 + 12 * 3_600_000).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', timeZone: c.timezone }), published: 0 }));
    for (const i of items) {
      if (!i.publishedAt) continue;
      const slot = c.period === 'day'
        ? Math.floor(localClock(i.publishedAt, c.timezone).minutes / 60)
        : Math.floor((i.publishedAt.getTime() - progress.from.getTime()) / 86_400_000);
      if (series[slot]) series[slot].published += 1;
    }
    return {
      ...this.shape(c),
      progress,
      pool,
      series,
      byArticle: count((i) => i.articleId, (k) => names.articles.get(k) ?? k).slice(0, 50),
      byProfile: count((i) => i.profileId, (k) => names.profiles.get(k) ?? k).slice(0, 50),
      byGroup: count((i) => i.groupId, (k) => names.groups.get(k) ?? k).slice(0, 50),
    };
  }

  /* ── Écrire ──────────────────────────────────────────────────────────── */

  async create(dto: CreateCampaignDto, acting: CurrentUser | null) {
    const scope = await this.checkScope(dto, acting);
    const c = await this.prisma.campaign.create({
      data: {
        name: dto.name.trim(),
        ownerId: acting?.id ?? null,
        siteId: dto.siteId,
        categoryId: scope.categoryId,
        period: dto.period,
        target: dto.target,
        startsAt: dto.startsAt ? new Date(dto.startsAt) : new Date(),
        endsAt: dto.endsAt ? new Date(dto.endsAt) : null,
        timezone: dto.timezone || 'Europe/Paris',
        windowStart: dto.windowStart ?? 480,
        windowEnd: dto.windowEnd ?? 1320,
        priority: dto.priority ?? 0,
        notes: dto.notes ?? null,
        maxPerProfilePerDay: dto.maxPerProfilePerDay ?? null,
        activeProfiles: dto.activeProfiles ?? null,
        rotationTeams: cleanTeams(dto.rotationTeams),
        groups: { create: scope.groupIds.map((groupId) => ({ groupId })) },
        profiles: { create: scope.profileIds.map((profileId) => ({ profileId })) },
        articles: { create: scope.articleIds.map((articleId) => ({ articleId })) },
      },
      include: CAMPAIGN_INCLUDE,
    });
    this.behindCache = null;
    this.dayCache = null;
    await this.log('CAMPAIGN_CREATED', `Campagne « ${c.name} » créée : ${c.target} publication(s) par ${this.periodName(c.period)} pour « ${c.site.name} »`, c.id, acting);
    return this.shape(c);
  }

  async update(id: string, dto: UpdateCampaignDto, acting: CurrentUser | null) {
    const current = await this.reachable(id, acting);
    const merged = {
      siteId: dto.siteId ?? current.siteId,
      categoryId: dto.categoryId === undefined ? current.categoryId : dto.categoryId,
      groupIds: dto.groupIds ?? current.groups.map((g) => g.group.id),
      profileIds: dto.profileIds ?? current.profiles.map((p) => p.profile.id),
      articleIds: dto.articleIds ?? current.articles.map((a) => a.article.id),
    };
    const scope = await this.checkScope(merged, acting);
    const c = await this.prisma.$transaction(async (tx) => {
      if (dto.groupIds) {
        await tx.campaignGroup.deleteMany({ where: { campaignId: id } });
        await tx.campaignGroup.createMany({ data: scope.groupIds.map((groupId) => ({ campaignId: id, groupId })) });
      }
      if (dto.profileIds) {
        await tx.campaignProfile.deleteMany({ where: { campaignId: id } });
        await tx.campaignProfile.createMany({ data: scope.profileIds.map((profileId) => ({ campaignId: id, profileId })) });
      }
      if (dto.articleIds) {
        await tx.campaignArticle.deleteMany({ where: { campaignId: id } });
        await tx.campaignArticle.createMany({ data: scope.articleIds.map((articleId) => ({ campaignId: id, articleId })) });
      }
      return tx.campaign.update({
        where: { id },
        data: {
          name: dto.name?.trim(),
          siteId: dto.siteId,
          categoryId: dto.categoryId === undefined ? undefined : scope.categoryId,
          status: dto.status,
          period: dto.period,
          target: dto.target,
          startsAt: dto.startsAt ? new Date(dto.startsAt) : undefined,
          endsAt: dto.endsAt === undefined ? undefined : dto.endsAt ? new Date(dto.endsAt) : null,
          timezone: dto.timezone,
          windowStart: dto.windowStart,
          windowEnd: dto.windowEnd,
          priority: dto.priority,
          notes: dto.notes,
          maxPerProfilePerDay: dto.maxPerProfilePerDay,
          activeProfiles: dto.activeProfiles,
          rotationTeams: dto.rotationTeams ? cleanTeams(dto.rotationTeams) : undefined,
        },
        include: CAMPAIGN_INCLUDE,
      });
    });
    this.behindCache = null;
    this.dayCache = null;
    await this.log('CAMPAIGN_UPDATED', `Campagne « ${c.name} » modifiée${dto.status ? ` (${dto.status === 'ACTIVE' ? 'active' : dto.status === 'PAUSED' ? 'en pause' : 'terminée'})` : ''}`, c.id, acting);
    return this.shape(c);
  }

  /** Supprimer une campagne ne touche à rien d'autre : ni posts, ni articles. */
  async remove(id: string, acting: CurrentUser | null) {
    const c = await this.reachable(id, acting);
    await this.prisma.campaign.delete({ where: { id } });
    this.behindCache = null;
    this.dayCache = null;
    await this.log('CAMPAIGN_DELETED', `Campagne « ${c.name} » supprimée (posts et articles intacts)`, null, acting);
    return { deleted: id };
  }

  /* ── Pour le pilotage ────────────────────────────────────────────────── */

  /** Les campagnes actives en retard (ou dans les temps mais sous l'attendu),
   * avec leur périmètre : leurs articles passent devant dans la file. Gardé
   * 2 minutes. */
  private behindCache: { at: number; rows: Array<{ id: string; priority: number; deficit: number; where: Prisma.PostTargetWhereInput; profileIds: string[] }> } | null = null;
  async behind(now = new Date()) {
    if (this.behindCache && now.getTime() - this.behindCache.at < 120_000) return this.behindCache.rows;
    const rows: NonNullable<CampaignsService['behindCache']>['rows'] = [];
    for (const c of await this.active(now)) {
      const p = await this.progress(c, now);
      if (!['late', 'on_track'].includes(p.status)) continue;
      rows.push({ id: c.id, priority: c.priority, deficit: Math.max(0, p.expected - p.published), where: this.targetWhere(c), profileIds: c.profiles.map((x) => x.profile.id) });
    }
    rows.sort((a, b) => b.priority - a.priority || b.deficit - a.deficit);
    this.behindCache = { at: now.getTime(), rows };
    return rows;
  }

  /** L'objectif du jour d'un compte : la part d'aujourd'hui de chacune de
   * ses campagnes actives (une campagne de la semaine compte pour 1/7, du
   * mois pour 1/N). `ownerId` omis = toutes les campagnes. */
  async dailyTarget(now = new Date(), ownerId?: string | null) {
    let total = 0;
    for (const c of await this.active(now, ownerId)) {
      const { days } = periodBounds(c.period as Period, now, c.timezone);
      total += Math.ceil(c.target / days);
    }
    return total;
  }

  /** Le besoin des campagnes actives, pour la cadence adaptative. Chaque
   * compte a ses objectifs : `ownerId` ne garde que ses campagnes (omis =
   * toutes). `null` quand aucune n'est active : pas d'objectif, pas de
   * cadence imposée. */
  async pacingNeed(now = new Date(), ownerId?: string | null) {
    const active = await this.active(now, ownerId);
    if (!active.length) return null;
    let neededPerHour = 0;
    let ratePerHour = 0;
    let late = false;
    for (const c of active) {
      const p = await this.progress(c, now);
      if (p.status === 'reached' || p.status === 'missed' || p.status === 'not_started') continue;
      neededPerHour += p.neededPerHour;
      ratePerHour += p.ratePerHour;
      if (p.status !== 'ahead') late = true;
    }
    return { neededPerHour, ratePerHour, status: (late ? 'late' : 'ahead') as 'late' | 'ahead' };
  }

  /* ── Rotation, plafond par profil, repos ────────────────────────────── */

  /** Les campagnes actives qui règlent QUI travaille (rotation d'équipes ou
   * plafond par profil), avec ce que chaque profil a déjà publié pour elles
   * aujourd'hui. Gardé 1 minute : le Pilotage et l'agent le lisent pour
   * chaque profil. Les autres campagnes ne retiennent personne. */
  private dayCache: { at: number; plan: DayPlan } | null = null;
  async dayPlan(now = new Date()): Promise<DayPlan> {
    if (this.dayCache && now.getTime() - this.dayCache.at < 60_000) return this.dayCache.plan;
    const rows = await Promise.resolve(
      this.prisma.campaign?.findMany({
        where: { status: 'ACTIVE', startsAt: { lte: now }, OR: [{ endsAt: null }, { endsAt: { gt: now } }] },
        include: { ...CAMPAIGN_INCLUDE, owner: { select: { role: true } } },
      }),
    ).catch(() => null);
    const campaigns: DayPlan['campaigns'] = [];
    for (const c of rows ?? []) {
      // Le pool : N profils actifs, les autres en réserve (au repos).
      const pool = c.activeProfiles ? await this.pool(c, now) : null;
      const managed = c.rotationTeams.length > 0 || c.maxPerProfilePerDay != null || Boolean(pool);
      const used = new Map<string, number>();
      if (c.maxPerProfilePerDay != null) {
        // Publiés aujourd'hui (jour de la campagne) + en cours : un lot déjà
        // réservé compte, sinon le plafond serait dépassé d'un lot.
        // Depuis le début du jour, ou de la campagne si elle date d'aujourd'hui.
        const day = periodBounds('day', now, c.timezone).from;
        const from = c.startsAt > day ? c.startsAt : day;
        const items = await this.prisma.publicationJobItem.findMany({
          where: {
            postTarget: this.targetWhere(c),
            OR: [{ status: TargetStatus.PUBLISHED, publishedAt: { gte: from } }, { status: { in: [TargetStatus.CLAIMED, TargetStatus.CONSUMED] }, job: { status: 'CLAIMED' } }],
          },
          select: { job: { select: { profileId: true } } },
        });
        for (const i of items) used.set(i.job.profileId, (used.get(i.job.profileId) ?? 0) + 1);
      }
      // Plage horaire et rythme : fermée, ses publications attendent.
      const p = await this.progress(c, now);
      const closed = campaignGate({
        now,
        timezone: c.timezone,
        windowStart: c.windowStart,
        windowEnd: c.windowEnd,
        target: c.target,
        published: p.published,
        expected: p.expected,
      });
      campaigns.push({
        id: c.id,
        name: c.name,
        closed,
        ownerId: c.ownerId,
        ownerIsAdmin: !c.ownerId || c.owner?.role === 'ADMIN',
        managed,
        // Avec un pool, seuls ses profils actifs publient pour elle.
        profileIds: pool ? pool.active.map((p) => p.id) : c.profiles.map((p) => p.profile.id),
        standby: pool ? pool.standby.map((p) => p.id) : [],
        teamToday: rotationTeamOf(c.rotationTeams, c.startsAt, now, c.timezone)?.team ?? null,
        max: c.maxPerProfilePerDay,
        used,
        where: this.targetWhere(c),
        outside: this.outsideWhere(c),
      });
    }
    const plan = { campaigns };
    this.dayCache = { at: now.getTime(), plan };
    return plan;
  }

  /** Le jour d'un profil :
   *   - les campagnes qui lui donnent du travail aujourd'hui ;
   *   - `resting` : une campagne à rotation/plafond le concerne et AUCUNE
   *     campagne ne lui donne de travail → repos complet (l'agent n'ouvre pas
   *     son navigateur) ;
   *   - `exclude` : les cibles qu'il ne doit pas prendre (celles d'une
   *     campagne à rotation/plafond qui ne le veut pas aujourd'hui, sauf si
   *     une autre campagne où il travaille les couvre aussi) ;
   *   - `left` : ce qu'il peut encore publier avant le premier plafond. */
  profileDay(profile: { id: string; ownerId: string | null; team: string | null }, plan: DayPlan) {
    const mine = plan.campaigns.filter((c) => c.ownerIsAdmin || c.ownerId === profile.ownerId);
    // Une campagne fermée (hors plage, objectif atteint, en avance) ferme
    // ses publications à TOUS les profils — sauf celles qu'une campagne
    // ouverte couvre aussi.
    const closed = plan.campaigns.filter((c) => c.closed);
    const openWhere = plan.campaigns.filter((c) => !c.closed).map((c) => c.where);
    const closedClause: Prisma.PostTargetWhereInput | null = closed.length
      ? openWhere.length
        ? { AND: [{ OR: closed.map((c) => c.where) }, { NOT: { OR: openWhere } }] }
        : { OR: closed.map((c) => c.where) }
      : null;
    // Le périmètre : les posts d'une campagne ne partent QUE dans ses groupes
    // (sauf qu'une autre campagne ouverte du même site les y envoie).
    const outside = plan.campaigns.filter((c) => c.outside).map((c) => c.outside as Prisma.PostTargetWhereInput);
    const outsideClause: Prisma.PostTargetWhereInput | null = outside.length
      ? openWhere.length
        ? { AND: [{ OR: outside }, { NOT: { OR: openWhere } }] }
        : { OR: outside }
      : null;
    // Ses profils : une campagne qui a choisi ses profils ne publie que par
    // eux, quelle que soit la rotation.
    const notMine = plan.campaigns.filter((c) => c.profileIds.length && !c.profileIds.includes(profile.id));
    const acceptWhere = plan.campaigns
      .filter((c) => !c.closed && (!c.profileIds.length || c.profileIds.includes(profile.id)))
      .map((c) => c.where);
    const notMineClause: Prisma.PostTargetWhereInput | null = notMine.length
      ? acceptWhere.length
        ? { AND: [{ OR: notMine.map((c) => c.where) }, { NOT: { OR: acceptWhere } }] }
        : { OR: notMine.map((c) => c.where) }
      : null;
    const working: DayPlan['campaigns'] = [];
    const blocking: Array<{ c: DayPlan['campaigns'][number]; why: string }> = [];
    for (const c of mine) {
      const inList = !c.profileIds.length || c.profileIds.includes(profile.id);
      const teamOk = !c.teamToday || c.teamToday === profile.team;
      const done = c.used.get(profile.id) ?? 0;
      const underMax = c.max == null || done < c.max;
      if (inList && teamOk && underMax && !c.closed) working.push(c);
      else if (c.managed && c.closed) blocking.push({ c, why: `« ${c.name} » ${c.closed}` });
      else if (c.managed)
        blocking.push({ c, why: !inList && c.standby?.includes(profile.id) ? `en réserve pour « ${c.name} » (${c.profileIds.length} profil(s) actifs)` : !inList ? `hors des profils de « ${c.name} »` : !teamOk ? `pas son équipe aujourd'hui (« ${c.name} »)` : `plafond du jour atteint pour « ${c.name} » (${done}/${c.max})` });
    }
    const resting = mine.some((c) => c.managed) && !working.length;
    const workWhere = working.map((c) => c.where);
    const parts: Prisma.PostTargetWhereInput[] = [
      ...blocking.map(({ c }) => (workWhere.length ? { AND: [c.where, { NOT: { OR: workWhere } }] } : c.where)),
      ...(closedClause ? [closedClause] : []),
      ...(outsideClause ? [outsideClause] : []),
      ...(notMineClause ? [notMineClause] : []),
    ];
    const exclude: Prisma.PostTargetWhereInput | null = parts.length ? { OR: parts } : null;
    const caps = working.filter((c) => c.max != null).map((c) => (c.max as number) - (c.used.get(profile.id) ?? 0));
    return {
      resting,
      reason: resting ? `repos (rotation) : ${blocking.map((b) => b.why).slice(0, 2).join(' ; ')}` : null,
      exclude,
      left: caps.length ? Math.max(0, Math.min(...caps)) : null,
      campaigns: working.map((c) => c.name),
      // Pour expliquer un « Rien à publier ».
      closed: [
        ...closed.filter((c) => mine.includes(c)).map((c) => `« ${c.name} » ${c.closed}`),
        ...notMine.filter((c) => mine.includes(c)).map((c) => `« ${c.name} » réservée à ses profils`),
      ],
    };
  }

  /** Les équipes connues : les groupes NSTBrowser d'origine des profils
   * visibles (remontés par l'agent local), avec leur effectif. */
  async teams(acting: CurrentUser | null) {
    const rows = await this.prisma.profile.groupBy({
      by: ['teamNstGroupId', 'teamNstGroupName'],
      where: { ...profileWhere(scopeOf(acting)), teamNstGroupId: { not: null } },
      _count: { _all: true },
    });
    return rows
      .map((r) => ({ id: r.teamNstGroupId as string, name: r.teamNstGroupName ?? r.teamNstGroupId, profiles: r._count._all }))
      .sort((a, b) => String(a.name).localeCompare(String(b.name)));
  }

  /* ── Interne ─────────────────────────────────────────────────────────── */

  private active(now: Date, ownerId?: string | null) {
    return this.prisma.campaign.findMany({
      where: {
        status: 'ACTIVE',
        startsAt: { lte: now },
        OR: [{ endsAt: null }, { endsAt: { gt: now } }],
        ...(ownerId !== undefined ? { ownerId } : {}),
      },
      include: CAMPAIGN_INCLUDE,
    });
  }

  /** Les publications (cibles) qui comptent pour cette campagne. */
  targetWhere(c: CampaignRow): Prisma.PostTargetWhereInput {
    const groupIds = c.groups.map((g) => g.group.id);
    const articleIds = c.articles.map((a) => a.article.id);
    return {
      post: { article: { sourceId: c.siteId, ...(articleIds.length ? { id: { in: articleIds } } : {}) } },
      ...(groupIds.length ? { groupId: { in: groupIds } } : c.categoryId ? { group: { categoryId: c.categoryId } } : {}),
    };
  }

  /** Les profils parmi lesquels se forme le pool : ceux de sa liste, sinon
   * ceux de son compte (la maison pour une campagne d'ADMIN). Jamais un
   * modérateur. */
  private async pool(c: CampaignRow & { owner?: { role: string } | null }, now: Date) {
    const listed = c.profiles.map((p) => p.profile.id);
    const owner =
      c.ownerId && c.owner === undefined
        ? await this.prisma.user.findUnique({ where: { id: c.ownerId }, select: { role: true } })
        : c.owner ?? null;
    const manager = Boolean(c.ownerId && owner && owner.role !== 'ADMIN');
    const candidates = await this.prisma.profile.findMany({
      where: {
        isModerator: false,
        ...(listed.length
          ? { id: { in: listed } }
          : manager
            ? { ownerId: c.ownerId }
            : { OR: [{ ownerId: null }, { owner: { role: 'ADMIN' } }] }),
      },
      select: {
        id: true,
        name: true,
        createdAt: true,
        status: true,
        externalId: true,
        facebookSuspension: true,
        runner: { select: { mode: true, pausedUntil: true, running: true, lastSeenAt: true, browserState: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
    return poolOf(candidates, c.activeProfiles ?? candidates.length, now);
  }

  /** Les publications de SES articles qui tombent hors de son périmètre :
   * dans un groupe hors de sa liste (ou hors de sa catégorie). Le dépôt
   * WordPress crée un post par groupe de la catégorie du site ; la campagne
   * décide où ils partent vraiment. `null` : ni liste, ni catégorie. */
  outsideWhere(c: CampaignRow): Prisma.PostTargetWhereInput | null {
    const groupIds = c.groups.map((g) => g.group.id);
    const articleIds = c.articles.map((a) => a.article.id);
    const post = { article: { sourceId: c.siteId, ...(articleIds.length ? { id: { in: articleIds } } : {}) } };
    if (groupIds.length) return { post, groupId: { notIn: groupIds } };
    if (c.categoryId) return { post, group: { OR: [{ categoryId: null }, { categoryId: { not: c.categoryId } }] } };
    return null;
  }

  private async publications(c: CampaignRow, from: Date, to: Date) {
    const profileIds = c.profiles.map((p) => p.profile.id);
    const items = await this.prisma.publicationJobItem.findMany({
      where: {
        status: TargetStatus.PUBLISHED,
        publishedAt: { gte: from, lt: to },
        postTarget: { ...this.targetWhere(c), approvalPendingSince: null },
        ...(profileIds.length ? { job: { profileId: { in: profileIds } } } : {}),
      },
      select: { publishedAt: true, job: { select: { profileId: true } }, postTarget: { select: { groupId: true } }, post: { select: { articleId: true } } },
    });
    return items.map((i) => ({ publishedAt: i.publishedAt, profileId: i.job.profileId, groupId: i.postTarget.groupId, articleId: i.post.articleId }));
  }

  private async progress(c: CampaignRow, now: Date) {
    // Chaque campagne a SON objectif : seules comptent les publications
    // faites depuis son lancement. Sans cela, une nouvelle campagne sur le
    // même site héritait de ce que la précédente avait publié le même jour,
    // se croyait « objectif atteint » et ne publiait rien.
    const period = periodBounds(c.period as Period, now, c.timezone);
    const from = c.startsAt > period.from ? c.startsAt : period.from;
    const to = period.to;
    const items = await this.publications(c, from, to);
    const hourAgo = now.getTime() - 3_600_000;
    const pace = campaignPace({
      period: c.period as Period,
      target: c.target,
      published: items.length,
      lastHour: items.filter((i) => i.publishedAt && i.publishedAt.getTime() >= hourAgo).length,
      now,
      startsAt: c.startsAt,
      timezone: c.timezone,
      windowStart: c.windowStart,
      windowEnd: c.windowEnd,
    });
    // Ce qui attend déjà dans la file pour elle.
    const stock = await this.prisma.postTarget.count({
      where: { ...this.targetWhere(c), status: TargetStatus.AVAILABLE, post: { status: 'AVAILABLE', article: { sourceId: c.siteId, status: 'ACTIVE' } } },
    });
    const state =
      c.status === 'PAUSED' ? 'paused' : c.status === 'ENDED' || (c.endsAt && c.endsAt <= now) ? 'ended' : c.startsAt > now ? 'scheduled' : pace.status;
    return { ...pace, since: from, published: items.length, target: c.target, stock, deficit: Math.max(0, pace.remaining - stock), state };
  }

  private async names(items: Array<{ profileId: string; groupId: string; articleId: string | null }>) {
    const ids = <K extends 'profileId' | 'groupId' | 'articleId'>(k: K) => [...new Set(items.map((i) => i[k]).filter((x): x is string => Boolean(x)))];
    const [profiles, groups, articles] = await Promise.all([
      this.prisma.profile.findMany({ where: { id: { in: ids('profileId') } }, select: { id: true, name: true } }),
      this.prisma.group.findMany({ where: { id: { in: ids('groupId') } }, select: { id: true, name: true } }),
      this.prisma.article.findMany({ where: { id: { in: ids('articleId') } }, select: { id: true, title: true } }),
    ]);
    return {
      profiles: new Map(profiles.map((p) => [p.id, p.name])),
      groups: new Map(groups.map((g) => [g.id, g.name])),
      articles: new Map(articles.map((a) => [a.id, a.title])),
    };
  }

  /** Tout ce que la campagne vise doit être visible du compte : son site,
   * sa catégorie (celle du site par défaut), ses groupes, profils, articles. */
  private async checkScope(
    dto: { siteId: string; categoryId?: string | null; groupIds?: string[]; profileIds?: string[]; articleIds?: string[] },
    acting: CurrentUser | null,
  ) {
    const scope = scopeOf(acting);
    const site = await this.prisma.contentSource.findFirst({ where: { id: dto.siteId, ...siteWhere(scope) }, select: { id: true, categoryId: true } });
    if (!site) throw new BadRequestException('Site introuvable : le site est obligatoire');
    const uniq = (xs?: string[]) => [...new Set(xs ?? [])];
    const [groups, profiles, articles] = await Promise.all([
      this.prisma.group.findMany({ where: { id: { in: uniq(dto.groupIds) }, ...groupWhere(scope) }, select: { id: true } }),
      this.prisma.profile.findMany({ where: { id: { in: uniq(dto.profileIds) }, ...profileWhere(scope) }, select: { id: true } }),
      this.prisma.article.findMany({ where: { id: { in: uniq(dto.articleIds) }, sourceId: dto.siteId, ...articleWhere(scope) }, select: { id: true } }),
    ]);
    if (groups.length !== uniq(dto.groupIds).length) throw new BadRequestException('Un groupe choisi est introuvable');
    if (profiles.length !== uniq(dto.profileIds).length) throw new BadRequestException('Un profil choisi est introuvable');
    if (articles.length !== uniq(dto.articleIds).length) throw new BadRequestException('Un article choisi n’est pas de ce site');
    return {
      categoryId: dto.categoryId === undefined ? site.categoryId : dto.categoryId,
      groupIds: groups.map((g) => g.id),
      profileIds: profiles.map((p) => p.id),
      articleIds: articles.map((a) => a.id),
    };
  }

  private async reachable(id: string, acting: CurrentUser | null) {
    const c = await this.prisma.campaign.findFirst({ where: { id, ...ownedWhere(scopeOf(acting)) }, include: CAMPAIGN_INCLUDE });
    if (!c) throw new NotFoundException('Campagne introuvable');
    return c;
  }

  private shape(c: CampaignRow) {
    return {
      id: c.id,
      name: c.name,
      status: c.status,
      period: c.period,
      target: c.target,
      startsAt: c.startsAt,
      endsAt: c.endsAt,
      timezone: c.timezone,
      windowStart: c.windowStart,
      windowEnd: c.windowEnd,
      priority: c.priority,
      notes: c.notes,
      maxPerProfilePerDay: c.maxPerProfilePerDay,
      activeProfiles: c.activeProfiles,
      rotationTeams: c.rotationTeams,
      // L'équipe de service aujourd'hui (rotation), et le jour du cycle.
      rotationToday: rotationTeamOf(c.rotationTeams, c.startsAt, new Date(), c.timezone),
      site: c.site,
      category: c.category,
      groups: c.groups.map((g) => g.group),
      profiles: c.profiles.map((p) => p.profile),
      articles: c.articles.map((a) => a.article),
    };
  }

  private periodName(p: string) {
    return p === 'week' ? 'semaine' : p === 'month' ? 'mois' : 'jour';
  }

  private log(eventType: string, message: string, campaignId: string | null, acting: CurrentUser | null) {
    return this.prisma.activityLog.create({ data: { eventType, message, metadata: { campaignId, by: acting?.username ?? 'clé globale' } } });
  }
}

export type DayPlan = {
  campaigns: Array<{
    id: string;
    name: string;
    /** Fermée en ce moment (hors plage, objectif atteint, en avance) : la raison. */
    closed: string | null;
    ownerId: string | null;
    ownerIsAdmin: boolean;
    /** Rotation ou plafond par profil : elle décide qui travaille. */
    managed: boolean;
    profileIds: string[];
    teamToday: string | null;
    max: number | null;
    used: Map<string, number>;
    /** Pool : ses profils en réserve (au repos tant qu'une place n'est pas libre). */
    standby?: string[];
    where: Prisma.PostTargetWhereInput;
    /** Ses posts hors de son périmètre (groupes hors liste) : fermés. */
    outside?: Prisma.PostTargetWhereInput | null;
  }>;
};

function cleanTeams(teams?: string[]) {
  return (teams ?? []).map((t) => t.trim()).filter(Boolean);
}
