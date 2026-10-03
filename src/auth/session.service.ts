import { Injectable } from '@nestjs/common';
import { RecordStatus } from '@prisma/client';
import { createHash, randomBytes } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';

/** Durée maximale d'une session, connectée ou pas. */
export const SESSION_HOURS = 12;
/** Sans activité pendant ce temps, la session tombe. */
export const IDLE_MINUTES = 120;
/** On ne réécrit « vu à » qu'au plus une fois par minute. */
const TOUCH_SECONDS = 60;

const hash = (token: string) => createHash('sha256').update(token).digest('hex');

/** Les sessions de connexion. Le navigateur détient un jeton aléatoire de
 * 256 bits ; la base, son empreinte. Une session se révoque (déconnexion,
 * mot de passe changé, compte désactivé) et expire seule. */
@Injectable()
export class SessionService {
  constructor(private readonly prisma: PrismaService) {}

  async create(userId: string, meta: { ip?: string | null; userAgent?: string | null }, now = new Date()) {
    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(now.getTime() + SESSION_HOURS * 3_600_000);
    await this.prisma.session.create({
      data: {
        userId,
        tokenHash: hash(token),
        expiresAt,
        lastSeenAt: now,
        ip: meta.ip ?? null,
        userAgent: meta.userAgent?.slice(0, 300) ?? null,
      },
    });
    return { token, expiresAt, maxAgeSeconds: SESSION_HOURS * 3600 };
  }

  /** Le compte derrière ce jeton, ou null : inconnu, révoqué, expiré,
   * inactif trop longtemps, ou compte désactivé. */
  async validate(token: string, now = new Date()) {
    if (!token || token.length > 200) return null;
    const session = await this.prisma.session.findUnique({
      where: { tokenHash: hash(token) },
      include: { user: true },
    });
    if (!session || session.revokedAt) return null;
    if (session.expiresAt.getTime() <= now.getTime()) return null;
    if (now.getTime() - session.lastSeenAt.getTime() > IDLE_MINUTES * 60_000) {
      await this.prisma.session.update({ where: { id: session.id }, data: { revokedAt: now } });
      return null;
    }
    if (session.user.status !== RecordStatus.ACTIVE) return null;
    if (now.getTime() - session.lastSeenAt.getTime() > TOUCH_SECONDS * 1000) {
      await this.prisma.session.update({ where: { id: session.id }, data: { lastSeenAt: now } });
    }
    return { sessionId: session.id, user: session.user };
  }

  async revoke(token: string, now = new Date()) {
    if (!token) return;
    await this.prisma.session.updateMany({
      where: { tokenHash: hash(token), revokedAt: null },
      data: { revokedAt: now },
    });
  }

  /** Toutes les sessions d'un compte : mot de passe changé, compte coupé. */
  async revokeAll(userId: string, now = new Date()) {
    const { count } = await this.prisma.session.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: now },
    });
    return count;
  }

  /** Le ménage : les sessions finies depuis plus d'un jour. */
  async purge(now = new Date()) {
    const before = new Date(now.getTime() - 86_400_000);
    await this.prisma.session.deleteMany({
      where: { OR: [{ expiresAt: { lt: before } }, { revokedAt: { lt: before } }] },
    });
  }
}
