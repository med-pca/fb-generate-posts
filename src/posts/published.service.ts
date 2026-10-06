import { Injectable } from '@nestjs/common';
import { Prisma, TargetStatus, VerifyStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { CurrentUser } from '../auth/current-user';
import { postWhere, scopeOf } from '../auth/scope';
import { PublishedQueryDto } from './dto/queue.dto';

/** Au-delà, les totaux seraient trop lourds à calculer d'un coup : la période
 * est à resserrer (c'est dit dans la réponse). */
const MAX_AUDITED = 50_000;

type Row = {
  id: string;
  publishedAt: Date | null;
  commentedAt: Date | null;
  linkUpdatedAt: Date | null;
  verifyStatus: VerifyStatus | null;
  facebookUrl: string | null;
  groupId: string;
  post: { url: string | null };
  jobItems: Array<{ job: { profileId: string } }>;
};

/** L'état du lien de l'article, comme la file l'affiche. */
export function linkState(r: { linkUpdatedAt: Date | null; commentedAt: Date | null; post: { url: string | null } }) {
  if (r.linkUpdatedAt) return 'placed' as const;
  if (!r.post.url) return 'none' as const;
  return r.commentedAt ? ('waiting' as const) : ('missing' as const);
}

/** Un jour au format AAAA-MM-JJ, dans le fuseau de l'objectif. */
function dayIn(at: Date, timeZone: string) {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(at);
  } catch {
    return at.toISOString().slice(0, 10);
  }
}
function hourIn(at: Date, timeZone: string) {
  try {
    return Number(new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', hour12: false }).format(at)) % 24;
  } catch {
    return at.getUTCHours();
  }
}

/** L'audit des publications faites : combien, quand, par qui, où, et dans
 * quel état (vérifiées, lien posé, adresse connue). Les totaux portent sur
 * TOUT ce que le filtre retient ; la liste, elle, est paginée. */
@Injectable()
export class PublishedService {
  constructor(private readonly prisma: PrismaService) {}

  where(q: PublishedQueryDto, acting: CurrentUser | null): Prisma.PostTargetWhereInput {
    const and: Prisma.PostTargetWhereInput[] = [{ status: TargetStatus.PUBLISHED }, { post: postWhere(scopeOf(acting)) }];
    if (q.from || q.to) {
      and.push({ publishedAt: { ...(q.from ? { gte: new Date(q.from) } : {}), ...(q.to ? { lt: new Date(q.to) } : {}) } });
    }
    if (q.groupId) and.push({ groupId: q.groupId });
    if (q.categoryId) and.push({ group: { categoryId: q.categoryId } });
    if (q.profileId) and.push({ jobItems: { some: { status: TargetStatus.PUBLISHED, job: { profileId: q.profileId } } } });
    if (q.verify === 'ok') and.push({ verifyStatus: VerifyStatus.OK });
    if (q.verify === 'republished') and.push({ verifyStatus: VerifyStatus.REPUBLISHED });
    if (q.verify === 'needs_action') and.push({ verifyStatus: VerifyStatus.NEEDS_ACTION });
    if (q.verify === 'unverified') and.push({ verifyStatus: null });
    if (q.link === 'placed') and.push({ linkUpdatedAt: { not: null } });
    if (q.link === 'waiting') and.push({ linkUpdatedAt: null, commentedAt: { not: null }, post: { url: { not: null } } });
    if (q.link === 'missing') and.push({ linkUpdatedAt: null, commentedAt: null, post: { url: { not: null } } });
    if (q.link === 'none') and.push({ linkUpdatedAt: null, post: { url: null } });
    if (q.url === 'with') and.push({ facebookUrl: { not: null } });
    if (q.url === 'without') and.push({ facebookUrl: null });
    const needle = q.search?.trim();
    if (needle) {
      and.push({ post: { OR: [{ title: { contains: needle, mode: 'insensitive' } }, { description: { contains: needle, mode: 'insensitive' } }] } });
    }
    return { AND: and };
  }

  async audit(q: PublishedQueryDto, acting: CurrentUser | null) {
    const where = this.where(q, acting);
    const settings = await this.prisma.automationSetting.findUnique({ where: { id: 'global' }, select: { objectiveTimezone: true } });
    const timeZone = settings?.objectiveTimezone || 'Europe/Paris';
    const [total, rows, all] = await Promise.all([
      this.prisma.postTarget.count({ where }),
      this.prisma.postTarget.findMany({
        where,
        orderBy: { publishedAt: 'desc' },
        skip: (q.page - 1) * q.limit,
        take: q.limit,
        select: {
          id: true,
          publishedAt: true,
          commentedAt: true,
          linkUpdatedAt: true,
          verifyStatus: true,
          verifyDetail: true,
          verifiedAt: true,
          republishCount: true,
          repeatRound: true,
          facebookUrl: true,
          post: { select: { id: true, title: true, imageUrl: true, url: true, priority: true } },
          group: { select: { id: true, name: true, url: true, category: { select: { id: true, name: true } } } },
          jobItems: {
            where: { status: TargetStatus.PUBLISHED },
            orderBy: { publishedAt: 'desc' },
            take: 1,
            select: { externalPostUrl: true, job: { select: { profile: { select: { id: true, name: true } } } } },
          },
        },
      }),
      // Pour les totaux : le strict nécessaire, sur tout le filtre.
      this.prisma.postTarget.findMany({
        where,
        take: MAX_AUDITED,
        select: {
          id: true,
          publishedAt: true,
          commentedAt: true,
          linkUpdatedAt: true,
          verifyStatus: true,
          facebookUrl: true,
          groupId: true,
          post: { select: { url: true } },
          jobItems: { where: { status: TargetStatus.PUBLISHED }, orderBy: { publishedAt: 'desc' }, take: 1, select: { job: { select: { profileId: true } } } },
        },
      }) as Promise<Row[]>,
    ]);

    const tally = <K extends string>(keyOf: (r: Row) => K | null) => {
      const out = new Map<K, number>();
      for (const r of all) {
        const k = keyOf(r);
        if (k !== null) out.set(k, (out.get(k) ?? 0) + 1);
      }
      return out;
    };
    const byProfileId = tally((r) => r.jobItems[0]?.job.profileId ?? null);
    const byGroupId = tally((r) => r.groupId);
    const byDay = tally((r) => (r.publishedAt ? dayIn(r.publishedAt, timeZone) : null));
    const byHour = tally((r) => (r.publishedAt ? String(hourIn(r.publishedAt, timeZone)) : null));
    const verify = tally((r) => (r.verifyStatus ? r.verifyStatus.toLowerCase() : 'unverified'));
    const link = tally((r) => linkState(r));

    const [profiles, groups] = await Promise.all([
      this.prisma.profile.findMany({ where: { id: { in: [...byProfileId.keys()] } }, select: { id: true, name: true } }),
      this.prisma.group.findMany({ where: { id: { in: [...byGroupId.keys()] } }, select: { id: true, name: true } }),
    ]);
    const named = (m: Map<string, number>, names: Array<{ id: string; name: string }>) =>
      [...m.entries()]
        .map(([id, count]) => ({ id, name: names.find((n) => n.id === id)?.name ?? '—', count }))
        .sort((a, b) => b.count - a.count);

    return {
      timeZone,
      total,
      truncated: total > MAX_AUDITED,
      summary: {
        total,
        withUrl: all.filter((r) => r.facebookUrl).length,
        verify: Object.fromEntries(verify),
        link: Object.fromEntries(link),
        byProfile: named(byProfileId, profiles),
        byGroup: named(byGroupId, groups),
        byDay: [...byDay.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([day, count]) => ({ day, count })),
        byHour: Array.from({ length: 24 }, (_, h) => byHour.get(String(h)) ?? 0),
      },
      rows: rows.map((r) => ({
        targetId: r.id,
        publishedAt: r.publishedAt,
        post: r.post,
        group: r.group,
        profile: r.jobItems[0]?.job.profile ?? null,
        facebookUrl: r.facebookUrl ?? r.jobItems[0]?.externalPostUrl ?? null,
        link: linkState(r),
        verify: { status: r.verifyStatus, at: r.verifiedAt, detail: r.verifyDetail, republishCount: r.republishCount },
        repeatRound: r.repeatRound,
      })),
      page: q.page,
      limit: q.limit,
    };
  }

  /** Le même filtre, en CSV (une ligne par publication), pour un tableur. */
  async csv(q: PublishedQueryDto, acting: CurrentUser | null) {
    const rows = await this.prisma.postTarget.findMany({
      where: this.where(q, acting),
      orderBy: { publishedAt: 'desc' },
      take: MAX_AUDITED,
      select: {
        publishedAt: true,
        commentedAt: true,
        linkUpdatedAt: true,
        verifyStatus: true,
        facebookUrl: true,
        post: { select: { title: true, url: true } },
        group: { select: { name: true, category: { select: { name: true } } } },
        jobItems: { where: { status: TargetStatus.PUBLISHED }, orderBy: { publishedAt: 'desc' }, take: 1, select: { job: { select: { profile: { select: { name: true } } } } } },
      },
    });
    const cell = (v: unknown) => {
      const s = v === null || v === undefined ? '' : String(v);
      // Pas de formule interprétée par le tableur.
      const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
      return /[";\n,]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
    };
    const head = ['publie_le', 'profil', 'groupe', 'categorie', 'post', 'lien_article', 'etat_lien', 'verification', 'adresse_facebook'];
    const lines = rows.map((r) =>
      [
        r.publishedAt?.toISOString() ?? '',
        r.jobItems[0]?.job.profile.name ?? '',
        r.group.name,
        r.group.category?.name ?? '',
        r.post.title,
        r.post.url ?? '',
        linkState(r),
        r.verifyStatus ?? 'non vérifié',
        r.facebookUrl ?? '',
      ].map(cell).join(';'),
    );
    return '﻿' + [head.join(';'), ...lines].join('\n');
  }
}
