import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpException,
  HttpStatus,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { SessionService } from './session.service';
import { LoginThrottle } from './login-throttle';
import { AdminAuthGuard } from './admin-auth.guard';
import { ActingUser } from './current-user';
import type { CurrentUser } from './current-user';
import { clearSessionCookies, clientIp, isSecure, sessionCookie, sessionTokenFrom } from './cookies';

/** Une seule instance : les compteurs d'échecs vivent avec le serveur. */
export const loginThrottle = new LoginThrottle();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly sessions: SessionService,
    private readonly prisma: PrismaService,
  ) {}

  @Post('login')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Se connecter : ouvre une session dans un cookie HttpOnly',
    description: '5 échecs en 15 min pour un identifiant (20 pour une adresse) bloquent 15 min.',
  })
  async login(
    @Body() dto: LoginDto,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const ip = clientIp(request.headers, request.ip) ?? 'inconnue';
    const username = dto.username.trim();
    const wait = loginThrottle.blockedFor(ip, username);
    if (wait) {
      await this.log('AUTH_LOGIN_LOCKED', 'ERROR', `Connexion bloquée pour « ${username} » depuis ${ip} : trop d’échecs`, { ip, username });
      throw new HttpException(
        `Trop de tentatives. Réessayez dans ${Math.ceil(wait / 60)} minute(s).`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    let user;
    try {
      user = await this.auth.check({ ...dto, username });
    } catch (error) {
      loginThrottle.fail(ip, username);
      await this.log('AUTH_LOGIN_FAILED', 'WARN', `Échec de connexion pour « ${username} » depuis ${ip}`, { ip, username });
      // Ralentir chaque échec : un essai à la seconde, pas mille.
      await sleep(400);
      throw error instanceof UnauthorizedException ? error : new UnauthorizedException('Identifiant ou mot de passe incorrect');
    }
    loginThrottle.succeed(ip, username);
    const session = await this.sessions.create(user.id, {
      ip,
      userAgent: String(request.headers['user-agent'] || ''),
    });
    reply.header('set-cookie', sessionCookie(session.token, session.maxAgeSeconds, isSecure(request.headers)));
    reply.header('cache-control', 'no-store');
    await this.log('AUTH_LOGIN', 'INFO', `Connexion de « ${user.username} » depuis ${ip}`, { ip, userId: user.id });
    void this.sessions.purge().catch(() => undefined);
    return {
      expiresAt: session.expiresAt,
      user: { id: user.id, username: user.username, role: user.role },
    };
  }

  @Post('logout')
  @HttpCode(204)
  @ApiOperation({ summary: 'Se déconnecter : la session est révoquée côté serveur' })
  async logout(@Req() request: FastifyRequest, @Res({ passthrough: true }) reply: FastifyReply) {
    const token = sessionTokenFrom(request.headers);
    if (token) {
      const current = await this.sessions.validate(token);
      await this.sessions.revoke(token);
      if (current) await this.log('AUTH_LOGOUT', 'INFO', `Déconnexion de « ${current.user.username} »`, { userId: current.user.id });
    }
    reply.header('set-cookie', clearSessionCookies(isSecure(request.headers)));
    reply.header('cache-control', 'no-store');
  }

  @Post('logout-everywhere')
  @HttpCode(200)
  @UseGuards(AdminAuthGuard)
  @ApiOperation({ summary: 'Fermer toutes ses sessions (tous les navigateurs)' })
  async logoutEverywhere(
    @ActingUser() acting: CurrentUser,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const closed = await this.sessions.revokeAll(acting.id);
    reply.header('set-cookie', clearSessionCookies(isSecure(request.headers)));
    await this.log('AUTH_LOGOUT_ALL', 'WARN', `« ${acting.username} » a fermé ses ${closed} session(s)`, { userId: acting.id });
    return { closed };
  }

  @Get('session')
  @UseGuards(AdminAuthGuard)
  @ApiOperation({ summary: 'La session en cours (qui est connecté)' })
  current(@ActingUser() acting: CurrentUser) {
    return { user: acting };
  }

  private log(eventType: string, level: 'INFO' | 'WARN' | 'ERROR', message: string, metadata: Record<string, unknown>) {
    return this.prisma.activityLog
      .create({ data: { eventType, level, message, metadata: metadata as Prisma.InputJsonValue } })
      .catch(() => undefined);
  }
}
