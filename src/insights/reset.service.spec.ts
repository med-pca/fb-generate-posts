import { BadRequestException, ConflictException } from '@nestjs/common';
import { ResetService } from './reset.service';

function setup(activeJobs = 0) {
  const calls: string[] = [];
  const prisma: any = {
    post: { count: jest.fn(async () => 12), deleteMany: jest.fn(() => calls.push('posts')) },
    postTarget: { count: jest.fn(async ({ where }: any = {}) => (where ? 4 : 30)) },
    article: { count: jest.fn(async () => 5), deleteMany: jest.fn(() => calls.push('articles')) },
    publicationJob: {
      count: jest.fn(async ({ where }: any = {}) => (where ? activeJobs : 7)),
      deleteMany: jest.fn(() => calls.push('jobs')),
    },
    sourceIngest: { count: jest.fn(async () => 2) },
    activityLog: { create: jest.fn((args: any) => calls.push(args.data.eventType)) },
    $transaction: jest.fn(async (ops: any[]) => ops),
  };
  return { service: new ResetService(prisma), prisma, calls };
}
const admin: any = { username: 'admin', role: 'ADMIN' };

describe('ResetService — repartir de zéro', () => {
  it('à blanc : compte sans rien toucher', async () => {
    const { service, calls } = setup();
    expect(await service.reset({ dryRun: true }, admin)).toMatchObject({
      dryRun: true, posts: 12, articles: 5, jobs: 7, published: 4,
    });
    expect(calls).toEqual([]);
  });

  it('exige le mot de confirmation', async () => {
    const { service } = setup();
    await expect(service.reset({ confirm: 'oui' }, admin)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('refuse pendant qu’un lot se publie, sauf à forcer', async () => {
    const { service } = setup(2);
    await expect(service.reset({ confirm: 'EFFACER' }, admin)).rejects.toBeInstanceOf(ConflictException);
    await expect(service.reset({ confirm: 'EFFACER', force: true }, admin)).resolves.toMatchObject({ dryRun: false });
  });

  it('supprime lots, posts puis articles, et le journalise', async () => {
    const { service, calls } = setup();
    await service.reset({ confirm: 'EFFACER' }, admin);
    expect(calls).toEqual(['jobs', 'posts', 'articles', 'ADMIN_RESET']);
  });
});
