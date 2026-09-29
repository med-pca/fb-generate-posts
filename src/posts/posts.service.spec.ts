import { BadRequestException, ConflictException } from '@nestjs/common';
import { PostsService } from './posts.service';

type Harness = {
  /** Posts correspondant aux filtres. */
  matched: number;
  /** Posts réservés par un job encore valide. */
  claimed?: Array<{ id: string; title: string }>;
};

function makeHarness({ matched, claimed = [] }: Harness) {
  const tx: any = {
    post: {
      count: jest.fn(async () => matched),
      findMany: jest.fn(async () => claimed),
      deleteMany: jest.fn(async ({ where }: any) => {
        const excluded = where.AND?.[1]?.id?.notIn?.length ?? 0;
        return { count: matched - excluded };
      }),
    },
  };
  const prisma: any = {
    post: {
      findUniqueOrThrow: jest.fn(async () => ({
        id: 'post_1',
        targets: claimed.length ? [{ id: 'target_1' }] : [],
      })),
      // La portée passe par `findFirst` : un `findUnique` ne peut pas
      // porter de condition de propriétaire.
      findFirst: jest.fn(() => Promise.resolve({ id: 'post_1' })),
      delete: jest.fn(async () => ({ id: 'post_1' })),
    },
    $transaction: jest.fn(async (cb: any) => cb(tx)),
  };
  return { service: new PostsService(prisma), prisma, tx };
}

describe('PostsService — suppression', () => {
  it('supprime en masse ce qui correspond au filtre', async () => {
    const { service, tx } = makeHarness({ matched: 12 });

    const result = await service.bulkRemove({
      profileId: 'profile_1',
      dryRun: false,
      force: false,
    });

    expect(result).toMatchObject({ matched: 12, deleted: 12, blocked: 0 });
    expect(tx.post.deleteMany).toHaveBeenCalledWith({
      where: { profileId: 'profile_1' },
    });
  });

  it('épargne les posts réservés par un job en cours', async () => {
    const { service, tx } = makeHarness({
      matched: 5,
      claimed: [{ id: 'post_9', title: 'En cours de publication' }],
    });

    const result = await service.bulkRemove({
      profileId: 'profile_1',
      dryRun: false,
      force: false,
    });

    expect(result).toMatchObject({ matched: 5, deleted: 4, blocked: 1 });
    expect(tx.post.deleteMany).toHaveBeenCalledWith({
      where: {
        AND: [{ profileId: 'profile_1' }, { id: { notIn: ['post_9'] } }],
      },
    });
  });

  it('force emporte aussi les posts réservés', async () => {
    const { service, tx } = makeHarness({
      matched: 5,
      claimed: [{ id: 'post_9', title: 'En cours de publication' }],
    });

    const result = await service.bulkRemove({
      profileId: 'profile_1',
      dryRun: false,
      force: true,
    });

    expect(result).toMatchObject({ deleted: 5, blocked: 0 });
    expect(tx.post.deleteMany).toHaveBeenCalledWith({
      where: { profileId: 'profile_1' },
    });
  });

  it('dryRun compte sans rien supprimer', async () => {
    const { service, tx } = makeHarness({ matched: 30 });

    const result = await service.bulkRemove({
      ids: ['a', 'b'],
      dryRun: true,
      force: false,
    });

    expect(result).toMatchObject({ dryRun: true, matched: 30, deleted: 0 });
    expect(tx.post.deleteMany).not.toHaveBeenCalled();
  });

  // Sans critère, le `where` serait vide et effacerait toute la table.
  it('refuse une suppression sans aucun critère', async () => {
    const { service, prisma } = makeHarness({ matched: 0 });

    await expect(
      service.bulkRemove({ dryRun: false, force: false }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('refuse la suppression unitaire d’un post réservé', async () => {
    const { service, prisma } = makeHarness({
      matched: 1,
      claimed: [{ id: 'post_1', title: 'Réservé' }],
    });

    await expect(service.remove('post_1')).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(prisma.post.delete).not.toHaveBeenCalled();

    await service.remove('post_1', true);
    expect(prisma.post.delete).toHaveBeenCalledWith({
      where: { id: 'post_1' },
    });
  });
});

describe('PostsService — post ouvert', () => {
  function setup(groups: Array<{ categoryId: string | null }>) {
    const prisma: any = {
      group: { findMany: jest.fn(async () => groups) },
      post: { create: jest.fn(async ({ data }: any) => data) },
      profile: { findFirst: jest.fn() },
    };
    return { service: new PostsService(prisma), prisma };
  }
  const sofia: any = {
    id: 'u1',
    role: 'MANAGER',
    username: 's',
    status: 'ACTIVE',
  };
  const base = { title: 'T', description: 'D', delay: 10 };

  it('se crée sans profil, sur plusieurs groupes d’une même catégorie', async () => {
    const { service, prisma } = setup([
      { categoryId: 'cat' },
      { categoryId: 'cat' },
    ]);
    const post: any = await service.create(
      { ...base, groupIds: ['g1', 'g2', 'g1'] },
      sofia,
    );
    expect(prisma.profile.findFirst).not.toHaveBeenCalled();
    expect(post).toMatchObject({ profileId: null, ownerId: 'u1' });
    expect(post.targets.create).toEqual([{ groupId: 'g1' }, { groupId: 'g2' }]);
  });

  it('refuse des groupes de catégories différentes', async () => {
    const { service } = setup([{ categoryId: 'a' }, { categoryId: 'b' }]);
    await expect(
      service.create({ ...base, groupIds: ['g1', 'g2'] }, sofia),
    ).rejects.toThrow('même catégorie');
  });

  it('refuse un groupe hors de portée ou inactif', async () => {
    const { service } = setup([{ categoryId: 'a' }]);
    await expect(
      service.create({ ...base, groupIds: ['g1', 'g2'] }, sofia),
    ).rejects.toThrow('introuvable');
  });
});
