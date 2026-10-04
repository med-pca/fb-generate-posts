import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { PrismaService } from '../prisma/prisma.service';
import { WordpressService } from './wordpress.service';
import { WordpressArticleDto } from './wordpress.dto';

const DEFAULT_INTERVAL_MINUTES = 2;
const STARTUP_DELAY_MS = 30_000;
const TIMEOUT_MS = 30_000;

type PendingArticle = { payload: WordpressArticleDto; hash: string; error?: string };

/** La synchronisation tirée par la plateforme.
 *
 * Le plugin envoie ses articles par WP-Cron — qui ne tourne qu'à la visite du
 * site, et que des hébergeurs désactivent — et cet envoi peut aussi être
 * refusé (URL ou clé mal recopiées). Un article publié restait alors sans
 * post, sans que rien ne le dise côté plateforme.
 *
 * Ici, c'est la plateforme qui vient chercher : `GET dfb/v1/pending` (plugin
 * ≥ 1.4.1, protégée par la clé) liste les articles que le site n'a pas réussi
 * à envoyer ; chacun est reçu exactement comme un envoi du plugin, puis
 * acquitté (`POST dfb/v1/ack`) pour que le site cesse de réessayer. Un plugin
 * plus ancien répond 404 : le site est simplement passé. */
@Injectable()
export class WordpressPullService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(WordpressPullService.name);
  private timer?: NodeJS.Timeout;
  private startup?: NodeJS.Timeout;
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly wordpress: WordpressService,
  ) {}

  onModuleInit() {
    const raw = Number(this.config.get<string>('WORDPRESS_PULL_INTERVAL_MINUTES') ?? DEFAULT_INTERVAL_MINUTES);
    const minutes = Number.isFinite(raw) && raw >= 0 ? raw : DEFAULT_INTERVAL_MINUTES;
    if (!minutes) return;
    this.startup = setTimeout(() => void this.pullAll(), STARTUP_DELAY_MS);
    this.timer = setInterval(() => void this.pullAll(), minutes * 60_000);
    this.startup.unref?.();
    this.timer.unref?.();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
    if (this.startup) clearTimeout(this.startup);
  }

  /** Tous les sites actifs, un à la fois. */
  async pullAll() {
    if (this.running) return [];
    this.running = true;
    try {
      const sites = await this.prisma.contentSource.findMany({
        where: { status: 'ACTIVE' },
        select: { id: true, name: true, originUrl: true, depositKey: true },
      });
      const results = [];
      for (const site of sites) {
        results.push(await this.pullSite(site).catch((error: Error) => ({ site: site.name, received: 0, error: error.message })));
      }
      return results;
    } finally {
      this.running = false;
    }
  }

  async pullSite(site: { id: string; name: string; originUrl: string; depositKey: string | null }) {
    const key = site.depositKey || this.config.get<string>('WORDPRESS_API_KEY') || '';
    if (!key) return { site: site.name, received: 0, skipped: 'aucune clé' };
    const response = await fetch(`${site.originUrl}/wp-json/dfb/v1/pending`, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { accept: 'application/json', 'x-api-key': key },
    });
    // Plugin plus ancien que 1.4.1 : pas de route, rien à tirer.
    if (response.status === 404) return { site: site.name, received: 0, skipped: 'plugin < 1.4.1' };
    if (!response.ok) throw new Error(`HTTP ${response.status} sur dfb/v1/pending`);
    const body = (await response.json().catch(() => null)) as { articles?: PendingArticle[] } | null;
    const articles = Array.isArray(body?.articles) ? body!.articles : [];
    if (!articles.length) return { site: site.name, received: 0 };

    const acked: Array<{ postId: string; hash: string }> = [];
    const titles: string[] = [];
    const reasons = new Set<string>();
    for (const article of articles) {
      if (article.error) reasons.add(article.error);
      try {
        // Les mêmes règles qu'un envoi reçu sur POST /wordpress/articles.
        const dto = plainToInstance(WordpressArticleDto, article.payload);
        const problems = await validate(dto, { whitelist: true });
        if (problems.length) {
          throw new Error(`article invalide (${problems.map((p) => p.property).join(', ')})`);
        }
        await this.wordpress.publish(dto);
        acked.push({ postId: String(article.payload.postId), hash: article.hash });
        titles.push(article.payload.title);
      } catch (error) {
        this.logger.warn(`${site.name} : « ${article.payload?.title} » non reçu — ${(error as Error).message}`);
      }
    }
    if (acked.length) {
      await fetch(`${site.originUrl}/wp-json/dfb/v1/ack`, {
        method: 'POST',
        signal: AbortSignal.timeout(TIMEOUT_MS),
        headers: { 'content-type': 'application/json', 'x-api-key': key },
        body: JSON.stringify({ articles: acked }),
      }).catch(() => undefined);
      const why = reasons.size ? ` Le site ne les envoyait pas : ${[...reasons].join(' ; ')}` : '';
      await this.prisma.activityLog.create({
        data: {
          eventType: 'WORDPRESS_PULLED',
          level: 'WARN',
          message:
            `${acked.length} article(s) récupéré(s) sur ${site.name} par la plateforme : ` +
            `${titles.slice(0, 3).map((t) => `« ${t} »`).join(', ')}${titles.length > 3 ? '…' : ''}.${why}`,
          metadata: { siteId: site.id, postIds: acked.map((a) => a.postId), reasons: [...reasons] },
        },
      });
    }
    return { site: site.name, received: acked.length, failed: articles.length - acked.length };
  }
}
