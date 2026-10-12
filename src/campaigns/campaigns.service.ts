import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, TargetStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { CurrentUser } from '../auth/current-user';
import { articleWhere, groupWhere, ownedWhere, profileWhere, scopeOf, siteWhere } from '../auth/scope';
import { localClock } from '../runners/window';
import { campaignPace, periodBounds, type Period } from './period';
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
    return Promise.all(rows.map(async (c) => ({ ...this.shape(c), progress: await this.progress(c, now) })));
  }

  async detail(id: string, acting: CurrentUser | null, now = new Date()) {
    const c = await this.reachable(id, acting);
    const progress = await this.progress(c, now);
    const items = await this.publications(c, progress.from, progress.to);
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
        groups: { create: scope.groupIds.map((groupId) => ({ groupId })) },
        profiles: { create: scope.profileIds.map((profileId) => ({ profileId })) },
        articles: { create: scope.articleIds.map((articleId) => ({ articleId })) },
      },
      include: CAMPAIGN_INCLUDE,
    });
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
        },
        include: CAMPAIGN_INCLUDE,
      });
    });
    this.behindCache = null;
    await this.log('CAMPAIGN_UPDATED', `Campagne « ${c.name} » modifiée${dto.status ? ` (${dto.status === 'ACTIVE' ? 'active' : dto.status === 'PAUSED' ? 'en pause' : 'terminée'})` : ''}`, c.id, acting);
    return this.shape(c);
  }

  /** Supprimer une campagne ne touche à rien d'autre : ni posts, ni articles. */
  async remove(id: string, acting: CurrentUser | null) {
    const c = await this.reachable(id, acting);
    await this.prisma.campaign.delete({ where: { id } });
    this.behindCache = null;
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

  /** Le besoin total des campagnes actives, pour la cadence adaptative. `null`
   * quand aucune campagne n'est active : l'ancien objectif global prend alors
   * le relais (rien ne change tant qu'on n'a pas créé de campagne). */
  async pacingNeed(now = new Date()) {
    const active = await this.active(now);
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

  /* ── Interne ─────────────────────────────────────────────────────────── */

  private active(now: Date) {
    return this.prisma.campaign.findMany({
      where: { status: 'ACTIVE', startsAt: { lte: now }, OR: [{ endsAt: null }, { endsAt: { gt: now } }] },
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
    // Toute la période en cours compte, même si la campagne a été créée en
    // cours de route (l'objectif vaut pour le jour, la semaine ou le mois).
    const { from, to } = periodBounds(c.period as Period, now, c.timezone);
    const items = await this.publications(c, from, to);
    const hourAgo = now.getTime() - 3_600_000;
    const pace = campaignPace({
      period: c.period as Period,
      target: c.target,
      published: items.length,
      lastHour: items.filter((i) => i.publishedAt && i.publishedAt.getTime() >= hourAgo).length,
      now,
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
    return { ...pace, published: items.length, target: c.target, stock, deficit: Math.max(0, pace.remaining - stock), state };
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
