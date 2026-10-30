import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, TargetStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { CurrentUser } from '../auth/current-user';
import { jobWhere, ownedWhere, scopeOf } from '../auth/scope';
import { startOfLocalDay } from '../insights/insights.service';
import { localClock } from '../runners/window';

export type AnalyticsFilters = {
  from?: string;
  to?: string;
  siteId?: string;
  campaignId?: string;
  categoryId?: string;
  groupId?: string;
  profileId?: string;
  articleId?: string;
  tz?: string;
};

const DAY = 86_400_000;
const MAX_ROWS = 200_000;

/** L'analyse des publications : un même jeu de filtres (période, site,
 * campagne, catégorie, groupe, profil, article) pour les chiffres clés, la
 * courbe, les classements, les heures, les échecs — et l'export CSV.
 *
 * Une publication = une ligne de lot publiée (une republication compte à
 * nouveau). Les posts en attente de validation ne comptent pas. Un
 * gestionnaire ne voit que les publications de ses profils. */
@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  async report(f: AnalyticsFilters, acting: CurrentUser | null) {
    const tz = await this.timezone(f.tz);
    const range = this.range(f, tz);
    const where = await this.where(f, acting);
    const span = range.to.getTime() - range.from.getTime();
    const [published, failed, previous] = await Promise.all([
      this.published(where, range.from, range.to),
      this.failed(where, range.from, range.to),
      this.prisma.publicationJobItem.count({ where: this.publishedWhere(where, new Date(range.from.getTime() - span), range.from) }),
    ]);
    const names = await this.names(published, failed);

    // La courbe : par heure sur 2 jours au plus, sinon par jour.
    const bucket: 'hour' | 'day' = span <= 2 * DAY ? 'hour' : 'day';
    const slots = new Map<number, { at: number; published: number; failed: number }>();
    const slotOf = (d: Date) => (bucket === 'hour' ? Math.floor(d.getTime() / 3_600_000) * 3_600_000 : startOfLocalDay(d, tz).getTime());
    for (let t = slotOf(range.from); t < range.to.getTime(); t = bucket === 'hour' ? t + 3_600_000 : startOfLocalDay(new Date(t + DAY + 12 * 3_600_000), tz).getTime()) {
      slots.set(t, { at: t, published: 0, failed: 0 });
    }
    for (const p of published) {
      const s = slots.get(slotOf(p.at));
      if (s) s.published += 1;
    }
    for (const x of failed) {
      const s = slots.get(slotOf(x.at));
      if (s) s.failed += 1;
    }

    // À quelle heure on publie (fuseau choisi).
    const hours = Array.from({ length: 24 }, () => 0);
    for (const p of published) hours[Math.floor(localClock(p.at, tz).minutes / 60)] += 1;

    const rank = (key: 'articleId' | 'profileId' | 'groupId' | 'siteId', label: Map<string, string>, withFailures = false) => {
      const map = new Map<string, { published: number; failed: number }>();
      for (const p of published) {
        const k = p[key];
        if (!k) continue;
        const e = map.get(k) ?? { published: 0, failed: 0 };
        e.published += 1;
        map.set(k, e);
      }
      if (withFailures) {
        for (const x of failed) {
          const k = x[key];
          if (!k) continue;
          const e = map.get(k) ?? { published: 0, failed: 0 };
          e.failed += 1;
          map.set(k, e);
        }
      }
      return [...map]
        .map(([id, e]) => ({ id, name: label.get(id) ?? '—', ...e, failureRate: e.published + e.failed ? Math.round((e.failed / (e.published + e.failed)) * 100) : 0 }))
        .sort((a, b) => b.published - a.published || b.failed - a.failed)
        .slice(0, 100);
    };
    const reasons = new Map<string, number>();
    for (const x of failed) {
      const r = (x.error || 'sans motif').replace(/\s+/g, ' ').replace(/https?:\/\/\S+/g, '…').slice(0, 90);
      reasons.set(r, (reasons.get(r) ?? 0) + 1);
    }
    const days = Math.max(1, span / DAY);
    const total = published.length + failed.length;
    return {
      range: { from: range.from, to: range.to, timezone: tz, bucket },
      kpis: {
        published: published.length,
        failed: failed.length,
        failureRate: total ? Math.round((failed.length / total) * 1000) / 10 : 0,
        perDay: Math.round((published.length / days) * 10) / 10,
        articles: new Set(published.map((p) => p.articleId).filter(Boolean)).size,
        groups: new Set(published.map((p) => p.groupId)).size,
        profiles: new Set(published.map((p) => p.profileId)).size,
        linked: published.filter((p) => p.linked).length,
        verified: published.filter((p) => p.verified).length,
        previous,
        delta: previous ? Math.round(((published.length - previous) / previous) * 1000) / 10 : null,
      },
      series: [...slots.values()],
      hours,
      bySite: rank('siteId', names.sites),
      byArticle: rank('articleId', names.articles),
      byProfile: rank('profileId', names.profiles, true),
      byGroup: rank('groupId', names.groups, true),
      failureReasons: [...reasons].map(([reason, count]) => ({ reason, count })).sort((a, b) => b.count - a.count).slice(0, 15),
    };
  }

  /** Les publications de la période, une ligne chacune. */
  async csv(f: AnalyticsFilters, acting: CurrentUser | null) {
    const tz = await this.timezone(f.tz);
    const range = this.range(f, tz);
    const where = await this.where(f, acting);
    const rows = await this.prisma.publicationJobItem.findMany({
      where: this.publishedWhere(where, range.from, range.to),
      orderBy: { publishedAt: 'asc' },
      take: MAX_ROWS,
      select: {
        publishedAt: true,
        externalPostUrl: true,
        linkUpdatedAt: true,
        job: { select: { profile: { select: { name: true } } } },
        postTarget: { select: { verifyStatus: true, group: { select: { name: true, category: { select: { name: true } } } } } },
        post: { select: { title: true, article: { select: { title: true, articleUrl: true, source: { select: { name: true } } } } } },
      },
    });
    const cell = (v: unknown) => {
      const s = String(v ?? '');
      return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const when = (d: Date | null) =>
      d ? new Intl.DateTimeFormat('fr-FR', { timeZone: tz, dateStyle: 'short', timeStyle: 'short' }).format(d) : '';
    const head = ['Date', 'Site', 'Article', 'Adresse article', 'Groupe', 'Catégorie', 'Profil', 'Publication Facebook', 'Lien posé', 'Vérifié'];
    const lines = rows.map((r) =>
      [
        when(r.publishedAt),
        r.post.article?.source.name ?? '',
        r.post.article?.title ?? r.post.title,
        r.post.article?.articleUrl ?? '',
        r.postTarget.group.name,
        r.postTarget.group.category?.name ?? '',
        r.job.profile.name,
        r.externalPostUrl ?? '',
        r.linkUpdatedAt ? 'oui' : 'non',
        r.postTarget.verifyStatus === 'OK' ? 'oui' : '',
      ].map(cell).join(';'),
    );
    // BOM : Excel ouvre l'UTF-8 (accents, arabe) correctement.
    return `﻿${[head.join(';'), ...lines].join('\n')}\n`;
  }

  /* ── Interne ─────────────────────────────────────────────────────────── */

  private async timezone(tz?: string) {
    if (tz) {
      try {
        new Intl.DateTimeFormat('fr-FR', { timeZone: tz });
        return tz;
      } catch {
        throw new BadRequestException(`Fuseau inconnu : ${tz}`);
      }
    }
    const s = await this.prisma.automationSetting.findUnique({ where: { id: 'global' }, select: { objectiveTimezone: true } }).catch(() => null);
    return s?.objectiveTimezone || 'Europe/Paris';
  }

  /** La période : `from`/`to` (dates ou dates-heures). Une date seule couvre
   * toute la journée locale. Par défaut : les 7 derniers jours. */
  private range(f: AnalyticsFilters, tz: string) {
    const now = new Date();
    const local = (v: string, end: boolean) => {
      if (/^\d{4}-\d{2}-\d{2}$/.test(v)) {
        const noon = new Date(`${v}T12:00:00Z`);
        const start = startOfLocalDay(noon, tz);
        return end ? startOfLocalDay(new Date(start.getTime() + DAY + 12 * 3_600_000), tz) : start;
      }
      const d = new Date(v);
      if (Number.isNaN(d.getTime())) throw new BadRequestException(`Date illisible : ${v}`);
      return d;
    };
    const to = f.to ? local(f.to, true) : now;
    const from = f.from ? local(f.from, false) : startOfLocalDay(new Date(now.getTime() - 6 * DAY), tz);
    if (from >= to) throw new BadRequestException('La date de début doit précéder la date de fin');
    if (to.getTime() - from.getTime() > 400 * DAY) throw new BadRequestException('Période trop longue (400 jours au plus)');
    return { from, to };
  }

  /** Les filtres, appliqués aux lignes de lot (publiées ou en échec). */
  private async where(f: AnalyticsFilters, acting: CurrentUser | null): Promise<Prisma.PublicationJobItemWhereInput[]> {
    const and: Prisma.PublicationJobItemWhereInput[] = [{ job: jobWhere(scopeOf(acting)) }];
    if (f.profileId) and.push({ job: { profileId: f.profileId } });
    if (f.groupId) and.push({ postTarget: { groupId: f.groupId } });
    if (f.categoryId) and.push({ postTarget: { group: { categoryId: f.categoryId === 'none' ? null : f.categoryId } } });
    if (f.siteId) and.push({ post: { article: { sourceId: f.siteId } } });
    if (f.articleId) and.push({ post: { articleId: f.articleId } });
    if (f.campaignId) {
      const c = await this.prisma.campaign.findFirst({
        where: { id: f.campaignId, ...ownedWhere(scopeOf(acting)) },
        select: { id: true },
      });
      if (!c) throw new NotFoundException('Campagne introuvable');
      // Ses publications : celles réservées pour elle, comme sur sa carte.
      and.push({ campaignId: c.id });
    }
    return and;
  }

  private publishedWhere(where: Prisma.PublicationJobItemWhereInput[], from: Date, to: Date): Prisma.PublicationJobItemWhereInput {
    return { AND: [...where, { status: TargetStatus.PUBLISHED, publishedAt: { gte: from, lt: to }, postTarget: { approvalPendingSince: null } }] };
  }

  private async published(where: Prisma.PublicationJobItemWhereInput[], from: Date, to: Date) {
    const rows = await this.prisma.publicationJobItem.findMany({
      where: this.publishedWhere(where, from, to),
      take: MAX_ROWS,
      select: {
        publishedAt: true,
        linkUpdatedAt: true,
        job: { select: { profileId: true } },
        postTarget: { select: { groupId: true, verifyStatus: true } },
        post: { select: { articleId: true, article: { select: { sourceId: true } } } },
      },
    });
    return rows.map((r) => ({
      at: r.publishedAt as Date,
      profileId: r.job.profileId,
      groupId: r.postTarget.groupId,
      articleId: r.post.articleId,
      siteId: r.post.article?.sourceId ?? null,
      linked: Boolean(r.linkUpdatedAt),
      verified: r.postTarget.verifyStatus === 'OK',
    }));
  }

  private async failed(where: Prisma.PublicationJobItemWhereInput[], from: Date, to: Date) {
    const rows = await this.prisma.publicationJobItem.findMany({
      where: { AND: [...where, { status: TargetStatus.FAILED, updatedAt: { gte: from, lt: to } }] },
      take: MAX_ROWS,
      select: { updatedAt: true, error: true, job: { select: { profileId: true } }, postTarget: { select: { groupId: true } }, post: { select: { articleId: true, article: { select: { sourceId: true } } } } },
    });
    return rows.map((r) => ({
      at: r.updatedAt,
      error: r.error,
      profileId: r.job.profileId,
      groupId: r.postTarget.groupId,
      articleId: r.post.articleId,
      siteId: r.post.article?.sourceId ?? null,
    }));
  }

  private async names(...lists: Array<Array<{ profileId: string; groupId: string; articleId: string | null; siteId: string | null }>>) {
    const all = lists.flat();
    const ids = (k: 'profileId' | 'groupId' | 'articleId' | 'siteId') => [...new Set(all.map((x) => x[k]).filter((v): v is string => Boolean(v)))];
    const [profiles, groups, articles, sites] = await Promise.all([
      this.prisma.profile.findMany({ where: { id: { in: ids('profileId') } }, select: { id: true, name: true } }),
      this.prisma.group.findMany({ where: { id: { in: ids('groupId') } }, select: { id: true, name: true } }),
      this.prisma.article.findMany({ where: { id: { in: ids('articleId') } }, select: { id: true, title: true } }),
      this.prisma.contentSource.findMany({ where: { id: { in: ids('siteId') } }, select: { id: true, name: true } }),
    ]);
    return {
      profiles: new Map(profiles.map((x) => [x.id, x.name])),
      groups: new Map(groups.map((x) => [x.id, x.name])),
      articles: new Map(articles.map((x) => [x.id, x.title])),
      sites: new Map(sites.map((x) => [x.id, x.name])),
    };
  }
}
