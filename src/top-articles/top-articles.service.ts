import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { CurrentUser } from '../auth/current-user';
import { OTHERS_COOLDOWN_DAYS, distribute, type RadarArticle } from './distribute';

const TIMEZONE = 'Europe/Paris';
/** Combien d'articles du top Radar on considère (les meilleurs d'abord). */
const POOL_SIZE = 500;

/** Le « Top 10 articles » : les articles concurrents les plus vus sur 7 jours
 * (Histats Radar), 10 par gestionnaire et par jour, pour s'inspirer. */
@Injectable()
export class TopArticlesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  /** Le jour à Paris, AAAA-MM-JJ : la liste change à minuit, heure de Paris. */
  today(now = new Date()) {
    return new Intl.DateTimeFormat('en-CA', { timeZone: TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  }

  /** Un gestionnaire : SA liste du jour. Un admin : celles de tous. */
  async list(acting: CurrentUser | null, day = this.today()) {
    const error = await this.ensure(day).then(
      () => null,
      (e: unknown) => (e instanceof Error ? e.message : String(e)),
    );
    const admin = !acting || acting.role === Role.ADMIN;
    const picks = await this.prisma.topArticlePick.findMany({
      where: { day, ...(admin ? {} : { userId: acting.id }) },
      orderBy: [{ userId: 'asc' }, { rank: 'asc' }],
      include: { user: { select: { id: true, username: true } } },
    });
    const byUser = new Map<string, { user: { id: string; username: string }; items: typeof picks }>();
    for (const p of picks) {
      if (!byUser.has(p.userId)) byUser.set(p.userId, { user: p.user, items: [] });
      byUser.get(p.userId)!.items.push(p);
    }
    return {
      day,
      admin,
      error,
      lists: [...byUser.values()].map(({ user, items }) => ({
        user,
        items: items.map((p) => ({ rank: p.rank, url: p.url, title: p.title, image: p.image, domain: p.domain, views: p.views, viral: p.viral })),
      })),
    };
  }

  /** Admin : refaire la distribution du jour (après avoir ajouté des
   * concurrents dans Radar, par exemple). */
  async regenerate(day = this.today()) {
    await this.prisma.topArticlePick.deleteMany({ where: { day } });
    await this.ensure(day);
    return this.list(null, day);
  }

  /** Chaque gestionnaire actif a sa liste du jour : ceux qui n'en ont pas
   * encore la reçoivent, sans toucher aux listes déjà données. */
  private async ensure(day: string) {
    const managers = await this.prisma.user.findMany({
      where: { role: Role.MANAGER, status: 'ACTIVE' },
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    });
    const served = new Set((await this.prisma.topArticlePick.findMany({ where: { day }, distinct: ['userId'], select: { userId: true } })).map((p) => p.userId));
    if (managers.every((m) => served.has(m.id))) return;
    const pool = await this.fetchTop();
    await this.prisma.$transaction(async (tx) => {
      // Deux pages ouvertes en même temps ne distribuent pas deux fois.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('top_article_picks'))`;
      const today = await tx.topArticlePick.findMany({ where: { day }, select: { userId: true, url: true } });
      const done = new Set(today.map((p) => p.userId));
      const missing = managers.map((m) => m.id).filter((id) => !done.has(id));
      if (!missing.length) return;
      const since = new Date(`${day}T00:00:00Z`);
      since.setUTCDate(since.getUTCDate() - OTHERS_COOLDOWN_DAYS - 1);
      const past = await tx.topArticlePick.findMany({
        where: { day: { lt: day }, OR: [{ userId: { in: missing } }, { createdAt: { gte: since } }] },
        select: { userId: true, url: true, day: true },
      });
      const out = distribute(pool, missing, past, day, new Set(today.map((p) => p.url)));
      await tx.topArticlePick.createMany({
        data: [...out].flatMap(([userId, items]) =>
          items.map((a, i) => ({ day, userId, rank: i + 1, url: a.url, title: a.title, image: a.image, domain: a.domain, views: a.views, viral: a.viral })),
        ),
        skipDuplicates: true,
      });
    });
  }

  private async fetchTop(): Promise<RadarArticle[]> {
    const base = (this.config.get<string>('RADAR_API_URL') || 'https://radar.pulserecipe.com').replace(/\/+$/, '');
    const key = this.config.get<string>('RADAR_API_KEY');
    if (!key) throw new ServiceUnavailableException('Radar non relié : RADAR_API_KEY manquante dans la configuration du serveur');
    const res = await fetch(`${base}/api/feed/top?days=7&limit=${POOL_SIZE}`, {
      headers: { 'x-api-key': key },
      signal: AbortSignal.timeout(60_000),
    }).catch((e: unknown) => {
      throw new ServiceUnavailableException(`Radar injoignable (${base}) : ${e instanceof Error ? e.message : e}`);
    });
    if (!res.ok) throw new ServiceUnavailableException(`Radar a répondu ${res.status}${res.status === 401 ? ' : clé RADAR_API_KEY refusée' : ''}`);
    const body = (await res.json()) as { items?: Array<Partial<RadarArticle>> };
    return (body.items ?? [])
      .filter((a): a is RadarArticle => typeof a.url === 'string' && Boolean(a.url))
      .map((a) => ({ url: a.url, title: a.title || a.url, image: a.image ?? null, domain: a.domain || new URL(a.url).host, views: Number(a.views) || 0, viral: Boolean(a.viral) }));
  }
}
