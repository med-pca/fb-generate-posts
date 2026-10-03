import { BadRequestException } from '@nestjs/common';
import { BulkService } from './bulk.service';

function setup(existing: any[] = []) {
  const prisma: any = {
    profile: { findMany: jest.fn(async ({ where }: any) => where.id.in.filter((id: string) => id !== 'hors-portee').map((id: string) => ({ id, name: id }))) },
    group: { findMany: jest.fn(async ({ where }: any) => where.id.in.map((id: string) => ({ id, name: id }))) },
    contentSource: { findMany: jest.fn(async () => []) },
    profileGroup: {
      findMany: jest.fn(async () => existing),
      createMany: jest.fn((args: any) => ({ op: 'createMany', args, count: args.data.length })),
      updateMany: jest.fn((args: any) => ({ op: 'updateMany', args, count: 1 })),
      deleteMany: jest.fn(async () => ({ count: 4 })),
    },
    activityLog: { create: jest.fn(async (args: any) => args) },
    $transaction: jest.fn(async (ops: any[]) => ops),
  };
  const access: any = {
    grantGroup: jest.fn(async (id: string, userId: string) => {
      if (userId === 'admin') throw new BadRequestException('Un administrateur voit déjà toutes les ressources');
    }),
    revokeGroup: jest.fn(async () => undefined),
  };
  return { service: new BulkService(prisma, access), prisma, access };
}

describe('BulkService.link', () => {
  it('crée chaque liaison manquante, réactive les inactives, ignore ce qui est hors de portée', async () => {
    const { service, prisma } = setup([
      { profileId: 'p1', groupId: 'g1', status: 'ACTIVE' },
      { profileId: 'p2', groupId: 'g1', status: 'INACTIVE' },
    ]);
    const r = await service.link({ profileIds: ['p1', 'p2', 'hors-portee'], groupIds: ['g1', 'g2'], action: 'link' }, null);
    const created = prisma.profileGroup.createMany.mock.calls[0][0];
    expect(created.data).toEqual([
      { profileId: 'p1', groupId: 'g2' },
      { profileId: 'p2', groupId: 'g2' },
    ]);
    expect(created.skipDuplicates).toBe(true);
    expect(prisma.profileGroup.updateMany.mock.calls[0][0].where.OR).toEqual([{ profileId: 'p2', groupId: 'g1' }]);
    expect(r).toMatchObject({ created: 2, reactivated: 1, already: 1, ignored: 1, profiles: 2, groups: 2 });
    expect(prisma.activityLog.create.mock.calls[0][0].data.eventType).toBe('GROUP_BULK_LINK');
  });

  it('délie en une fois', async () => {
    const { service, prisma } = setup();
    const r = await service.link({ profileIds: ['p1'], groupIds: ['g1', 'g2'], action: 'unlink' }, null);
    expect(prisma.profileGroup.deleteMany.mock.calls[0][0].where).toEqual({ profileId: { in: ['p1'] }, groupId: { in: ['g1', 'g2'] } });
    expect(r.removed).toBe(4);
  });

  it('refuse une sélection démesurée', async () => {
    const { service } = setup();
    const many = (n: number, p: string) => Array.from({ length: n }, (_, i) => `${p}${i}`);
    await expect(service.link({ profileIds: many(500, 'p'), groupIds: many(200, 'g'), action: 'link' }, null)).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('BulkService.share', () => {
  it('partage chaque groupe avec chaque compte, et dit les refus sans s’arrêter', async () => {
    const { service, access } = setup();
    const r = await service.share({ kind: 'groups', ids: ['g1', 'g2'], userIds: ['u1', 'admin'], action: 'grant' }, null);
    expect(access.grantGroup).toHaveBeenCalledTimes(4);
    expect(r.done).toBe(2);
    expect(r.failures).toHaveLength(2);
    expect(r.failures[0].reason).toMatch(/administrateur/);
  });
});
