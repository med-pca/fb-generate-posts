import { RepeatService } from './repeat.service';

function setup(rows: any[]) {
  const tx = {
    $queryRaw: jest.fn(async () => rows),
    publicationTrace: { createMany: jest.fn(async () => ({ count: rows.length })) },
    activityLog: { createMany: jest.fn(async () => ({ count: rows.length })) },
  };
  const prisma = { $transaction: jest.fn(async (fn: any) => fn(tx)) };
  const service = new RepeatService(prisma as any, { get: () => '0' } as any);
  return { service, tx };
}

describe('RepeatService (duplication des contenus)', () => {
  it('ne trace rien quand aucune publication n’est due', async () => {
    const { service, tx } = setup([]);
    expect(await service.requeueDue()).toEqual([]);
    expect(tx.publicationTrace.createMany).not.toHaveBeenCalled();
    expect(tx.activityLog.createMany).not.toHaveBeenCalled();
  });

  it('trace chaque republication avec l’ancienne adresse et le rang', async () => {
    const row = { id: 't1', postId: 'p1', groupId: 'g1', facebookUrl: 'https://facebook.com/groups/1/posts/9', round: 1, times: 3, title: 'Tarte', groupName: 'Recettes' };
    const { service, tx } = setup([row]);
    await service.requeueDue();
    const trace = (tx.publicationTrace.createMany.mock.calls[0] as any)[0].data[0];
    expect(trace).toMatchObject({ postTargetId: 't1', kind: 'REPEAT_QUEUED', facebookUrl: row.facebookUrl, detail: 'publication 2 sur 3' });
    const log = (tx.activityLog.createMany.mock.calls[0] as any)[0].data[0];
    expect(log.eventType).toBe('POST_REPEAT_QUEUED');
    expect(log.message).toContain('publication 2 sur 3');
  });

  it('la requête lit la règle du post, sinon le réglage global, 1 par défaut', async () => {
    const { service, tx } = setup([]);
    await service.requeueDue();
    const sql = (tx.$queryRaw.mock.calls[0] as any)[0].strings.join('?');
    expect(sql).toContain('COALESCE(p.repeat_times, s.repeat_times, 1)');
    expect(sql).toContain('SKIP LOCKED');
  });
});
