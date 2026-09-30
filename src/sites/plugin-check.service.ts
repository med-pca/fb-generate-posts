import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PluginState } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { assertSafeRemoteUrl } from '../common/safe-fetch';

const TIMEOUT_MS = 10_000;
const DEFAULT_INTERVAL_MINUTES = 360;
const STARTUP_DELAY_MS = 60_000;

export type PluginCheck = {
  state: PluginState;
  version: string | null;
  message: string;
};

const OUTDATED_MESSAGE =
  'Ancienne extension : elle envoie ses articles, mais ne se laisse pas ' +
  'vérifier et ne reçoit pas les reprises. Installer la version 1.3.0.';

/** Ce que la route `dfb/v1/status` du plugin répond, traduit en un état.
 *
 * Le plugin distingue lui-même ses refus (`dfb_no_key`, `dfb_bad_key`…) et
 * y joint sa version : un 401 qui porte un code `dfb_` prouve donc que
 * l'extension est là, et que seule la clé coince. Un 404 `rest_no_route`
 * dit au contraire que la route n'existe pas — extension absente ou
 * désactivée — sauf si le site nous envoie ses articles : c'est alors une
 * extension antérieure à 1.2.2, qui n'avait pas encore ses routes. */
export function classifyPluginResponse(
  status: number,
  body: unknown,
  delivers = false,
): PluginCheck {
  const json = (body && typeof body === 'object' ? body : {}) as {
    plugin?: string;
    version?: string;
    endpointConfigured?: boolean;
    code?: string;
    message?: string;
    data?: { version?: string };
  };
  if (status >= 200 && status < 300 && json.plugin === 'data-fb-posting') {
    return {
      state: PluginState.CONNECTED,
      version: json.version ?? null,
      message: json.endpointConfigured
        ? 'Extension active, clé acceptée'
        : 'Extension active, mais l’URL de l’API n’est pas renseignée dans ses réglages : ' +
          'elle ne nous enverra pas ses articles',
    };
  }
  if (typeof json.code === 'string' && json.code.startsWith('dfb_')) {
    return {
      state: PluginState.BAD_KEY,
      version: json.data?.version ?? null,
      message: json.message || 'L’extension refuse la clé',
    };
  }
  if (delivers && status === 404) {
    return {
      state: PluginState.OUTDATED,
      version: null,
      message: OUTDATED_MESSAGE,
    };
  }
  return {
    state: PluginState.MISSING,
    version: null,
    message:
      status === 404
        ? 'Extension Data FB Posting absente ou désactivée'
        : `Réponse inattendue (HTTP ${status}) : extension absente ou bloquée`,
  };
}

/** Quels sites ont l'extension de synchronisation, et lesquels non.
 *
 * Vérifié depuis le serveur, sans rien publier : la route de statut ne fait
 * que répondre. Un passage périodique garde l'état à jour ; un site qui nous
 * envoie un article est de toute façon marqué connecté à la réception. */
@Injectable()
export class PluginCheckService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PluginCheckService.name);
  private timer?: NodeJS.Timeout;
  private startup?: NodeJS.Timeout;
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  onModuleInit() {
    const raw = Number(
      this.config.get<string>('SITE_CHECK_INTERVAL_MINUTES') ??
        DEFAULT_INTERVAL_MINUTES,
    );
    const minutes =
      Number.isFinite(raw) && raw >= 0 ? raw : DEFAULT_INTERVAL_MINUTES;
    if (!minutes) return;
    this.startup = setTimeout(() => void this.checkAll(), STARTUP_DELAY_MS);
    this.timer = setInterval(() => void this.checkAll(), minutes * 60_000);
    this.timer.unref?.();
    this.startup.unref?.();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
    if (this.startup) clearTimeout(this.startup);
  }

  /** Tous les sites actifs, ou ceux qu'on lui donne. Un site à la fois : pas
   * de rafale vers des hébergements mutualisés. */
  async checkAll(ids?: string[]) {
    if (this.running) return [];
    this.running = true;
    try {
      const sites = await this.prisma.contentSource.findMany({
        where: ids ? { id: { in: ids } } : { status: 'ACTIVE' },
        select: { id: true },
      });
      const results = [];
      for (const { id } of sites) results.push(await this.check(id));
      return results;
    } catch (error) {
      this.logger.error(
        `Vérification des sites en échec : ${error instanceof Error ? error.message : error}`,
      );
      return [];
    } finally {
      this.running = false;
    }
  }

  async check(siteId: string) {
    const site = await this.prisma.contentSource.findUniqueOrThrow({
      where: { id: siteId },
      select: {
        id: true,
        name: true,
        originUrl: true,
        depositKey: true,
        lastDeliveryAt: true,
        pluginState: true,
        articles: {
          select: { importedAt: true },
          orderBy: { importedAt: 'desc' },
          take: 1,
        },
      },
    });
    // Un site qui nous a déjà envoyé un article a forcément l'extension, même
    // si sa route de statut ne répond pas.
    const lastDeliveryAt =
      site.lastDeliveryAt ?? site.articles[0]?.importedAt ?? null;
    const result = await this.probe(
      site.originUrl,
      site.depositKey || this.config.get<string>('WORDPRESS_API_KEY') || '',
      Boolean(lastDeliveryAt),
    );
    await this.prisma.contentSource.update({
      where: { id: site.id },
      data: {
        lastDeliveryAt,
        pluginState: result.state,
        pluginVersion: result.version,
        pluginMessage: result.message,
        pluginCheckedAt: new Date(),
      },
    });
    // Seul un changement d'état est tracé : une vérification toutes les six
    // heures qui redit « connectée » ne serait que du bruit.
    if (site.pluginState !== result.state) {
      await this.prisma.activityLog
        .create({
          data: {
            eventType: 'SITE_PLUGIN_CHANGED',
            level: result.state === PluginState.CONNECTED ? 'INFO' : 'WARN',
            message: `${site.name} : extension ${site.pluginState} → ${result.state} — ${result.message}`,
            metadata: {
              siteId: site.id,
              siteUrl: site.originUrl,
              from: site.pluginState,
              to: result.state,
              version: result.version,
            },
          },
        })
        .catch(() => undefined);
    }
    return { siteId: site.id, ...result };
  }

  private async probe(
    originUrl: string,
    key: string,
    delivers: boolean,
  ): Promise<PluginCheck> {
    const endpoint = `${originUrl}/wp-json/dfb/v1/status`;
    let response: Response;
    try {
      await assertSafeRemoteUrl(endpoint);
      response = await fetch(endpoint, {
        signal: AbortSignal.timeout(TIMEOUT_MS),
        redirect: 'manual',
        headers: key ? { 'x-api-key': key } : {},
      });
    } catch (error) {
      return {
        state: PluginState.UNREACHABLE,
        version: null,
        message: `Site injoignable : ${error instanceof Error ? error.message : error}`,
      };
    }
    let body: unknown = null;
    try {
      body = await response.json();
    } catch {
      body = null;
    }
    return classifyPluginResponse(response.status, body, delivers);
  }
}
