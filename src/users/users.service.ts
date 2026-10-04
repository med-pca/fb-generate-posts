import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { RecordStatus, Role, User } from '@prisma/client';
import { hashPassword, newAutomationKey } from '../auth/password';
import { CurrentUser } from '../auth/current-user';
import { PrismaService } from '../prisma/prisma.service';
import { SessionService } from '../auth/session.service';
import { CreateUserDto, UpdateUserDto } from './dto/user.dto';

/** Ce qu'on montre d'un compte : ni mot de passe, ni clé. La clé ne se lit
 * qu'une fois, à sa création ou à sa régénération — ensuite elle n'existe
 * plus que chez celui qui l'a copiée.
 *
 * La clé NSTBrowser non plus n'est jamais relue : seulement si elle existe,
 * et ses quatre derniers caractères pour reconnaître laquelle. */
export function publicUser(user: User) {
  return {
    id: user.id,
    username: user.username,
    role: user.role,
    status: user.status,
    // Seulement le fait qu'elle existe : la page Extensions prévient avant
    // un téléchargement qui ne marcherait pas.
    hasAutomationKey: Boolean(user.automationKey),
    hasNstApiKey: Boolean(user.nstApiKey),
    nstApiKeyHint: user.nstApiKey ? `…${user.nstApiKey.slice(-4)}` : null,
    createdAt: user.createdAt,
  };
}

/** Vide = retirer : l'agent retombera sur le `NST_API_KEY` de sa machine. */
const nstKey = (raw: string) => raw.trim() || null;

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sessions: SessionService,
  ) {}

  async findAll() {
    const users = await this.prisma.user.findMany({
      orderBy: [{ role: 'asc' }, { username: 'asc' }],
    });
    return users.map(publicUser);
  }

  async create(dto: CreateUserDto) {
    const existing = await this.prisma.user.findUnique({
      where: { username: dto.username },
    });
    if (existing)
      throw new ConflictException('Ce nom d’utilisateur est déjà pris');
    const user = await this.prisma.user.create({
      data: {
        username: dto.username,
        passwordHash: hashPassword(dto.password),
        role: dto.role ?? Role.MANAGER,
        automationKey: newAutomationKey(),
      },
    });
    // Seule occasion de lire la clé : elle n'est jamais rendue ensuite.
    return { ...publicUser(user), automationKey: user.automationKey };
  }

  async update(id: string, dto: UpdateUserDto, acting: CurrentUser) {
    const user = await this.load(id);
    if (dto.username && dto.username !== user.username) {
      const taken = await this.prisma.user.findUnique({
        where: { username: dto.username },
      });
      if (taken)
        throw new ConflictException('Ce nom d’utilisateur est déjà pris');
    }
    // Se retirer soi-même ses droits, ou se désactiver, ferme la porte sans
    // que personne puisse la rouvrir.
    if (user.id === acting.id) {
      if (dto.role && dto.role !== Role.ADMIN) {
        throw new BadRequestException(
          'Un administrateur ne peut pas se rétrograder',
        );
      }
      if (dto.status === RecordStatus.INACTIVE) {
        throw new BadRequestException(
          'Un administrateur ne peut pas se désactiver',
        );
      }
    }
    if (
      user.role === Role.ADMIN &&
      (dto.role === Role.MANAGER || dto.status === RecordStatus.INACTIVE)
    ) {
      await this.assertAnotherAdminRemains(user.id);
    }
    const updated = await this.prisma.user.update({
      where: { id },
      data: {
        ...(dto.username ? { username: dto.username } : {}),
        ...(dto.password ? { passwordHash: hashPassword(dto.password) } : {}),
        ...(dto.role ? { role: dto.role } : {}),
        ...(dto.status ? { status: dto.status } : {}),
        ...(dto.nstApiKey !== undefined
          ? { nstApiKey: nstKey(dto.nstApiKey) }
          : {}),
      },
    });
    // Un mot de passe changé, un compte coupé ou rétrogradé : ses sessions
    // ouvertes tombent, il devra se reconnecter.
    if (dto.password || dto.status === RecordStatus.INACTIVE || (dto.role && dto.role !== user.role)) {
      await this.sessions.revokeAll(updated.id);
    }
    return publicUser(updated);
  }

  /** Le compte tel qu'il se voit lui-même, par `/api/me`. */
  async me(acting: CurrentUser) {
    return publicUser(await this.load(acting.id));
  }

  /** Chaque compte règle sa propre clé NSTBrowser : c'est son abonnement,
   * pas une affaire d'administrateur. */
  async setOwnNstKey(acting: CurrentUser, raw: string) {
    const user = await this.prisma.user.update({
      where: { id: acting.id },
      data: { nstApiKey: nstKey(raw) },
    });
    return publicUser(user);
  }

  /** Rend la nouvelle clé une seule fois. L'ancienne cesse aussitôt de
   * fonctionner : c'est le geste à faire quand une clé a fuité. */
  async rotateKey(id: string) {
    await this.load(id);
    const user = await this.prisma.user.update({
      where: { id },
      data: { automationKey: newAutomationKey() },
    });
    return { ...publicUser(user), automationKey: user.automationKey };
  }

  async remove(id: string, acting: CurrentUser) {
    const user = await this.load(id);
    if (user.id === acting.id) {
      throw new BadRequestException(
        'Un administrateur ne peut pas se supprimer',
      );
    }
    if (user.role === Role.ADMIN) await this.assertAnotherAdminRemains(user.id);
    // `SET NULL` en base : rien n'est détruit. Les ressources deviennent
    // sans propriétaire — donc réservées aux ADMIN — et se réattribuent.
    const released = await this.owned(id);
    await this.prisma.user.delete({ where: { id } });
    return { deleted: true, released };
  }

  /** Une plateforme sans administrateur actif ne se rouvre plus. */
  private async assertAnotherAdminRemains(exceptId: string) {
    const others = await this.prisma.user.count({
      where: {
        role: Role.ADMIN,
        status: RecordStatus.ACTIVE,
        id: { not: exceptId },
      },
    });
    if (!others) {
      throw new BadRequestException(
        'Il doit rester au moins un administrateur actif',
      );
    }
  }

  /** Ce que ce compte possède, pour le dire avant ou après sa suppression. */
  async owned(id: string) {
    const [profiles, groups, sites, ingests] = await Promise.all([
      this.prisma.profile.count({ where: { ownerId: id } }),
      this.prisma.group.count({ where: { ownerId: id } }),
      this.prisma.contentSource.count({ where: { ownerId: id } }),
      this.prisma.sourceIngest.count({ where: { ownerId: id } }),
    ]);
    return { profiles, groups, sites, ingests };
  }

  private async load(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('Compte introuvable');
    return user;
  }
}
