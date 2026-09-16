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
