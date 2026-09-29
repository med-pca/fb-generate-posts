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
