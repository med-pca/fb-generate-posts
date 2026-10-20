import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Optional,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { FastifyRequest } from 'fastify';
import { PrismaService } from '../prisma/prisma.service';

const digest = (value: string) => createHmac('sha256', 'wordpress').update(value).digest();
const same = (a: string, b: string) => Boolean(a && b) && timingSafeEqual(digest(a), digest(b));

/** La clé d'un envoi WordPress : celle du site qui envoie.
 *
 * Chaque site a sa clé (générée dans Sites) et elle n'ouvre QUE ce site : un
 * gestionnaire ne peut rien envoyer au nom du site d'un autre. Le plugin n'a
 * qu'UNE clé, celle avec laquelle la plateforme lui dépose aussi ses
 * articles.
 *
 * La clé globale (`WORDPRESS_API_KEY`) n'est plus qu'une transition : elle
 * n'est acceptée que pour un site DÉJÀ déclaré qui n'a pas encore la sienne,
 * et plus du tout avec `WORDPRESS_ALLOW_GLOBAL_KEY=false`. Un site inconnu
 * est refusé : il doit d'abord être déclaré par son propriétaire, sans quoi
 * il naîtrait sans propriétaire et ses posts partiraient sur les profils de
 * la maison. */
@Injectable()
export class WordpressGuard implements CanActivate {
  constructor(
    private readonly config: ConfigService,
    @Optional() private readonly prisma?: PrismaService,
  ) {}

  private globalKey() {
    const allowed = String(this.config.get<string>('WORDPRESS_ALLOW_GLOBAL_KEY') ?? 'true').toLowerCase() !== 'false';
    return allowed ? this.config.get<string>('WORDPRESS_API_KEY') || '' : '';
  }

  canActivate(context: ExecutionContext): boolean | Promise<boolean> {
    const request = context.switchToHttp().getRequest<FastifyRequest>();
    const provided = String(request.headers['x-api-key'] || '');
    if (!this.prisma) {
      // Sans base (tests unitaires) : la clé globale seule.
      const expected = this.globalKey();
      if (!expected) throw new ServiceUnavailableException('WORDPRESS_API_KEY doit être configuré');
      if (same(provided, expected)) return true;
      throw new UnauthorizedException('Clé WordPress invalide');
    }
    if (!provided) throw new UnauthorizedException('Clé WordPress invalide');
    return this.siteKeyMatches(request, provided);
  }

  /** Le site désigné par le corps de l'envoi (`siteUrl`), et SA clé. */
  private async siteKeyMatches(request: FastifyRequest, provided: string) {
    const raw = (request.body as { siteUrl?: unknown } | undefined)?.siteUrl;
    let origin = '';
    try {
      const url = new URL(String(raw ?? ''));
      origin = url.origin + url.pathname.replace(/\/+$/, '');
    } catch {
      throw new UnauthorizedException('Clé WordPress invalide');
    }
    const site = await this.prisma!.contentSource.findUnique({
      where: { originUrl: origin },
      select: { depositKey: true },
    });
    if (!site) {
      throw new UnauthorizedException(
        `Site inconnu (${origin}) : déclarez-le dans la plateforme (Sites), puis collez sa clé dans le plugin`,
      );
    }
    if (site.depositKey) {
      if (same(provided, site.depositKey)) return true;
      throw new UnauthorizedException('Clé WordPress invalide pour ce site');
    }
    // Transition : un site existant sans clé propre garde la clé globale.
    const global = this.globalKey();
    if (global && same(provided, global)) return true;
    throw new UnauthorizedException(
      'Ce site n’a pas encore sa clé : générez-la dans la plateforme (Sites), puis collez-la dans le plugin',
    );
  }
}
