import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  Optional,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { FastifyRequest } from 'fastify';
import { PrismaService } from '../prisma/prisma.service';
import { SIGNATURE_HEADERS, verifySignature } from './site-key';
import { SiteKeysService } from './site-keys.service';

const digest = (value: string) =>
  createHmac('sha256', 'wordpress').update(value).digest();
const same = (a: string, b: string) =>
  Boolean(a && b) && timingSafeEqual(digest(a), digest(b));

/** Le site authentifié, posé sur la requête par le garde. */
export type AuthenticatedSite = {
  id: string;
  originUrl: string;
  signed: boolean;
};
export type WordpressRequest = FastifyRequest & {
  rawBody?: Buffer;
  dfbSite?: AuthenticatedSite;
};

function originOf(raw: unknown) {
  try {
    const url = new URL(typeof raw === 'string' ? raw : '');
    return url.origin + url.pathname.replace(/\/+$/, '');
  } catch {
    return '';
  }
}

/**
 * Qui envoie un article WordPress.
 *
 * Plugin 2.x : requête signée avec la clé du site (en-têtes `x-dfb-*`). Le
 * site est désigné par la clé elle-même, jamais par le corps : le `siteUrl`
 * envoyé doit être celui du site de la clé, sans quoi l'envoi est refusé.
 * Chaque signature ne sert qu'une fois.
 *
 * Plugin 1.x (transition, tant que WORDPRESS_LEGACY_KEYS ≠ false) : la clé en
 * clair dans `x-api-key`, celle du site ou la globale. Un site passé en 2.x
 * n'accepte plus ce mode, et la clé globale ne vaut plus pour un site qui a
 * sa propre clé — elle permettait d'écrire au nom de n'importe quel site.
 */
@Injectable()
export class WordpressGuard implements CanActivate {
  private readonly keys: SiteKeysService;

  constructor(
    private readonly config: ConfigService,
    @Optional() private readonly prisma?: PrismaService,
    @Optional() keys?: SiteKeysService,
  ) {
    this.keys = keys ?? new SiteKeysService(config, prisma);
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<WordpressRequest>();
    if (request.headers[SIGNATURE_HEADERS.signature]) {
      request.dfbSite = await this.signed(request);
      return true;
    }
    return this.legacy(request);
  }

  private async signed(request: WordpressRequest): Promise<AuthenticatedSite> {
    const header = (name: string) => String(request.headers[name] ?? '');
    const siteId = header(SIGNATURE_HEADERS.site);
    const refuse = (message: string) => new UnauthorizedException(message);
    if (!this.prisma || !/^[a-z0-9]{8,40}$/.test(siteId))
      throw refuse('Signature WordPress invalide');
    const site = await this.prisma.contentSource.findUnique({
      where: { id: siteId },
      select: { id: true, originUrl: true, depositKey: true },
    });
    const key = this.keys.parsed(site?.depositKey);
    if (!site || !key || key.siteId !== site.id)
      throw refuse('Clé de site inconnue ou révoquée');

    const method = String(request.method || 'POST');
    const body = request.rawBody ?? (method === 'GET' ? '' : null);
    if (body === null)
      throw refuse('Corps brut indisponible : signature invérifiable');
    const check = verifySignature(key, {
      timestamp: header(SIGNATURE_HEADERS.timestamp),
      nonce: header(SIGNATURE_HEADERS.nonce),
      signature: header(SIGNATURE_HEADERS.signature),
      method,
      body,
    });
    if (!check.ok) {
      throw refuse(
        check.reason === 'expired'
          ? 'Signature expirée : vérifier l’heure du serveur WordPress'
          : 'Signature WordPress invalide',
      );
    }
    if (!this.keys.nonces.remember(site.id, header(SIGNATURE_HEADERS.nonce))) {
      throw refuse('Requête déjà reçue (rejeu refusé)');
    }
    const claimed = originOf(
      (request.body as { siteUrl?: unknown } | undefined)?.siteUrl,
    );
    if (claimed && claimed !== site.originUrl) {
      throw new ForbiddenException(
        `Cette clé appartient à ${site.originUrl}, pas à ${claimed}. Régénérer une clé pour ce site.`,
      );
    }
    return { id: site.id, originUrl: site.originUrl, signed: true };
  }

  private async legacy(request: WordpressRequest): Promise<boolean> {
    const provided = String(request.headers['x-api-key'] || '');
    if (!provided) throw new UnauthorizedException('Clé WordPress invalide');
    if (!this.keys.legacyAllowed()) {
      throw new UnauthorizedException(
        'Extension WordPress 2.x requise (requêtes signées)',
      );
    }
    const global = this.keys.globalKey();
    if (!global && !this.prisma)
      throw new ServiceUnavailableException(
        'WORDPRESS_API_KEY doit être configuré',
      );

    const origin = originOf(
      (request.body as { siteUrl?: unknown } | undefined)?.siteUrl,
    );
    const site =
      origin && this.prisma
        ? await this.prisma.contentSource.findUnique({
            where: { originUrl: origin },
            select: { depositKey: true },
          })
        : null;
    const own = this.keys.open(site?.depositKey);
    if (this.keys.parsed(own)) {
      // Site passé en 2.x : plus de clé en clair, ni la sienne ni la globale.
      throw new UnauthorizedException(
        'Ce site utilise une clé 2.x : mettre à jour l’extension WordPress',
      );
    }
    if (own && same(provided, own)) return true;
    if (!own && same(provided, global)) return true;
    throw new UnauthorizedException('Clé WordPress invalide');
  }
}
