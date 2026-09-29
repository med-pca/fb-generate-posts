import { ConflictException, NotFoundException } from '@nestjs/common';
import { CategoriesService, categoryName } from './categories.service';

function setup(existing: Array<{ id: string; name: string }> = []) {
  const prisma: any = {
    category: {
      findFirst: jest.fn(
        async ({ where }: any) =>
          existing.find(
            (c) =>
              c.name.toLowerCase() === where.name.equals.toLowerCase() &&
              c.id !== where.id?.not,
          ) ?? null,
      ),
      findUnique: jest.fn(
        async ({ where }: any) =>
          existing.find((c) => c.id === where.id) ?? null,
      ),
      create: jest.fn(async ({ data }: any) => ({ id: 'new', ...data })),
    },
  };
  return { service: new CategoriesService(prisma), prisma };
}

describe('CategoriesService', () => {
  it('nettoie le nom', () => {
    expect(categoryName('  Recettes   du  monde ')).toBe('Recettes du monde');
    expect(() => categoryName('   ')).toThrow();
  });

  it('refuse un doublon, quelle que soit la casse', async () => {
    const { service } = setup([{ id: 'c1', name: 'Recettes' }]);
    await expect(service.create('recettes')).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('crée une catégorie nouvelle', async () => {
    const { service } = setup();
    await expect(service.create(' Sport ')).resolves.toMatchObject({
      name: 'Sport',
    });
  });

  it('résout « aucune », « inchangée » et une catégorie inconnue', async () => {
    const { service } = setup([{ id: 'c1', name: 'Recettes' }]);
    await expect(service.resolve(undefined)).resolves.toBeUndefined();
    await expect(service.resolve('')).resolves.toBeNull();
    await expect(service.resolve('c1')).resolves.toBe('c1');
    await expect(service.resolve('zz')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
