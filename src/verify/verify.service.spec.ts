import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { VerifyService } from './verify.service';

const NOW = new Date('2026-10-02T12:00:00Z');

function setup(opts: { moderator?: boolean; republishCount?: number; verifyAttempts?: number; noUrl?: boolean } = {}) {
  const target = {
    id: 't1',
    status: 'PUBLISHED',
    postId: 'p1',
    groupId: 'g1',
    verifyAttempts: opts.verifyAttempts ?? 0,
    republishCount: opts.republishCount ?? 0,
    facebookUrl: 'https://www.facebook.com/groups/1/posts/9' as string | null,
    post: { title: 'Tajine' },
    group: { name: 'Recettes' },
  };
  if (opts.noUrl) target.facebookUrl = null;
  const prisma: any = {
    profile: {
      findFirst: jest.fn(async () => ({
        id: 'm1',
        name: 'Modo',
        isModerator: opts.moderator ?? true,
        status: 'ACTIVE',
      })),
      update: jest.fn(async ({ data }) => ({ id: 'm1', name: 'Modo', ...data })),
    },
    postTarget: {
      findFirst: jest.fn(async () => target),
      findMany: jest.fn(async () => [
        {
          id: 't1',
          publishedAt: new Date('2026-10-02T10:00:00Z'),
          republishCount: 0,
          post: { id: 'p1', title: 'Tajine', description: 'Un tajine', url: 'https://site/tajine' },
          group: { id: 'g1', name: 'Recettes', url: 'https://facebook.com/groups/1', externalId: '1' },
          jobItems: [
            {
              externalPostUrl: 'https://facebook.com/groups/1/posts/9',
              job: { profile: { name: 'Salim', externalId: 'x' } },
            },
          ],
        },
      ]),
      update: jest.fn(async () => ({})),
      updateMany: jest.fn(async () => ({ count: 1 })),
      count: jest.fn(async () => 3),
    },
    activityLog: { create: jest.fn(async () => ({})) },
    publicationTrace: { create: jest.fn(async (args: any) => args) },
    $transaction: jest.fn(async (ops: unknown[]) => ops),
  };
  const config: any = { get: () => undefined };
  return { service: new VerifyService(prisma, config), prisma };
}

describe('VerifyService', () => {
  it('refuse un profil qui n’est pas vérificateur', async () => {
    const { service } = setup({ moderator: false });
    await expect(service.claim('x', 5, null, NOW)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('ne réserve que des posts publiés depuis 30 min, et les verrouille', async () => {
    const { service, prisma } = setup();
    const res = await service.claim('m', 5, null, NOW);
    const where = prisma.postTarget.findMany.mock.calls[0][0].where;
    expect(where.status).toBe('PUBLISHED');
    expect(where.publishedAt.lte).toEqual(new Date('2026-10-02T11:30:00Z'));
    // Sans adresse aussi : le vérificateur la cherche dans le groupe.
    expect(where.jobItems).toBeUndefined();
    expect(res.tasks[0]).toMatchObject({
      targetId: 't1',
      postUrl: 'https://facebook.com/groups/1/posts/9',
      linkUrl: 'https://site/tajine',
      author: 'Salim',
    });
    expect(prisma.postTarget.updateMany.mock.calls[0][0].data.verifyClaimedUntil).toEqual(
      new Date('2026-10-02T12:20:00Z'),
    );
  });

  it('ok → vérifié', async () => {
    const { service, prisma } = setup();
    expect(await service.report('t1', { profileExternalId: 'm', outcome: 'ok' }, null, NOW)).toEqual({
      targetId: 't1',
      result: 'verified',
    });
    expect(prisma.postTarget.update.mock.calls[0][0].data).toMatchObject({ verifyStatus: 'OK', verifiedAt: NOW });
  });

  it('post introuvable → remis dans la file', async () => {
    const { service, prisma } = setup();
    const res = await service.report('t1', { profileExternalId: 'm', outcome: 'missing_post' }, null, NOW);
    expect(res.result).toBe('requeued');
    const data = prisma.postTarget.update.mock.calls[0][0].data;
    expect(data).toMatchObject({
      status: 'AVAILABLE',
      publishedAt: null,
      commentedAt: null,
      linkUpdatedAt: null,
      verifyStatus: 'REPUBLISHED',
      republishCount: { increment: 1 },
    });
    // Le constat, puis la remise en file : les deux dans le journal, avec le lien.
    const events = prisma.activityLog.create.mock.calls.map((c: any) => c[0].data);
    expect(events.map((e: any) => e.eventType)).toEqual(['VERIFY_MISSING_POST', 'VERIFY_REPUBLISH']);
    expect(events[0]).toMatchObject({ facebookUrl: 'https://www.facebook.com/groups/1/posts/9', level: 'ERROR' });
  });

  it('sans lien et supprimé → republié ; non supprimé → à traiter, sans doublon', async () => {
    const a = setup();
    expect(
      (await a.service.report('t1', { profileExternalId: 'm', outcome: 'missing_link', deleted: true }, null, NOW))
        .result,
    ).toBe('requeued');

    const b = setup();
    expect(
      (await b.service.report('t1', { profileExternalId: 'm', outcome: 'missing_link', deleted: false }, null, NOW))
        .result,
    ).toBe('needs_action');
    const data = b.prisma.postTarget.update.mock.calls[0][0].data;
    expect(data.verifyStatus).toBe('NEEDS_ACTION');
    expect(data.status).toBeUndefined();
  });

  it('republications plafonnées : à traiter', async () => {
    const { service, prisma } = setup({ republishCount: 2 });
    const res = await service.report('t1', { profileExternalId: 'm', outcome: 'missing_post' }, null, NOW);
    expect(res.result).toBe('needs_action');
    expect(prisma.postTarget.update.mock.calls[0][0].data.status).toBeUndefined();
  });

  it('en attente / injoignable → plus tard, puis à traiter', async () => {
    const a = setup();
    await a.service.report('t1', { profileExternalId: 'm', outcome: 'pending' }, null, NOW);
    expect(a.prisma.postTarget.update.mock.calls[0][0].data.verifyClaimedUntil).toEqual(
      new Date('2026-10-02T14:00:00Z'),
    );

    const b = setup({ verifyAttempts: 4 });
    const res = await b.service.report('t1', { profileExternalId: 'm', outcome: 'unreachable' }, null, NOW);
    expect(res.result).toBe('needs_action');
  });

  it('refuse un résultat inconnu', async () => {
    const { service } = setup();
    await expect(
      service.report('t1', { profileExternalId: 'm', outcome: 'bof' as any }, null, NOW),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('l’admin peut republier au-delà du plafond', async () => {
    const { service } = setup({ republishCount: 5 });
    expect((await service.resolve('t1', 'republish', null, NOW)).result).toBe('requeued');
  });

  it('trace chaque constat : supprimé, puis remis en file avec l’ancienne adresse', async () => {
    const { service, prisma } = setup();
    await service.report('t1', { profileExternalId: 'm', outcome: 'missing_link', deleted: true, detail: '« . »' }, null, NOW);
    const kinds = prisma.publicationTrace.create.mock.calls.map((c: any) => c[0].data.kind);
    expect(kinds).toEqual(['VERIFY_MISSING_LINK', 'DELETED', 'REQUEUED']);
    const requeued = prisma.publicationTrace.create.mock.calls[2][0].data;
    expect(requeued.facebookUrl).toBe('https://www.facebook.com/groups/1/posts/9');
    expect(prisma.postTarget.update.mock.calls.at(-1)[0].data.facebookUrl).toBeNull();
  });

  it('garde l’adresse retrouvée dans le groupe par le vérificateur', async () => {
    const { service, prisma } = setup({ noUrl: true });
    await service.report(
      't1',
      { profileExternalId: 'm', outcome: 'ok', postUrl: 'https://m.facebook.com/groups/1/posts/77/?__cft__=x' },
      null,
      NOW,
    );
    expect(prisma.postTarget.update.mock.calls[0][0].data).toEqual({
      facebookUrl: 'https://www.facebook.com/groups/1/posts/77',
    });
    expect(prisma.publicationTrace.create.mock.calls[0][0].data).toMatchObject({ kind: 'URL_FOUND', actor: 'Modo' });
  });

  it('donne une tâche sans adresse : à chercher dans le groupe', async () => {
    const { service, prisma } = setup();
    prisma.postTarget.findMany.mockResolvedValueOnce([
      {
        id: 't2',
        publishedAt: NOW,
        republishCount: 0,
        facebookUrl: null,
        post: { id: 'p2', title: 'Soupe', description: 'Une soupe', url: 'https://site/soupe' },
        group: { id: 'g1', name: 'Recettes', url: 'https://facebook.com/groups/1', externalId: '1' },
        jobItems: [{ externalPostUrl: null, job: { profile: { name: 'Salim', externalId: 'x' } } }],
      },
    ]);
    const res = await service.claim('m', 5, null, NOW);
    expect(res.tasks[0]).toMatchObject({ postUrl: null, group: { url: 'https://facebook.com/groups/1' }, author: 'Salim' });
  });

  it('un modérateur suspendu par l’admin ne reçoit rien', async () => {
    const { service, prisma } = setup();
    prisma.profile.findFirst.mockResolvedValueOnce({ id: 'm1', name: 'Modo', isModerator: true, status: 'ACTIVE', moderatorPaused: true });
    const r = await service.claim('m', 5, null, NOW);
    expect(r).toMatchObject({ tasks: [], paused: true });
    expect(prisma.postTarget.findMany).not.toHaveBeenCalled();
  });
});
