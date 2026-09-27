import { BadRequestException, ConflictException } from '@nestjs/common';
import { RecordStatus, Role, User } from '@prisma/client';
import { CurrentUser } from '../auth/current-user';
import { verifyPassword } from '../auth/password';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from './users.service';

const user = (over: Partial<User> = {}): User => ({
  id: 'u1',
  username: 'sofia',
  passwordHash: 'sel:empreinte',
  role: Role.MANAGER,
  status: RecordStatus.ACTIVE,
  automationKey: 'cle',
  createdAt: new Date(),
  updatedAt: new Date(),
  ...over,
});

const admin: CurrentUser = {
  id: 'boss',
  username: 'admin',
  role: Role.ADMIN,
  status: RecordStatus.ACTIVE,
};

function setup(found: User | null = user(), otherAdmins = 1) {
  const prisma = {
    user: {
      findUnique: jest.fn((): Promise<User | null> => Promise.resolve(found)),
      findMany: jest.fn(() => Promise.resolve([])),
      count: jest.fn(() => Promise.resolve(otherAdmins)),
      create: jest.fn(({ data }: { data: Partial<User> }) =>
        Promise.resolve(user(data)),
      ),
      update: jest.fn(({ data }: { data: Partial<User> }) =>
        Promise.resolve(user({ ...found, ...data })),
      ),
      delete: jest.fn(() => Promise.resolve(found)),
    },
    // Ce que le compte possède, relevé avant sa suppression.
    profile: { count: jest.fn(() => Promise.resolve(2)) },
    group: { count: jest.fn(() => Promise.resolve(3)) },
    contentSource: { count: jest.fn(() => Promise.resolve(1)) },
    sourceIngest: { count: jest.fn(() => Promise.resolve(0)) },
  };
  return {
    service: new UsersService(prisma as unknown as PrismaService),
    prisma,
  };
}

describe('UsersService.create', () => {
  it('range une empreinte, jamais le mot de passe', async () => {
    const { service, prisma } = setup(null);
    await service.create({
      username: 'sofia',
      password: 'un-mot-de-passe-long',
    });
    const [[args]] = prisma.user.create.mock.calls;
    expect(args.data.passwordHash).not.toContain('un-mot-de-passe');
    expect(
      verifyPassword('un-mot-de-passe-long', args.data.passwordHash!),
    ).toBe(true);
  });

  /** Seule occasion de lire la clé : aucune lecture ultérieure ne la rend. */
  it('rend la clé d’automatisation une seule fois, à la création', async () => {
    const { service } = setup(null);
    const created = await service.create({
      username: 'sofia',
      password: 'un-mot-de-passe-long',
    });
    expect(created.automationKey).toHaveLength(64);
    const listed = await service.findAll();
    expect(JSON.stringify(listed)).not.toContain('automationKey');
  });

  it('refuse un nom déjà pris', async () => {
    const { service } = setup(user());
    await expect(
      service.create({ username: 'sofia', password: 'un-mot-de-passe-long' }),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});

/** Une plateforme sans administrateur actif ne se rouvre plus : ces refus
 * sont ce qui empêche de s'enfermer dehors. */
describe('UsersService : ne pas se verrouiller dehors', () => {
  it('empêche un administrateur de se rétrograder', async () => {
    const { service } = setup(user({ id: 'boss', role: Role.ADMIN }));
    await expect(
      service.update('boss', { role: Role.MANAGER }, admin),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('empêche un administrateur de se désactiver', async () => {
    const { service } = setup(user({ id: 'boss', role: Role.ADMIN }));
    await expect(
      service.update('boss', { status: RecordStatus.INACTIVE }, admin),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('empêche un administrateur de se supprimer', async () => {
    const { service } = setup(user({ id: 'boss', role: Role.ADMIN }));
    await expect(service.remove('boss', admin)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('refuse de retirer le dernier administrateur', async () => {
    const { service } = setup(user({ id: 'autre', role: Role.ADMIN }), 0);
    await expect(
      service.update('autre', { role: Role.MANAGER }, admin),
    ).rejects.toThrow(/au moins un administrateur/);
    await expect(service.remove('autre', admin)).rejects.toThrow(
      /au moins un administrateur/,
    );
  });

  it('laisse retirer un administrateur s’il en reste un autre', async () => {
    const { service } = setup(user({ id: 'autre', role: Role.ADMIN }), 1);
    await expect(service.remove('autre', admin)).resolves.toMatchObject({
      deleted: true,
    });
  });
});

describe('UsersService.rotateKey', () => {
  it('rend une clé neuve, et l’ancienne cesse de valoir', async () => {
    const { service, prisma } = setup(user({ automationKey: 'ancienne' }));
    const rotated = await service.rotateKey('u1');
    const [[args]] = prisma.user.update.mock.calls;
    expect(args.data.automationKey).not.toBe('ancienne');
    expect(rotated.automationKey).toBe(args.data.automationKey);
  });
});
