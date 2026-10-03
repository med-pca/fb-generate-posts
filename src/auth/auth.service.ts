import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RecordStatus, Role, User } from '@prisma/client';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { LoginDto } from './dto/login.dto';
import { hashPassword, newAutomationKey, verifyPassword } from './password';

let dummy = '';
const DUMMY_HASH = () => (dummy ||= hashPassword('mot-de-passe-factice'));

@Injectable()
export class AuthService {
  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  /** Le compte, s'il existe, que le mot de passe est bon et qu'il est actif.
   * Le message ne dit jamais lequel des deux est faux. */
  async check(dto: LoginDto) {
    const user = await this.authenticate(dto);
    if (!user) throw new UnauthorizedException('Identifiant ou mot de passe incorrect');
    if (user.status !== RecordStatus.ACTIVE) {
      throw new UnauthorizedException('Ce compte est désactivé');
    }
    return user;
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
    if (!username || !password || !this.equal(dto.username, username)) {
      // Un identifiant inconnu coûte autant qu'un mauvais mot de passe :
      // le temps de réponse ne dit pas quels comptes existent.
      verifyPassword(dto.password, DUMMY_HASH());
      return null;
    }
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

  private equal(left: string, right: string) {
    const a = createHmac('sha256', 'compare').update(left).digest();
    const b = createHmac('sha256', 'compare').update(right).digest();
    return timingSafeEqual(a, b);
  }
}
