import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { RecordStatus, Role } from '@prisma/client';
import type { CurrentUser } from '../auth/current-user';
import { PrismaService } from '../prisma/prisma.service';
import { AccessService } from './access.service';

const account = (role: Role, id = 'u1'): CurrentUser => ({
  id,
  username: id,
  role,
  status: RecordStatus.ACTIVE,
});

const admin = account(Role.ADMIN, 'boss');
const owner = account(Role.MANAGER, 'owner');
const other = account(Role.MANAGER, 'other');

function setup(
  groupOwnerId: string | null = 'owner',
  beneficiary: Partial<{ role: Role; status: RecordStatus }> = {},
) {
  const prisma = {
    group: {
      findUnique: jest.fn(() =>
        Promise.resolve({ id: 'g1', ownerId: groupOwnerId }),
      ),
    },
    contentSource: { findUnique: jest.fn(() => Promise.resolve(null)) },
    user: {
      findUnique: jest.fn(() =>
        Promise.resolve({
          id: 'sofia',
          username: 'sofia',
          role: beneficiary.role ?? Role.MANAGER,
          status: beneficiary.status ?? RecordStatus.ACTIVE,
        }),
      ),
    },
    groupAccess: {
      upsert: jest.fn(() => Promise.resolve({})),
      deleteMany: jest.fn(() => Promise.resolve({ count: 1 })),
      findMany: jest.fn(() => Promise.resolve([])),
    },
    siteAccess: { deleteMany: jest.fn(() => Promise.resolve({ count: 0 })) },
  };
  return {
    service: new AccessService(prisma as unknown as PrismaService),
    prisma,
  };
}

describe('AccessService : qui peut partager', () => {
  it('le propriétaire partage sa ressource', async () => {
    const { service } = setup();
    await expect(
      service.grantGroup('g1', 'sofia', owner),
    ).resolves.toMatchObject({
      granted: true,
    });
  });

  it('un administrateur partage n’importe quelle ressource', async () => {
    const { service } = setup();
    await expect(
      service.grantGroup('g1', 'sofia', admin),
    ).resolves.toMatchObject({
      granted: true,
    });
  });

  /** Un bénéficiaire ne repartage pas ce qu'on lui a prêté : le partage
   * donne le droit de publier, pas celui de distribuer. */
  it('un tiers ne partage pas la ressource d’un autre', async () => {
    const { service } = setup();
    await expect(
      service.grantGroup('g1', 'sofia', other),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  // Introuvable plutôt qu'interdit : un 403 confirmerait son existence.
  it('une ressource sans propriétaire est introuvable pour un gestionnaire', async () => {
    const { service } = setup(null);
    await expect(
      service.grantGroup('g1', 'sofia', other),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('AccessService : à qui', () => {
  it('refuse de partager avec le propriétaire lui-même', async () => {
    const { service } = setup();
    await expect(service.grantGroup('g1', 'owner', owner)).rejects.toThrow(
      /déjà tous les droits/,
    );
  });

  // Lui partager quelque chose ne change rien et laisserait croire que
  // l'accès vient de là.
  it('refuse de partager avec un administrateur', async () => {
    const { service } = setup('owner', { role: Role.ADMIN });
    await expect(service.grantGroup('g1', 'sofia', owner)).rejects.toThrow(
      /voit déjà toutes/,
    );
  });

  it('refuse un compte désactivé', async () => {
    const { service } = setup('owner', { status: RecordStatus.INACTIVE });
    await expect(
      service.grantGroup('g1', 'sofia', owner),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  /** Repartager n'est pas une erreur : on laisse l'accès tel quel plutôt
   * que de faire échouer un geste sans conséquence. */
  it('accepte un partage déjà accordé', async () => {
    const { service, prisma } = setup();
    await service.grantGroup('g1', 'sofia', owner);
    const [[args]] = prisma.groupAccess.upsert.mock.calls as unknown as [
      [{ update: object }],
    ];
    expect(args.update).toEqual({});
  });
});

describe('AccessService.revoke', () => {
  it('retire un partage existant', async () => {
    const { service } = setup();
    await expect(service.revokeGroup('g1', 'sofia', owner)).resolves.toEqual({
      revoked: true,
      userId: 'sofia',
    });
  });

  it('signale un partage qui n’existait pas', async () => {
    const { service, prisma } = setup();
    prisma.groupAccess.deleteMany.mockResolvedValueOnce({ count: 0 });
    await expect(
      service.revokeGroup('g1', 'sofia', owner),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
