import { BadRequestException } from '@nestjs/common';
import { GroupsService } from './groups.service';
import { CategoriesService } from '../categories/categories.service';

function setup(current: { categoryId: string | null } = { categoryId: null }) {
  const prisma: any = {
    profile: { findFirst: jest.fn(async () => ({ id: 'p1' })) },
    group: {
      findFirst: jest.fn(async () => ({ id: 'g1' })),
      findUnique: jest.fn(async () => current),
      create: jest.fn(async ({ data }: any) => data),
      update: jest.fn(async ({ data }: any) => data),
    },
    category: {
      findUnique: jest.fn(async ({ where }: any) =>
        where.id === 'cat' ? { id: 'cat', name: 'Recettes' } : null,
      ),
    },
  };
  const service = new GroupsService(prisma, new CategoriesService(prisma));
  return { service, prisma };
}
const group = { name: 'G', url: 'https://facebook.com/groups/1' };

describe('GroupsService — catégorie obligatoire', () => {
  it('crée un groupe dans sa catégorie', async () => {
    const { service } = setup();
    await expect(
      service.create('p1', { ...group, categoryId: 'cat' }, null),
    ).resolves.toMatchObject({ categoryId: 'cat' });
  });

  it('refuse un groupe sans catégorie', async () => {
    const { service } = setup();
    await expect(
      service.create('p1', { ...group, categoryId: '' }, null),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('refuse de retirer la catégorie à la modification', async () => {
    const { service } = setup({ categoryId: 'cat' });
    await expect(
      service.update('g1', { categoryId: '' }, null),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('exige de ranger un ancien groupe quand on le modifie', async () => {
    const { service } = setup({ categoryId: null });
    await expect(
      service.update('g1', { name: 'Nouveau nom' }, null),
    ).rejects.toThrow('catégorie');
    await expect(
      service.update('g1', { name: 'Nouveau nom', categoryId: 'cat' }, null),
    ).resolves.toMatchObject({ categoryId: 'cat' });
  });

  it('laisse activer ou désactiver un ancien groupe sans catégorie', async () => {
    const { service } = setup({ categoryId: null });
    await expect(
      service.update('g1', { status: 'INACTIVE' }, null),
    ).resolves.toMatchObject({ status: 'INACTIVE' });
  });
});

describe('GroupsService.removePosts — vider un groupe de ses posts', () => {
  function harness() {
    const prisma: any = {
      group: { findFirst: jest.fn(async () => ({ id: 'g1' })) },
      postTarget: {
        findMany: jest.fn(async () => [
          { id: 't1', postId: 'seul-ici' },
          { id: 't2', postId: 'partage' },
        ]),
        count: jest.fn(async () => 3),
        deleteMany: jest.fn((args: any) => args),
      },
      post: {
        findMany: jest.fn(async () => [{ id: 'seul-ici' }]),
        deleteMany: jest.fn((args: any) => args),
      },
      activityLog: { create: jest.fn((args: any) => args) },
      $transaction: jest.fn(async (ops: any[]) => ops),
    };
    const service = new GroupsService(prisma, new CategoriesService(prisma));
    return { service, prisma };
  }

  it('compte sans rien toucher en mode à blanc', async () => {
    const { service, prisma } = harness();
    const report = await service.removePosts('g1', null, true);
    expect(report).toEqual({
      dryRun: true,
      removedFromGroup: 2,
      deletedPosts: 1,
      stillInOtherGroups: 1,
      kept: 3,
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('ne retire que les cibles en attente, et ne supprime que les posts sans autre groupe', async () => {
    const { service, prisma } = harness();
    await service.removePosts('g1', null);
    const [{ where }] = prisma.postTarget.findMany.mock.calls[0];
    expect(where.groupId).toBe('g1');
    // Publié, consommé ou réservé par un job vivant : jamais retiré.
    expect(JSON.stringify(where.OR)).not.toMatch(/PUBLISHED|CONSUMED/);
    expect(prisma.postTarget.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ['t1', 't2'] } },
    });
    expect(prisma.post.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ['seul-ici'] }, targets: { none: {} } },
    });
    expect(prisma.activityLog.create.mock.calls[0][0].data.eventType).toBe(
      'GROUP_POSTS_REMOVED',
    );
  });

  it('un compte ne retire que ses propres posts d’un groupe partagé', async () => {
    const { service, prisma } = harness();
    const sofia: any = { id: 'u1', role: 'MANAGER' };
    await service.removePosts('g1', sofia, true);
    const [{ where }] = prisma.postTarget.findMany.mock.calls[0];
    expect(where.post).toEqual({
      OR: [{ ownerId: 'u1' }, { profile: { ownerId: 'u1' } }],
    });
  });
});

describe('GroupsService — adhésions', () => {
  function harness(current: string) {
    const logs: any[] = [];
    const prisma: any = {
      group: { findFirst: jest.fn(async () => ({ id: 'g1' })) },
      profile: { findFirst: jest.fn(async () => ({ id: 'p1', status: 'ACTIVE' })) },
      profileGroup: {
        findUnique: jest.fn(async () => ({ id: 'pg1', joinStatus: current })),
        update: jest.fn(async ({ data }: any) => ({ joinStatus: data.joinStatus, joinCheckedAt: data.joinCheckedAt, joinError: null })),
      },
      activityLog: { create: jest.fn(async ({ data }: any) => logs.push(data)) },
    };
    return { service: new GroupsService(prisma, new CategoriesService(prisma)), prisma, logs };
  }

  it('l’admin corrige à la main une demande acceptée depuis : « Rejoint »', async () => {
    const { service, prisma, logs } = harness('REQUESTED');
    await expect(service.setJoinStatus('g1', 'p1', 'JOINED', { username: 'admin' } as any)).resolves.toMatchObject({ joinStatus: 'JOINED' });
    expect(prisma.profileGroup.update.mock.calls[0][0].data.joinStatus).toBe('JOINED');
    expect(logs[0]).toMatchObject({ eventType: 'GROUP_JOIN_UPDATED' });
    expect(logs[0].message).toMatch(/à la main : REQUESTED → JOINED/);
  });

  it('une revérification qui confirme l’état connu ne remplit pas les journaux', async () => {
    const { service, prisma, logs } = harness('REQUESTED');
    prisma.profile.findFirst = jest.fn(async () => ({ id: 'p1', status: 'ACTIVE' }));
    await service.updateJoinStatus('ext-1', 'g1', { joinStatus: 'REQUESTED' } as any);
    expect(prisma.profileGroup.update).toHaveBeenCalled();
    expect(logs).toEqual([]);
    await service.updateJoinStatus('ext-1', 'g1', { joinStatus: 'JOINED' } as any);
    expect(logs[0].message).toMatch(/REQUESTED → JOINED/);
  });
});

import { groupFilters } from './groups.service';

describe('groupFilters — la barre de filtres de la page Groupes', () => {
  const scope = { ownerId: 'u1' };
  it('combine la portée et chaque filtre choisi', () => {
    const and = groupFilters({ search: 'recette', categoryId: 'none', status: 'ACTIVE', language: 'en', profileId: 'p1', join: 'pending', stock: 'with' }, scope);
    expect(and[0]).toBe(scope);
    expect(and).toEqual(expect.arrayContaining([
      { categoryId: null },
      { status: 'ACTIVE' },
      { language: 'en' },
      { profiles: { some: { profileId: 'p1', status: 'ACTIVE' } } },
      { profiles: { some: { status: 'ACTIVE', joinStatus: { in: ['REQUESTED', 'QUESTIONS'] } } } },
    ]));
    expect(JSON.stringify(and)).toContain('"contains":"recette"');
  });
  it('sans filtre : seulement la portée', () => {
    expect(groupFilters({}, scope)).toEqual([scope]);
  });
});
