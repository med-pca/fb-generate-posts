import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { RecordStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService } from './auth.service';
import { RequestWithUser } from './current-user';

/** Une session valide, portée par un compte actif.
 *
 * Le compte est relu en base à chaque requête : un compte désactivé perd
 * l'accès tout de suite, sans attendre l'expiration de son jeton. */
@Injectable()
export class AdminAuthGuard implements CanActivate {
  constructor(
    private readonly auth: AuthService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const header = request.headers.authorization;
    const token = header?.startsWith('Bearer ') ? header.slice(7) : '';
    const claims = token ? this.auth.read(token) : null;
    if (!claims) {
      throw new UnauthorizedException('Session administrateur requise');
    }
    const user = await this.prisma.user.findUnique({
      where: { id: claims.id },
    });
    if (!user || user.status !== RecordStatus.ACTIVE) {
      throw new UnauthorizedException('Ce compte n’a plus accès');
    }
    request.user = {
      id: user.id,
      username: user.username,
      role: user.role,
      status: user.status,
    };
    return true;
  }
}
