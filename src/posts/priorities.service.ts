import { Injectable, NotFoundException } from '@nestjs/common';
import { TargetStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { CurrentUser } from '../auth/current-user';
import { articleWhere, groupWhere, postWhere, scopeOf } from '../auth/scope';
import type { PriorityMove } from './dto/queue.dto';
import { startOfLocalDay } from '../insights/insights.service';

/** La nouvelle valeur d'une priorité : un geste (en tête, monter, descendre,
 * remettre à zéro) ou une valeur donnée. */
export function nextPriority(current: number, top: number, move?: PriorityMove, value?: number) {
  if (value !== undefined) return value;
  if (move === 'top') return Math.max(top + 1, current + 1);
  if (move === 'up') return current + 1;
  if (move === 'down') return current - 1;
  return 0;
}

/** Le pilotage fin : quels groupes servir en premier, quels articles pousser.
 *
 * - Groupe : un profil qui cherche du travail commence par le groupe de plus
 *   haute priorité (après un envoi forcé et un groupe libre).
 * - Article : sa priorité est celle de TOUS ses posts encore à publier (et de
 *   ceux créés ensuite) ; dans un groupe, les posts les plus prioritaires
 *   partent d'abord. */
@Injectable()
export class PrioritiesService {
  constructor(private readonly prisma: PrismaService) {}

  async overview(acting: CurrentUser | null) {
    const scope = scopeOf(acting);
    const settingsTz = await this.prisma.automationSetting.findUnique({ where: { id: 'global' }, select: { objectiveTimezone: true } });
    const dayStart = startOfLocalDay(new Date(), settingsTz?.objectiveTimezone || 'Europe/Paris');
    const today = await this.prisma.postTarget.groupBy({
      by: ['groupId'],
      where: { status: TargetStatus.PUBLISHED, publishedAt: { gte: dayStart } },
      _count: { _all: true },
    });
    const publishedToday = new Map(today.map((r) => [r.groupId, r._count._all]));
    const [groups, waiting, settings] = await Promise.all([
      this.prisma.group.findMany({
        where: { status: 'ACTIVE', ...groupWhere(scope) },
        select: { id: true, name: true, url: true, priority: true, dailyCap: true, hoursStart: true, hoursEnd: true, category: { select: { id: true, name: true } } },
        orderBy: [{ priority: 'desc' }, { name: 'asc' }],
      }),
      // Ce qui attend dans la file : par groupe, et par article.
      this.prisma.postTarget.findMany({
        where: { status: TargetStatus.AVAILABLE, post: { status: 'AVAILABLE', ...postWhere(scope) } },
        select: { groupId: true, post: { select: { articleId: true } } },
        take: 50_000,
      }),
      this.prisma.automationSetting.findUnique({ where: { id: 'global' }, select: { rateLimitPauseDays: true } }),
    ]);
    const byGroup = new Map<string, number>();
    const byArticle = new Map<string, number>();
    for (const t of waiting) {
      byGroup.set(t.groupId, (byGroup.get(t.groupId) ?? 0) + 1);
      if (t.post.articleId) byArticle.set(t.post.articleId, (byArticle.get(t.post.articleId) ?? 0) + 1);
    }
    // Les articles qui ont encore des posts à publier, et ceux déjà priorisés.
    const articles = await this.prisma.article.findMany({
      where: { ...articleWhere(scope), OR: [{ id: { in: [...byArticle.keys()] } }, { priority: { not: 0 } }] },
      select: { id: true, title: true, articleUrl: true, coverImageUrl: true, priority: true, publishedAt: true, source: { select: { name: true } } },
      orderBy: [{ priority: 'desc' }, { publishedAt: 'desc' }],
      take: 300,
    });
    return {
      settings: { rateLimitPauseDays: settings?.rateLimitPauseDays ?? 5 },
      groups: groups.map((g) => ({ ...g, waiting: byGroup.get(g.id) ?? 0, publishedToday: publishedToday.get(g.id) ?? 0 })),
      articles: articles.map((a) => ({ ...a, site: a.source.name, source: undefined, waiting: byArticle.get(a.id) ?? 0 })),
    };
  }

  async setGroup(id: string, dto: { move?: PriorityMove; priority?: number }, acting: CurrentUser | null) {
    const scope = scopeOf(acting);
    const group = await this.prisma.group.findFirst({ where: { id, ...groupWhere(scope) }, select: { id: true, name: true, priority: true } });
    if (!group) throw new NotFoundException('Groupe introuvable');
    const top = await this.prisma.group.aggregate({ where: groupWhere(scope), _max: { priority: true } });
    const priority = nextPriority(group.priority, top._max.priority ?? 0, dto.move, dto.priority);
    await this.prisma.group.update({ where: { id }, data: { priority } });
    await this.log('GROUP_PRIORITY', `Priorité du groupe « ${group.name} » : ${priority}`, acting, { groupId: id, priority });
    return { id, priority };
  }

  /** Plafond par jour et heures de publication d'un groupe (null = aucun). */
  async setGroupLimits(
    id: string,
    dto: { dailyCap?: number | null; hoursStart?: number | null; hoursEnd?: number | null },
    acting: CurrentUser | null,
  ) {
    const group = await this.prisma.group.findFirst({ where: { id, ...groupWhere(scopeOf(acting)) }, select: { id: true, name: true } });
    if (!group) throw new NotFoundException('Groupe introuvable');
    // Une plage n'a de sens qu'entière : une seule borne l'efface.
    const hours = dto.hoursStart != null && dto.hoursEnd != null ? { hoursStart: dto.hoursStart, hoursEnd: dto.hoursEnd } : { hoursStart: null, hoursEnd: null };
    const data = { dailyCap: dto.dailyCap ?? null, ...hours };
    await this.prisma.group.update({ where: { id }, data });
    const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
    await this.log(
      'GROUP_LIMITS',
      `Règles du groupe « ${group.name} » : ${data.dailyCap === null ? 'sans plafond' : `${data.dailyCap} post(s)/jour`}, ${data.hoursStart === null ? 'à toute heure' : `de ${hhmm(data.hoursStart)} à ${hhmm(data.hoursEnd!)}`}`,
      acting,
      { groupId: id, ...data },
    );
    return { id, ...data };
  }

  /** La priorité d'un article devient celle de tous ses posts encore à publier. */
  async setArticle(id: string, dto: { move?: PriorityMove; priority?: number }, acting: CurrentUser | null) {
    const scope = scopeOf(acting);
    const article = await this.prisma.article.findFirst({ where: { id, ...articleWhere(scope) }, select: { id: true, title: true, priority: true } });
    if (!article) throw new NotFoundException('Article introuvable');
    const top = await this.prisma.article.aggregate({ where: articleWhere(scope), _max: { priority: true } });
    const priority = nextPriority(article.priority, top._max.priority ?? 0, dto.move, dto.priority);
    const [, posts] = await this.prisma.$transaction([
      this.prisma.article.update({ where: { id }, data: { priority } }),
      this.prisma.post.updateMany({ where: { articleId: id, status: 'AVAILABLE', ...postWhere(scope) }, data: { priority } }),
    ]);
    await this.log('ARTICLE_PRIORITY', `Priorité de l’article « ${article.title} » : ${priority} (${posts.count} post(s))`, acting, { articleId: id, priority, posts: posts.count });
    return { id, priority, posts: posts.count };
  }

  private log(eventType: string, message: string, acting: CurrentUser | null, metadata: Record<string, unknown>) {
    return this.prisma.activityLog.create({
      data: { eventType, message, metadata: { ...metadata, by: acting?.username ?? 'clé globale' } },
    });
  }
}
