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

/** La clé d'un renvoi WordPress : la clé globale (`WORDPRESS_API_KEY`), ou la
 * clé propre du site qui envoie. Le plugin n'a qu'UNE clé, celle avec laquelle
 * la plateforme lui dépose ses articles : un site doté de sa propre clé
 * renvoyait donc ses articles avec elle, et se les voyait tous refuser. */
@Injectable()
export class WordpressGuard implements CanActivate {
  constructor(
    private readonly config: ConfigService,
    @Optional() private readonly prisma?: PrismaService,
  ) {}

  canActivate(context: ExecutionContext): boolean | Promise<boolean> {
    const expected = this.config.get<string>('WORDPRESS_API_KEY') || '';
    if (!expected && !this.prisma)
      throw new ServiceUnavailableException('WORDPRESS_API_KEY doit être configuré');
    const request = context.switchToHttp().getRequest<FastifyRequest>();
    const provided = String(request.headers['x-api-key'] || '');
    if (!provided) throw new UnauthorizedException('Clé WordPress invalide');
    if (same(provided, expected)) return true;
    if (!this.prisma) throw new UnauthorizedException('Clé WordPress invalide');
    return this.siteKeyMatches(request, provided);
  }

  /** La clé du site désigné par le corps de l'envoi (`siteUrl`). */
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
    if (site?.depositKey && same(provided, site.depositKey)) return true;
    throw new UnauthorizedException('Clé WordPress invalide');
  }
}
