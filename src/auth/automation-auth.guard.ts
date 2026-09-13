import { CanActivate, ExecutionContext, Injectable, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { FastifyRequest } from 'fastify';

@Injectable()
export class AutomationAuthGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext) {
    const expected = this.config.get<string>('AUTOMATION_API_KEY');
    if (!expected) throw new ServiceUnavailableException('AUTOMATION_API_KEY doit être configuré');
    const request = context.switchToHttp().getRequest<FastifyRequest>();
    const provided = String(request.headers['x-api-key'] || '');
    const left = createHmac('sha256', 'automation').update(provided).digest();
    const right = createHmac('sha256', 'automation').update(expected).digest();
    if (!provided || !timingSafeEqual(left, right)) {
      throw new UnauthorizedException('Clé d’automatisation invalide');
    }
    return true;
  }
}
