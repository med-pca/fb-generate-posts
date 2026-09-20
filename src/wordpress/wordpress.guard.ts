import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { FastifyRequest } from 'fastify';

@Injectable()
export class WordpressGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext) {
    const expected = this.config.get<string>('WORDPRESS_API_KEY');
    if (!expected)
      throw new ServiceUnavailableException(
        'WORDPRESS_API_KEY doit être configuré',
      );
    const request = context.switchToHttp().getRequest<FastifyRequest>();
    const provided = String(request.headers['x-api-key'] || '');
    const digest = (value: string) =>
      createHmac('sha256', 'wordpress').update(value).digest();
    if (!provided || !timingSafeEqual(digest(provided), digest(expected))) {
      throw new UnauthorizedException('Clé WordPress invalide');
    }
    return true;
  }
}
