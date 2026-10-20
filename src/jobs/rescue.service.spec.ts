import { RescueService } from './rescue.service';
import { LogsService } from '../logs/logs.service';

/** L'auteur a abandonné le lien : le sauvetage part tout de suite, sans
 * attendre la clôture de son lot. */
describe('RescueService.authorGaveUp', () => {
  const target = (over: Record<string, unknown> = {}) => ({
    id: 't1',
    linkUpdatedAt: null,
    rescueStatus: null,
    facebookUrl: 'https://www.facebook.com/groups/1/posts/2',
    approvalPendingSince: null,
    post: { url: 'https://site.test/a', noComment: false },
    ...over,
  });
  function setup(t: unknown) {
    const prisma: any = { publicationJobItem: { findFirst: jest.fn(async () => (t ? { postTarget: t } : null)) } };
    const service = new RescueService(prisma);
    const request = jest.spyOn(service, 'request').mockResolvedValue(true);
    return { service, request };
  }

  it('demande le sauvetage aussitôt', async () => {
    const { service, request } = setup(target());
    expect(await service.authorGaveUp('job1', 'post1')).toBe(true);
    expect(request).toHaveBeenCalledWith('t1', expect.stringContaining('3 essais'), expect.any(Date));
  });

  it.each([
    ['lien déjà posé', { linkUpdatedAt: new Date() }],
    ['sauvetage déjà en cours', { rescueStatus: 'pending' }],
    ['adresse du post inconnue', { facebookUrl: null }],
    ['en attente de validation', { approvalPendingSince: new Date() }],
    ['post sans lien d’article', { post: { url: null, noComment: false } }],
    ['post sans commentaire', { post: { url: 'https://site.test/a', noComment: true } }],
  ])('rien à sauver : %s', async (_label, over) => {
    const { service, request } = setup(target(over));
    expect(await service.authorGaveUp('job1', 'post1')).toBe(false);
    expect(request).not.toHaveBeenCalled();
  });
});

describe('LogsService — le log d’échec du lien déclenche le sauvetage', () => {
  function setup(job: unknown) {
    const prisma: any = {
      activityLog: { create: jest.fn(async ({ data }: any) => ({ id: 'log1', ...data })) },
      publicationJob: { findFirst: jest.fn(async () => job) },
    };
    const rescue: any = { authorGaveUp: jest.fn(async () => true) };
    return { service: new LogsService(prisma, rescue), rescue };
  }

  it('WORKER_LINK_FAILED avec son lot et son post : sauvetage demandé', async () => {
    const { service, rescue } = setup({ id: 'job1' });
    await service.create({ eventType: 'WORKER_LINK_FAILED', level: 'ERROR', message: 'could not edit', jobId: 'job1', postId: 'post1' } as any);
    expect(rescue.authorGaveUp).toHaveBeenCalledWith('job1', 'post1');
  });

  it('un autre log, ou le lot d’un autre compte : rien', async () => {
    const other = setup({ id: 'job1' });
    await other.service.create({ eventType: 'WORKER_LINK_PLACED', message: 'ok', jobId: 'job1', postId: 'post1' } as any);
    expect(other.rescue.authorGaveUp).not.toHaveBeenCalled();
    const foreign = setup(null);
    await foreign.service.create({ eventType: 'WORKER_LINK_FAILED', message: 'x', jobId: 'job9', postId: 'post1' } as any);
    expect(foreign.rescue.authorGaveUp).not.toHaveBeenCalled();
  });
});
