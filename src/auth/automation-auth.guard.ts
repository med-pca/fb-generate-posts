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
    if (!provided) {
      await this.noteBrowserRejected(request, 'aucune clé présentée');
      throw new UnauthorizedException('Clé d’automatisation invalide');
    }

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
      await this.noteBrowserRejected(
        request,
        'clé inconnue (régénérée depuis l’appairage ?)',
      );
      if (!global) {
        throw new ServiceUnavailableException(
          'AUTOMATION_API_KEY doit être configuré, ou une clé de compte présentée',
        );
      }
      throw new UnauthorizedException('Clé d’automatisation invalide');
    }
    if (user.status !== RecordStatus.ACTIVE) {
      await this.noteBrowserRejected(request, `compte « ${user.username} » désactivé`);
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

  /** Le battement d'un navigateur refusé : noté sur le profil qu'il vise,
   * pour que le Pilotage montre un appairage cassé au lieu d'« appairé ».
   * Seules les routes d'un navigateur comptent (ordre et battement), pas
   * celles de l'agent local. Un échec d'écriture ne change rien au refus. */
  private async noteBrowserRejected(request: RequestWithUser, reason: string) {
    const match = /\/control\/profile\/([^/?#]+)/.exec(request.url || '');
    if (!match) return;
    let externalId: string;
    try {
      externalId = decodeURIComponent(match[1]);
    } catch {
      return;
    }
    try {
      await this.prisma.profileRunner.updateMany({
        where: { profile: { externalId } },
        data: { keyRejectedAt: new Date(), keyRejectReason: reason },
      });
    } catch {
      // Une trace manquée ne change rien au refus.
    }
  }

  /** Comparaison en temps constant, même sur des longueurs différentes. */
  private equal(left: string, right: string) {
    const a = createHmac('sha256', 'automation').update(left).digest();
    const b = createHmac('sha256', 'automation').update(right).digest();
    return timingSafeEqual(a, b);
  }
}
