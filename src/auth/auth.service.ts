import {
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RecordStatus, Role, User } from '@prisma/client';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { LoginDto } from './dto/login.dto';
import { hashPassword, newAutomationKey, verifyPassword } from './password';

const SESSION_HOURS = 12;

@Injectable()
export class AuthService {
  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  async login(dto: LoginDto) {
    const user = await this.authenticate(dto);
    if (!user) throw new UnauthorizedException('Identifiants incorrects');
    if (user.status !== RecordStatus.ACTIVE) {
      throw new UnauthorizedException('Ce compte est désactivé');
    }
    const expiresAt = Date.now() + SESSION_HOURS * 60 * 60 * 1000;
    const payload = Buffer.from(
      JSON.stringify({
        sub: user.id,
        username: user.username,
        role: user.role,
        exp: expiresAt,
        nonce: randomBytes(12).toString('hex'),
      }),
    ).toString('base64url');
    return {
      accessToken: `${payload}.${this.sign(payload)}`,
      expiresAt,
      user: { id: user.id, username: user.username, role: user.role },
    };
  }

  /** Le compte qui correspond, ou `null`.
   *
   * Les identifiants du `.env` restent acceptés tant qu'aucun compte ne
   * porte ce nom : ils créent alors le premier ADMIN. C'est ce qui permet à
   * une installation existante de continuer sans intervention, et à une
   * installation neuve d'avoir un administrateur sans script de départ. */
  private async authenticate(dto: LoginDto): Promise<User | null> {
    const user = await this.prisma.user.findUnique({
      where: { username: dto.username },
    });
    if (user)
      return verifyPassword(dto.password, user.passwordHash) ? user : null;

    const username = this.config.get<string>('ADMIN_USERNAME');
    const password = this.config.get<string>('ADMIN_PASSWORD');
    if (!username || !password) return null;
    if (
      !this.equal(dto.username, username) ||
      !this.equal(dto.password, password)
    ) {
      return null;
    }
    return this.prisma.user.create({
      data: {
        username,
        passwordHash: hashPassword(password),
        role: Role.ADMIN,
        automationKey:
          this.config.get<string>('AUTOMATION_API_KEY') || newAutomationKey(),
      },
    });
  }

  /** Le contenu du jeton, ou `null` s'il est invalide ou périmé. Ne touche
   * pas la base : la vérification du compte appartient au garde. */
  read(token: string) {
    const [payload, signature] = token.split('.');
    if (!payload || !signature || !this.equal(signature, this.sign(payload))) {
      return null;
    }
    try {
      const data = JSON.parse(Buffer.from(payload, 'base64url').toString()) as {
        sub?: string;
        username?: string;
        role?: Role;
        exp?: number;
      };
      if (typeof data.exp !== 'number' || data.exp <= Date.now()) return null;
      return data.sub
        ? { id: data.sub, username: data.username ?? '', role: data.role }
        : null;
    } catch {
      return null;
    }
  }

  /** Conservé pour ce qui ne regarde que la validité du jeton. */
  verify(token: string) {
    return this.read(token) !== null;
  }

  private sign(payload: string) {
    return createHmac('sha256', this.required('AUTH_SECRET'))
      .update(payload)
      .digest('base64url');
  }

  private equal(left: string, right: string) {
    const a = createHmac('sha256', 'compare').update(left).digest();
    const b = createHmac('sha256', 'compare').update(right).digest();
    return timingSafeEqual(a, b);
  }

  private required(name: string) {
    const value = this.config.get<string>(name);
    if (!value)
      throw new ServiceUnavailableException(`${name} doit être configuré`);
    return value;
  }
}
