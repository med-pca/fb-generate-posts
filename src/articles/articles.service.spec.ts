import { ConflictException } from '@nestjs/common';
import { ArticlesService } from './articles.service';

function setup(article: Record<string, unknown>) {
  const prisma: any = {
    article: {
      findFirst: jest.fn(async () => ({ id: 'a1' })),
      findUnique: jest.fn(async () => article),
    },
    group: { findMany: jest.fn(async () => [{ categoryId: 'cat' }]) },
    post: { upsert: jest.fn((args: any) => args) },
    $transaction: jest.fn(async (ops: any[]) => ops),
  };
  return { service: new ArticlesService(prisma), prisma };
}
const dto = { groupIds: ['g1'], delayMin: 10, delayMax: 10 };
const article = {
  id: 'a1',
  title: 'Couscous',
  articleUrl: 'https://exemple.test/couscous',
  coverImageUrl: null,
  hashtags: [],
  captions: [{ text: 'Un régal', angle: 'wordpress' }],
  archivedAt: null,
};

describe('ArticlesService.generatePosts', () => {
  it('refuse un article archivé : il a déjà servi', async () => {
    const { service, prisma } = setup({ ...article, archivedAt: new Date() });
    await expect(service.generatePosts('a1', dto)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(prisma.post.upsert).not.toHaveBeenCalled();
  });

  it('crée des posts liés aux seuls groupes, sans profil', async () => {
    const { service, prisma } = setup(article);
    await service.generatePosts('a1', dto);
    const [[{ create }]] = prisma.post.upsert.mock.calls;
    expect(create.profileId).toBeNull();
    expect(create.externalId).toBe('a1:open:0');
    expect(create.targets.create).toEqual([{ groupId: 'g1' }]);
  });
});
