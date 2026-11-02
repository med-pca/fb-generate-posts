import { GroupTasksService } from './group-tasks.service';

const NOW = new Date('2026-11-02T12:00:00Z');
const moderator = { id: 'mod', name: 'Modo', moderatorPaused: false, moderatorSpam: true };

function setup(mod = moderator) {
  const prisma: any = {
    group: {
      findMany: jest.fn(async () => [
        { id: 'g1', name: 'Tasty', url: 'https://facebook.com/groups/1', profiles: [{ profile: { name: 'Salim', facebookName: null, facebookUserId: '111' } }] },
        { id: 'g2', name: 'Vide', url: 'https://facebook.com/groups/2', profiles: [] },
      ]),
      findFirst: jest.fn(async () => ({ id: 'g1', name: 'Tasty', profiles: [{ profile: { id: 'p1', name: 'Salim', facebookUserId: '111' } }] })),
      updateMany: jest.fn(),
      update: jest.fn(),
    },
    postTarget: { findFirst: jest.fn(async () => ({ id: 't1', postId: 'post1' })), update: jest.fn() },
    activityLog: { create: jest.fn() },
  };
  const verify: any = { moderator: jest.fn(async () => mod) };
  return { svc: new GroupTasksService(prisma, verify), prisma };
}

describe('Spam potentiel — sortir les posts de nos profils', () => {
  it('ne donne que les groupes où nos profils sont membres, avec leur identifiant', async () => {
    const { svc, prisma } = setup();
    const r = await svc.claimSpam('ext', 3, null, NOW);
    expect(r.tasks).toHaveLength(1);
    expect(r.tasks[0].members).toEqual([{ facebookUserId: '111', name: 'Salim' }]);
    expect(prisma.group.updateMany.mock.calls[0][0].where.id.in).toEqual(['g1']);
  });

  it('spam désactivé : aucune tâche', async () => {
    const { svc } = setup({ ...moderator, moderatorSpam: false });
    expect((await svc.claimSpam('ext', 3, null, NOW)).tasks).toEqual([]);
  });

  it('accepte nos posts (revérifiés), signale ceux d’inconnus', async () => {
    const { svc, prisma } = setup();
    const r = await svc.reportSpam('g1', { profileExternalId: 'ext', outcome: 'done', released: [{ facebookUserId: '111' }, { facebookUserId: '999' }] }, null, NOW);
    expect(r).toEqual({ groupId: 'g1', released: 1, matched: 1, refused: 1 });
    expect(prisma.postTarget.update.mock.calls[0][0].data).toMatchObject({ approvalPendingSince: null, verifyStatus: null });
    expect(prisma.activityLog.create.mock.calls.map((c: any) => c[0].data.eventType)).toEqual(['SPAM_POST_RELEASED', 'SPAM_MEMBER_MISMATCH']);
    expect(prisma.group.update.mock.calls[0][0].data).toMatchObject({ spamCheckedAt: NOW, spamClaimedUntil: null });
  });

  it('pas administrateur : le groupe n’est pas revu avant une semaine', async () => {
    const { svc, prisma } = setup();
    await svc.reportSpam('g1', { profileExternalId: 'ext', outcome: 'no_permission' }, null, NOW);
    const until = prisma.group.update.mock.calls[0][0].data.spamClaimedUntil as Date;
    expect(Math.round((until.getTime() - NOW.getTime()) / 86_400_000)).toBe(7);
  });
});
