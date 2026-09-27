import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RecordStatus } from '@prisma/client';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { RequestWithUser } from './current-user';

/** La clé d'automatisation : celle d'un compte, ou la clé globale.
 *
 * Une clé par compte, pour que l'extension d'un gestionnaire ne voie que
 * ses sites et que son automate ne réserve que ses lots. La clé globale du
 * `.env` reste acceptée et n'appartient à personne : elle continue de tout
 * voir, ce qui laisse les automates déjà en place fonctionner. */
@Injectable()
export class AutomationAuthGuard implements CanActivate {
  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const provided = String(request.headers['x-api-key'] || '');
    if (!provided)
      throw new UnauthorizedException('Clé d’automatisation invalide');

    const global = this.config.get<string>('AUTOMATION_API_KEY');
    if (global && this.equal(provided, global)) {
      // Sans propriétaire : la portée reste celle d'avant les comptes.
      request.user = null;
      return true;
    }
    const user = await this.prisma.user.findUnique({
      where: { automationKey: provided },
    });
    if (!user) {
      if (!global) {
        throw new ServiceUnavailableException(
          'AUTOMATION_API_KEY doit être configuré, ou une clé de compte présentée',
        );
      }
      throw new UnauthorizedException('Clé d’automatisation invalide');
    }
    if (user.status !== RecordStatus.ACTIVE) {
      throw new UnauthorizedException('Ce compte est désactivé');
    }
    request.user = {
      id: user.id,
      username: user.username,
      role: user.role,
      status: user.status,
    };
    return true;
  }

  /** Comparaison en temps constant, même sur des longueurs différentes. */
  private equal(left: string, right: string) {
    const a = createHmac('sha256', 'automation').update(left).digest();
    const b = createHmac('sha256', 'automation').update(right).digest();
    return timingSafeEqual(a, b);
  }
}
