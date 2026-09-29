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

/** Ce que la route `dfb/v1/status` du plugin répond, traduit en un état.
 *
 * Le plugin distingue lui-même ses refus (`dfb_no_key`, `dfb_bad_key`…) et
 * y joint sa version : un 401 qui porte un code `dfb_` prouve donc que
 * l'extension est là, et que seule la clé coince. Un 404 `rest_no_route`
 * dit au contraire que la route n'existe pas — extension absente ou
 * désactivée. */
export function classifyPluginResponse(
  status: number,
  body: unknown,
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
      select: { id: true, originUrl: true, depositKey: true },
    });
    const result = await this.probe(
      site.originUrl,
      site.depositKey || this.config.get<string>('WORDPRESS_API_KEY') || '',
    );
    await this.prisma.contentSource.update({
      where: { id: site.id },
      data: {
        pluginState: result.state,
        pluginVersion: result.version,
        pluginMessage: result.message,
        pluginCheckedAt: new Date(),
      },
    });
    return { siteId: site.id, ...result };
  }

  private async probe(originUrl: string, key: string): Promise<PluginCheck> {
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
    return classifyPluginResponse(response.status, body);
  }
}
