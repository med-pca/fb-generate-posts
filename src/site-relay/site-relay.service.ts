import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ContentSource } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { CurrentUser } from '../auth/current-user';
import { scopeOf, siteManageWhere } from '../auth/scope';
import { WordpressService } from '../wordpress/wordpress.service';
import { WordpressWriterService } from '../ingest/wordpress-writer.service';
import type { WordpressArticleDto } from '../wordpress/wordpress.dto';

const TIMEOUT_MS = 60_000;
/** Les routes d'export, de redirection et le marqueur de copie. */
export const RELAY_PLUGIN_VERSION = '1.6.0';

/** Comparer deux versions « 1.6.0 ». */
export function versionAtLeast(version: string | null | undefined, wanted: string) {
  const parts = (v: string) => v.split('.').map((n) => Number.parseInt(n, 10) || 0);
  const [a, b] = [parts(version || '0'), parts(wanted)];
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if ((a[i] ?? 0) !== (b[i] ?? 0)) return (a[i] ?? 0) > (b[i] ?? 0);
  }
  return true;
}

type Site = Pick<ContentSource, 'id' | 'name' | 'originUrl' | 'depositKey' | 'status' | 'pausedAt' | 'relayId'>;
type PluginStatus = { version?: string; permalinkStructure?: string; redirect?: string | null };

/** ⏸ Le site en pause et son relais.
 *
 * Un site limité (publicité…) est mis en pause à la main : ses posts ne
 * partent plus. Un autre site, choisi à la main, prend le relais : ses
 * articles y sont copiés par le plugin, avec le MÊME slug, et leurs posts en
 * attente y sont déplacés (nouveau lien) — le travail continue. Les posts
 * déjà publiés ne changent pas : le site en pause redirige ses visiteurs vers
 * le relais, au même chemin (302 : la pause est temporaire). À la
 * réactivation, à la main, la redirection est retirée. */
@Injectable()
export class SiteRelayService {
  private readonly logger = new Logger(SiteRelayService.name);
  /** Les copies en cours, une seule fois par site à la fois. */
  private readonly running = new Set<string>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly wordpress: WordpressService,
    @Optional() private readonly writer?: WordpressWriterService,
  ) {}

  /* ── Les gestes ──────────────────────────────────────────────────────── */

  /** Mettre en pause, et choisir (ou non) le site qui prend le relais. */
  async pause(id: string, dto: { reason?: string; relaySiteId?: string | null }, acting: CurrentUser | null) {
    const site = await this.manageable(id, acting);
    if (site.pausedAt) throw new ConflictException(`${site.name} est déjà en pause`);
    let relay: Site | null = null;
    const warnings: string[] = [];
    if (dto.relaySiteId) {
      relay = await this.manageable(dto.relaySiteId, acting);
      if (relay.id === site.id) throw new BadRequestException('Un site ne peut pas se relayer lui-même');
      if (relay.status !== 'ACTIVE' || relay.pausedAt) {
        throw new BadRequestException(`${relay.name} n’est pas actif : choisissez un site qui publie`);
      }
      // Les deux plugins doivent savoir copier (1.6.0) ; la même structure de
      // liens, sans quoi le chemin redirigé n'existe pas sur le relais.
      const [from, to] = await Promise.all([this.pluginStatus(site), this.pluginStatus(relay)]);
      for (const [s, status] of [[site, from], [relay, to]] as const) {
        if (!versionAtLeast(status.version, RELAY_PLUGIN_VERSION)) {
          throw new BadRequestException(
            `Le plugin de ${s.name} est en version ${status.version || 'inconnue'} : installez la ${RELAY_PLUGIN_VERSION} (page Sites) sur les deux sites`,
          );
        }
      }
      if ((from.permalinkStructure ?? '') !== (to.permalinkStructure ?? '')) {
        warnings.push(
          `Structure des liens différente (${from.permalinkStructure || 'par défaut'} sur ${site.name}, ` +
            `${to.permalinkStructure || 'par défaut'} sur ${relay.name}) : alignez-les dans Réglages → Permaliens, ` +
            'sinon les anciens liens redirigés ne trouveront pas leur article.',
        );
      }
    }
    const reason = dto.reason?.trim() || 'limite';
    await this.prisma.$transaction([
      this.prisma.contentSource.update({
        where: { id: site.id },
        data: { pausedAt: new Date(), pauseReason: reason, relayId: relay?.id ?? null, redirectError: null },
      }),
      this.prisma.activityLog.create({
        data: {
          eventType: 'SITE_PAUSED',
          level: 'WARN',
          message: `⏸ ${site.name} en pause (${reason})` + (relay ? ` : ${relay.name} prend le relais` : ' : ses posts attendent la réactivation'),
          metadata: { siteId: site.id, relayId: relay?.id ?? null, by: by(acting) },
        },
      }),
    ]);
    let copies = 0;
    if (relay) {
      copies = await this.plan(site, relay);
      this.start(site.id);
    }
    return { ...(await this.detail(site.id, acting)), copies, warnings };
  }

  /** Fin de la limite : le site repart, sa redirection est retirée. Les posts
   * déjà déplacés restent sur le relais (pas de doublon) ; ceux qui n'ont pas
   * pu l'être repartent d'ici. */
  async resume(id: string, acting: CurrentUser | null) {
    const site = await this.manageable(id, acting);
    if (!site.pausedAt) throw new ConflictException(`${site.name} n’est pas en pause`);
    let redirectError: string | null = null;
    try {
      await this.setRedirect(site, null);
    } catch (error) {
      redirectError = `Redirection non retirée : ${message(error)} — retirez-la avec « Réactiver » à nouveau ou dans le plugin`;
    }
    await this.prisma.$transaction([
      this.prisma.articleCopy.updateMany({
        where: { status: 'pending', sourceArticle: { sourceId: site.id } },
        data: { status: 'cancelled', error: 'site réactivé avant la copie' },
      }),
      this.prisma.contentSource.update({
        where: { id: site.id },
        data: {
          pausedAt: null,
          pauseReason: null,
          relayId: null,
          ...(redirectError ? { redirectError } : { redirectSince: null, redirectError: null }),
        },
      }),
      this.prisma.activityLog.create({
        data: {
          eventType: 'SITE_RESUMED',
          message: `▶ ${site.name} réactivé` + (redirectError ? ` — ${redirectError}` : ' : redirection retirée'),
          metadata: { siteId: site.id, by: by(acting) },
        },
      }),
    ]);
    return { ...(await this.detail(site.id, acting)), warnings: redirectError ? [redirectError] : [] };
  }

  /** Relancer les copies en erreur. */
  async retry(id: string, acting: CurrentUser | null) {
    const site = await this.pausedWithRelay(id, acting);
    await this.prisma.articleCopy.updateMany({
      where: { status: 'failed', targetSiteId: site.relayId!, sourceArticle: { sourceId: site.id } },
      data: { status: 'pending', error: null },
    });
    this.start(site.id);
    return this.detail(site.id, acting);
  }

  /** Poser la redirection sans attendre la fin des copies (ou après un
   * échec réseau). */
  async redirectNow(id: string, acting: CurrentUser | null) {
    const site = await this.pausedWithRelay(id, acting);
    const relay = await this.prisma.contentSource.findUniqueOrThrow({ where: { id: site.relayId! } });
    await this.redirectTo(site, relay);
    return this.detail(site.id, acting);
  }

  /** Où en est la pause : relais, copies, redirection. */
  async detail(id: string, acting: CurrentUser | null) {
    const site = await this.manageable(id, acting);
    const full = await this.prisma.contentSource.findUniqueOrThrow({
      where: { id: site.id },
      select: {
        pausedAt: true,
        pauseReason: true,
        redirectSince: true,
        redirectError: true,
        relay: { select: { id: true, name: true, originUrl: true } },
      },
    });
    const rows = full.relay
      ? await this.prisma.articleCopy.findMany({
          where: { targetSiteId: full.relay.id, sourceArticle: { sourceId: site.id } },
          select: { status: true, movedPosts: true, error: true, permalink: true, sourceArticle: { select: { title: true } } },
          orderBy: { updatedAt: 'desc' },
        })
      : [];
    const count = (status: string) => rows.filter((r) => r.status === status).length;
    return {
      siteId: site.id,
      name: site.name,
      pausedAt: full.pausedAt,
      reason: full.pauseReason,
      relay: full.relay,
      redirect: { since: full.redirectSince, error: full.redirectError, target: full.relay?.originUrl ?? null },
      running: this.running.has(site.id),
      copies: {
        total: rows.length,
        pending: count('pending'),
        done: count('done'),
        failed: count('failed'),
        skipped: count('skipped'),
        movedPosts: rows.reduce((n, r) => n + r.movedPosts, 0),
      },
      errors: rows
        .filter((r) => r.status === 'failed' || r.status === 'skipped')
        .slice(0, 20)
        .map((r) => ({ title: r.sourceArticle.title, status: r.status, error: r.error })),
    };
  }

  /* ── La copie ────────────────────────────────────────────────────────── */

  /** Une copie par article qui a des posts (publiés ou non) : avec une
   * redirection de tout le site, un article publié absent du relais
   * donnerait une page introuvable. */
  private async plan(site: Site, relay: Site) {
    const articles = await this.prisma.article.findMany({
      where: { sourceId: site.id, posts: { some: {} } },
      select: { id: true, externalId: true },
    });
    let planned = 0;
    for (const a of articles) {
      const wordpress = a.externalId.startsWith('wordpress:');
      await this.prisma.articleCopy.upsert({
        where: { sourceArticleId_targetSiteId: { sourceArticleId: a.id, targetSiteId: relay.id } },
        create: {
          sourceArticleId: a.id,
          targetSiteId: relay.id,
          status: wordpress ? 'pending' : 'skipped',
          error: wordpress ? null : 'pas un article WordPress : rien à copier',
        },
        // Une copie déjà faite vers ce relais (pause précédente) reste faite.
        update: {},
      });
      if (wordpress) planned += 1;
    }
    return planned;
  }

  private start(siteId: string) {
    if (this.running.has(siteId)) return;
    this.running.add(siteId);
    void this.process(siteId)
      .catch((error) => this.logger.error(`Relais de ${siteId} : ${message(error)}`))
      .finally(() => this.running.delete(siteId));
  }

  /** Les copies une à une, puis la redirection quand toutes ont réussi. */
  async process(siteId: string) {
    const site = await this.prisma.contentSource.findUniqueOrThrow({ where: { id: siteId } });
    if (!site.pausedAt || !site.relayId) return;
    const relay = await this.prisma.contentSource.findUniqueOrThrow({ where: { id: site.relayId } });
    for (;;) {
      const copy = await this.prisma.articleCopy.findFirst({
        where: { status: 'pending', targetSiteId: relay.id, sourceArticle: { sourceId: site.id } },
        include: { sourceArticle: { select: { id: true, title: true, externalId: true } } },
        orderBy: { createdAt: 'asc' },
      });
      if (!copy) break;
      // Réactivé entre-temps : on s'arrête.
      const still = await this.prisma.contentSource.findUnique({ where: { id: site.id }, select: { pausedAt: true } });
      if (!still?.pausedAt) return;
      try {
        await this.copyOne(copy, site, relay);
      } catch (error) {
        await this.prisma.articleCopy.update({ where: { id: copy.id }, data: { status: 'failed', error: message(error).slice(0, 1000) } });
        this.logger.warn(`Copie de « ${copy.sourceArticle.title} » vers ${relay.name} : ${message(error)}`);
      }
    }
    const failed = await this.prisma.articleCopy.count({
      where: { status: 'failed', targetSiteId: relay.id, sourceArticle: { sourceId: site.id } },
    });
    if (failed) {
      await this.prisma.contentSource.update({
        where: { id: site.id },
        data: { redirectError: `${failed} copie(s) en erreur : redirection pas encore posée (« Réessayer », ou « Rediriger maintenant »)` },
      });
      return;
    }
    await this.redirectTo(site, relay).catch(() => undefined);
  }

  /** Exporter l'article complet du site en pause, le déposer sur le relais
   * (même slug, sans doublon), puis le recevoir avec sa référence de copie :
   * ses posts en attente y passent (WordpressService). */
  private async copyOne(
    copy: { id: string; sourceArticle: { externalId: string } },
    site: Site,
    relay: Site,
  ) {
    const wpId = copy.sourceArticle.externalId.slice('wordpress:'.length);
    const exported = await this.call<{
      slug: string;
      title: string;
      excerpt?: string;
      contentHtml: string;
      imageUrl?: string | null;
    }>(site, 'GET', `/export/${encodeURIComponent(wpId)}`);
    const image = exported.imageUrl && this.writer ? await this.writer.loadImage(exported.imageUrl).catch(() => null) : null;
    const deposit = await this.call<{ postId: string; permalink: string; existing?: boolean }>(relay, 'POST', '/articles', {
      title: exported.title,
      slug: exported.slug,
      excerpt: exported.excerpt ?? '',
      contentHtml: exported.contentHtml,
      image,
      keepExisting: true,
      copyRef: copy.id,
    });
    if (!deposit.postId || !deposit.permalink) throw new BadGatewayException('Réponse du relais incomplète');
    await this.prisma.articleCopy.update({
      where: { id: copy.id },
      data: { slug: exported.slug, wpPostId: String(deposit.postId), permalink: deposit.permalink },
    });
    if (!this.writer) throw new BadGatewayException('Relecture WordPress indisponible');
    // Sans attendre que le plugin du relais le renvoie (WP-Cron) : le relire
    // et le recevoir tout de suite. Le renvoi du plugin, s'il arrive ensuite,
    // ne change rien (même article, copie déjà faite).
    const pulled = await this.writer.fetchArticle({
      siteUrl: relay.originUrl,
      siteName: relay.name,
      apiKey: relay.depositKey,
      postId: String(deposit.postId),
    });
    await this.wordpress.publish({ ...pulled, copyRef: copy.id } as WordpressArticleDto);
    const done = await this.prisma.articleCopy.findUnique({ where: { id: copy.id }, select: { status: true } });
    if (done?.status !== 'done') {
      throw new BadGatewayException('Article créé sur le relais, mais pas encore rattaché : réessayer');
    }
  }

  /* ── La redirection ─────────────────────────────────────────────────── */

  private async redirectTo(site: Site, relay: Site) {
    try {
      await this.setRedirect(site, relay.originUrl);
      await this.prisma.$transaction([
        this.prisma.contentSource.update({ where: { id: site.id }, data: { redirectSince: new Date(), redirectError: null } }),
        this.prisma.activityLog.create({
          data: {
            eventType: 'SITE_REDIRECTED',
            message: `↪ ${site.name} redirige ses visiteurs vers ${relay.name} (même chemin, 302)`,
            metadata: { siteId: site.id, relayId: relay.id },
          },
        }),
      ]);
    } catch (error) {
      await this.prisma.contentSource.update({
        where: { id: site.id },
        data: { redirectError: `Redirection non posée : ${message(error)}` },
      });
      throw error;
    }
  }

  private setRedirect(site: Site, target: string | null) {
    return this.call(site, 'POST', '/redirect', { target });
  }

  /* ── Le plugin ───────────────────────────────────────────────────────── */

  private async pluginStatus(site: Site): Promise<PluginStatus> {
    try {
      return await this.call<PluginStatus>(site, 'GET', '/status');
    } catch (error) {
      throw new BadRequestException(`Le plugin de ${site.name} ne répond pas : ${message(error)}`);
    }
  }

  /** Une route `dfb/v1` du plugin d'un site, avec SA clé (ou la clé globale
   * pour un site d'avant). */
  private async call<T = unknown>(site: Site, method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
    const key = site.depositKey || this.config.get<string>('WORDPRESS_API_KEY') || '';
    const url = `${site.originUrl}/wp-json/dfb/v1${path}`;
    let response: Response;
    try {
      response = await fetch(url, {
        method,
        signal: AbortSignal.timeout(TIMEOUT_MS),
        headers: { accept: 'application/json', 'x-api-key': key, ...(body !== undefined ? { 'content-type': 'application/json' } : {}) },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      });
    } catch {
      throw new BadGatewayException(`${site.name} injoignable (${url})`);
    }
    const text = await response.text();
    if (response.status === 404 && /rest_no_route/.test(text)) {
      throw new BadGatewayException(`le plugin de ${site.name} est trop ancien : installez la ${RELAY_PLUGIN_VERSION}`);
    }
    if (!response.ok) {
      throw new BadGatewayException(`${site.name} a répondu HTTP ${response.status} : ${text.slice(0, 200)}`);
    }
    try {
      return JSON.parse(text) as T;
    } catch {
      throw new BadGatewayException(`${site.name} n’a pas répondu en JSON`);
    }
  }

  /* ── Les droits ──────────────────────────────────────────────────────── */

  /** Le propriétaire du site, ou un ADMIN : un site partagé prête son usage,
   * pas sa gestion. */
  private async manageable(id: string, acting: CurrentUser | null): Promise<Site> {
    const site = await this.prisma.contentSource.findFirst({
      where: { id, ...siteManageWhere(scopeOf(acting)) },
      select: { id: true, name: true, originUrl: true, depositKey: true, status: true, pausedAt: true, relayId: true },
    });
    if (!site) throw new NotFoundException('Site introuvable');
    return site;
  }

  private async pausedWithRelay(id: string, acting: CurrentUser | null) {
    const site = await this.manageable(id, acting);
    if (!site.pausedAt || !site.relayId) throw new ConflictException(`${site.name} n’est pas en pause avec un relais`);
    return site;
  }
}

const by = (acting: CurrentUser | null) => acting?.username ?? 'clé globale';
const message = (error: unknown) => (error instanceof Error ? error.message : String(error));
