import { BadRequestException } from '@nestjs/common';
import { ProfilesService } from './profiles.service';

function setup(profiles: any[], users: Record<string, any>) {
  const prisma: any = {
    user: { findUnique: jest.fn(async ({ where }: any) => users[where.id] ?? null) },
    profile: {
      findMany: jest.fn(async () => profiles),
      updateMany: jest.fn(async ({ where }: any) => ({ count: where.id.in.length })),
    },
    profileGroup: { findMany: jest.fn(async () => [{ groupId: 'g1' }, { groupId: 'g2' }]) },
    groupAccess: { upsert: jest.fn(async () => ({})) },
    activityLog: { create: jest.fn(async () => ({})) },
  };
  return { prisma, service: new ProfilesService(prisma, {} as any) };
}
const admin = { id: 'a1', username: 'admin', role: 'ADMIN' } as any;
const users = {
  m1: { id: 'm1', username: 'karim', role: 'MANAGER', status: 'ACTIVE' },
  m2: { id: 'm2', username: 'sara', role: 'MANAGER', status: 'ACTIVE' },
  a1: { id: 'a1', username: 'admin', role: 'ADMIN', status: 'ACTIVE' },
  off: { id: 'off', username: 'ancien', role: 'MANAGER', status: 'INACTIVE' },
};

describe('ProfilesService.assign — confier des profils à un gestionnaire', () => {
  it('donne les profils au gestionnaire et lui partage leurs groupes', async () => {
    const { service, prisma } = setup([{ id: 'p1', name: 'Rihab', ownerId: null, owner: null }], users);
    const r = await service.assign({ profileIds: ['p1'], ownerId: 'm1', shareGroups: true }, admin);
    expect(prisma.profile.updateMany).toHaveBeenCalledWith({ where: { id: { in: ['p1'] } }, data: { ownerId: 'm1' } });
    expect(prisma.groupAccess.upsert).toHaveBeenCalledTimes(2);
    expect(prisma.groupAccess.upsert.mock.calls[0][0].create).toEqual({ groupId: 'g1', userId: 'm1', grantedBy: 'a1' });
    // Les groupes qu'il possède déjà ne sont pas « partagés » une seconde fois.
    expect(prisma.profileGroup.findMany.mock.calls[0][0].where.group).toEqual({ ownerId: { not: 'm1' } });
    expect(r).toMatchObject({ updated: 1, groupsShared: 2, repair: [] });
  });

  it('signale les profils à réappairer : ils appartenaient à un autre gestionnaire', async () => {
    const { service } = setup(
      [
        { id: 'p1', name: 'Rihab', ownerId: 'm2', owner: { role: 'MANAGER' } },
        { id: 'p2', name: 'Salim', ownerId: null, owner: null },
      ],
      users,
    );
    const r = await service.assign({ profileIds: ['p1', 'p2'], ownerId: 'm1' }, admin);
    expect(r.repair).toEqual(['Rihab']);
  });

  it('rend les profils à l’administration', async () => {
    const { service, prisma } = setup([{ id: 'p1', name: 'Rihab', ownerId: 'm1', owner: { role: 'MANAGER' } }], users);
    await service.assign({ profileIds: ['p1'], ownerId: null, shareGroups: true }, admin);
    expect(prisma.profile.updateMany.mock.calls[0][0].data).toEqual({ ownerId: null });
    expect(prisma.groupAccess.upsert).not.toHaveBeenCalled();
  });

  it('refuse un administrateur ou un compte désactivé comme destinataire', async () => {
    const { service } = setup([{ id: 'p1', name: 'Rihab', ownerId: null, owner: null }], users);
    await expect(service.assign({ profileIds: ['p1'], ownerId: 'a1' }, admin)).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.assign({ profileIds: ['p1'], ownerId: 'off' }, admin)).rejects.toBeInstanceOf(BadRequestException);
  });
});
