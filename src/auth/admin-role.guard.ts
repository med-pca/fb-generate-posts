import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { RequestWithUser } from './current-user';

/** Réservé aux ADMIN. À poser APRÈS `AdminAuthGuard`, qui attache le compte.
 * Un gestionnaire n'administre pas les comptes des autres. */
@Injectable()
export class AdminRoleGuard implements CanActivate {
  canActivate(context: ExecutionContext) {
    const { user } = context.switchToHttp().getRequest<RequestWithUser>();
    if (user?.role !== Role.ADMIN) {
      throw new ForbiddenException('Réservé aux administrateurs');
    }
    return true;
  }
}
