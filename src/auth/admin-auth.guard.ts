import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { SessionService } from './session.service';
import { RequestWithUser } from './current-user';
import { sessionTokenFrom } from './cookies';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/** La requête vient-elle de la plateforme elle-même ? Un formulaire posté
 * depuis un autre site porte son Origin (ou son Referer) : refusé. Sans
 * aucun des deux, on exige l'en-tête que seule notre interface envoie. */
export function sameOrigin(headers: RequestWithUser['headers']) {
  const host = String(headers['x-forwarded-host'] || headers.host || '').split(',')[0].trim().toLowerCase();
  const source = String(headers.origin || headers.referer || '');
  if (source) {
    try {
      return new URL(source).host.toLowerCase() === host;
    } catch {
      return false;
    }
  }
  return headers['x-requested-with'] === 'PostFlow';
}

/** Une session valide (cookie HttpOnly), portée par un compte actif.
 *
 * La session et le compte sont relus en base à chaque requête : une
 * déconnexion, un compte désactivé ou un mot de passe changé coupent l'accès
 * tout de suite. Les requêtes qui modifient doivent venir de la plateforme
 * (protection CSRF, en plus de SameSite=Strict). */
@Injectable()
export class AdminAuthGuard implements CanActivate {
  constructor(private readonly sessions: SessionService) {}

  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const token = sessionTokenFrom(request.headers);
    const session = token ? await this.sessions.validate(token) : null;
    if (!session) throw new UnauthorizedException('Session requise : connectez-vous');
    if (!SAFE_METHODS.has(request.method) && !sameOrigin(request.headers)) {
      throw new ForbiddenException('Requête refusée : elle ne vient pas de la plateforme');
    }
    const { user } = session;
    request.user = { id: user.id, username: user.username, role: user.role, status: user.status };
    return true;
  }
}
