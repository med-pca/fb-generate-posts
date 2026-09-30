import { BadRequestException, ConflictException } from '@nestjs/common';
import { ResetService } from './reset.service';

function setup(activeJobs = 0) {
  const ops: Array<[string, any]> = [];
  const record = (name: string) => jest.fn((args: any = {}) => ops.push([name, args]));
  const prisma: any = {
    post: {
      count: jest.fn(async ({ where }: any = {}) => (where ? 8 : 12)),
      deleteMany: record('post.deleteMany'),
    },
    postTarget: { count: jest.fn(async () => 4) },
    article: {
      count: jest.fn(async ({ where }: any = {}) => (where ? 3 : 5)),
      deleteMany: record('article.deleteMany'),
      updateMany: record('article.updateMany'),
    },
    publicationJob: {
      count: jest.fn(async ({ where }: any = {}) => (where ? activeJobs : 7)),
      deleteMany: record('publicationJob.deleteMany'),
    },
    activityLog: { create: record('activityLog.create') },
    $transaction: jest.fn(async (list: any[]) => list),
  };
  return { service: new ResetService(prisma), ops };
}
const admin: any = { username: 'admin', role: 'ADMIN' };
const names = (ops: Array<[string, any]>) => ops.map(([name]) => name);

describe('ResetService — effacer ce qu’on choisit', () => {
  it('à blanc : les chiffres, et ce que le choix ferait', async () => {
    const { service, ops } = setup();
    const r: any = await service.reset({ dryRun: true, articles: true, articlePosts: 'keep' }, admin);
    expect(r).toMatchObject({ posts: 12, postsFromArticles: 8, standalonePosts: 4, articles: 5, archivedArticles: 3 });
    expect(r.plan).toEqual({ posts: 0, articles: 5, postsDetached: 8, articlesUnarchived: 0 });
    expect(ops).toEqual([]);
  });

  it('exige un choix, et le mot de confirmation', async () => {
    const { service } = setup();
    await expect(service.reset({ confirm: 'EFFACER' }, admin)).rejects.toThrow('Choisissez');
    await expect(service.reset({ posts: true, confirm: 'oui' }, admin)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('les posts seulement : les articles restent (et peuvent être désarchivés)', async () => {
    const { service, ops } = setup();
    await service.reset({ posts: true, unarchive: true, confirm: 'EFFACER' }, admin);
    expect(names(ops)).toEqual(['post.deleteMany', 'publicationJob.deleteMany', 'article.updateMany', 'activityLog.create']);
    expect(ops[0][1]).toEqual({});
    expect(ops[2][1]).toEqual({ where: { archivedAt: { not: null } }, data: { archivedAt: null } });
  });

  it('les articles seulement : il faut dire quoi faire de leurs posts', async () => {
    const { service } = setup();
    await expect(service.reset({ articles: true, confirm: 'EFFACER' }, admin)).rejects.toThrow('supprimer aussi ou les garder');
  });

  it('articles seulement, posts gardés : aucun post supprimé', async () => {
    const { service, ops } = setup();
    const r: any = await service.reset({ articles: true, articlePosts: 'keep', confirm: 'EFFACER' }, admin);
    expect(names(ops)).toEqual(['article.deleteMany', 'activityLog.create']);
    expect(r.deleted).toMatchObject({ posts: 0, articles: 5, postsDetached: 8 });
  });

  it('articles seulement, posts supprimés aussi : seulement ceux qui en viennent', async () => {
    const { service, ops } = setup();
    await service.reset({ articles: true, articlePosts: 'delete', confirm: 'EFFACER' }, admin);
    expect(names(ops)).toEqual(['post.deleteMany', 'publicationJob.deleteMany', 'article.deleteMany', 'activityLog.create']);
    expect(ops[0][1]).toEqual({ where: { articleId: { not: null } } });
  });

  it('refuse de supprimer des posts pendant une publication, sauf à forcer', async () => {
    const { service } = setup(2);
    await expect(service.reset({ posts: true, confirm: 'EFFACER' }, admin)).rejects.toBeInstanceOf(ConflictException);
    await expect(service.reset({ posts: true, confirm: 'EFFACER', force: true }, admin)).resolves.toMatchObject({ dryRun: false });
    // Supprimer des articles en gardant leurs posts ne touche à aucun lot.
    await expect(service.reset({ articles: true, articlePosts: 'keep', confirm: 'EFFACER' }, admin)).resolves.toMatchObject({ dryRun: false });
  });
});
