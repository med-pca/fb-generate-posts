import { BadRequestException, ConflictException } from '@nestjs/common';
import { JobStatus, JoinStatus, TargetStatus } from '@prisma/client';
import { JobsService } from './jobs.service';

const CLAIM_EXPIRES = new Date('2026-09-14T12:00:00.000Z');

type MutableItem = {
  id: string;
  jobId: string;
  postId: string;
  postTargetId: string;
  status: TargetStatus;
  job: { claimExpiresAt: Date };
  postTarget: { claimExpiresAt: Date | null };
};

function makeItem(overrides: Partial<MutableItem> = {}): MutableItem {
  return {
    id: 'item_1',
    jobId: 'job_1',
    postId: 'post_1',
    postTargetId: 'target_1',
    status: TargetStatus.CLAIMED,
    job: { claimExpiresAt: CLAIM_EXPIRES },
    postTarget: { claimExpiresAt: CLAIM_EXPIRES },
    ...overrides,
  };
}

/** Prisma réduit à ce que le cycle de vie touche réellement. Les posts de ces
 * scénarios n'ont pas d'URL : la phase « commentaire puis lien » ne s'ouvre
 * donc pas, et `complete` tranche sur les seuls statuts. */
function makeHarness(item: MutableItem | null, jobItems: any[] = []) {
  const items = jobItems.map((jobItem) => ({
    postId: 'post_1',
    commentedAt: null,
    linkUpdatedAt: null,
    post: { url: null },
    ...jobItem,
  }));
  const tx: any = {
    publicationJobItem: {
      update: jest.fn(async ({ data }: any) => ({ ...item, ...data })),
    },
    postTarget: { update: jest.fn(async () => ({})) },
    publicationJob: { update: jest.fn(async ({ data }: any) => data) },
    activityLog: { create: jest.fn(async () => ({})) },
    publicationTrace: { create: jest.fn(async (args: any) => args) },
  };
  const prisma: any = {
    publicationJobItem: { findUnique: jest.fn(async () => item) },
    publicationJob: {
      // Le garde de portée interroge `findFirst` avant chaque étape.
      findFirst: jest.fn(async () => ({ id: 'job_1' })),
      findUnique: jest.fn(async () => ({
        id: 'job_1',
        profileId: 'profile_1',
        groupId: 'group_1',
        items,
      })),
      update: jest.fn(async ({ data }: any) => data),
    },
    activityLog: { create: jest.fn(async () => ({})) },
    publicationTrace: { create: jest.fn(async (args: any) => args) },
    // L'article d'un post publié est archivé (0 : déjà archivé, ou aucun).
    article: { updateMany: jest.fn(async () => ({ count: 0 })) },
    $transaction: jest.fn(async (cb: any) => cb(tx)),
  };
  const service = new JobsService(prisma, {} as any);
  return { service, prisma, tx };
}

describe('JobsService — archivage de l’article', () => {
  it('archive l’article à la première publication de l’un de ses posts', async () => {
    const { service, prisma } = makeHarness(makeItem());
    prisma.article.updateMany.mockResolvedValue({ count: 1 });
    const publishedAt = '2026-09-14T11:00:00.000Z';
    await service.markPublished('job_1', 'post_1', { publishedAt } as any);
    expect(prisma.article.updateMany).toHaveBeenCalledWith({
      where: { archivedAt: null, posts: { some: { id: 'post_1' } } },
      data: { archivedAt: new Date(publishedAt) },
    });
    expect(prisma.activityLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ eventType: 'ARTICLE_ARCHIVED', postId: 'post_1' }),
    });
  });

  it('ne journalise rien quand l’article l’était déjà', async () => {
    const { service, prisma } = makeHarness(makeItem());
    await service.markPublished('job_1', 'post_1', {} as any);
    expect(prisma.activityLog.create).not.toHaveBeenCalledWith({
      data: expect.objectContaining({ eventType: 'ARTICLE_ARCHIVED' }),
    });
  });
});

describe('JobsService — cycle de vie d’un post', () => {
  it('enchaîne consumed puis published', async () => {
    const item = makeItem();
    const { service, tx } = makeHarness(item);

    await service.markConsumed('job_1', 'post_1');
    // La confirmation suivante voit l’item dans l’état que consumed a laissé.
    item.status = TargetStatus.CONSUMED;
    await service.markPublished('job_1', 'post_1', {
      externalPostUrl: 'https://www.facebook.com/groups/1/posts/2/',
    });

    expect(tx.postTarget.update).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: TargetStatus.PUBLISHED,
          publishedAt: expect.any(Date),
        }),
      }),
    );
    expect(tx.publicationJobItem.update).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: TargetStatus.PUBLISHED,
          externalPostUrl: 'https://www.facebook.com/groups/1/posts/2',
        }),
      }),
    );
    // Traçabilité : l'adresse est gardée sur la publication, et l'historique
    // dit qui l'a publiée.
    expect(tx.postTarget.update.mock.calls.at(-1)[0].data.facebookUrl).toBe(
      'https://www.facebook.com/groups/1/posts/2',
    );
    expect(tx.publicationTrace.create.mock.calls.at(-1)[0].data).toMatchObject({
      kind: 'PUBLISHED',
      facebookUrl: 'https://www.facebook.com/groups/1/posts/2',
      jobId: 'job_1',
    });
  });

  it('accepte published directement depuis CLAIMED', async () => {
    const { service, tx } = makeHarness(makeItem());
    await service.markPublished('job_1', 'post_1', {});
    expect(tx.publicationJobItem.update).toHaveBeenCalled();
  });

  it('est idempotent sur une confirmation répétée', async () => {
    const { service, prisma } = makeHarness(
      makeItem({ status: TargetStatus.PUBLISHED }),
    );
    await service.markPublished('job_1', 'post_1', {});
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('refuse de publier un post déjà en échec', async () => {
    const { service } = makeHarness(makeItem({ status: TargetStatus.FAILED }));
    await expect(service.markPublished('job_1', 'post_1', {})).rejects.toThrow(
      BadRequestException,
    );
  });

  it('refuse une confirmation dont la réservation a été reprise', async () => {
    const { service, prisma } = makeHarness(
      makeItem({
        postTarget: { claimExpiresAt: new Date('2026-09-14T13:00:00.000Z') },
      }),
    );

    await expect(service.markPublished('job_1', 'post_1', {})).rejects.toThrow(
      ConflictException,
    );
    // Le post est peut-être en ligne : l’incident doit rester visible.
    expect(prisma.activityLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          eventType: 'CLAIM_LOST',
          level: 'ERROR',
        }),
      }),
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('refuse une confirmation dont la cible est repartie en AVAILABLE', async () => {
    const { service } = makeHarness(
      makeItem({ postTarget: { claimExpiresAt: null } }),
    );
    await expect(service.markFailed('job_1', 'post_1', 'boom')).rejects.toThrow(
      ConflictException,
    );
  });
});

describe('JobsService — clôture du job', () => {
  it('refuse de clôturer tant qu’un post est seulement consumed', async () => {
    const { service } = makeHarness(null, [
      { status: TargetStatus.PUBLISHED },
      { status: TargetStatus.CONSUMED },
    ]);
    await expect(service.complete('job_1')).rejects.toThrow(
      BadRequestException,
    );
  });

  it('clôture en PARTIALLY_COMPLETED quand un post a échoué', async () => {
    const { service, tx } = makeHarness(null, [
      { status: TargetStatus.PUBLISHED },
      { status: TargetStatus.FAILED, postId: 'post_2' },
    ]);
    await service.complete('job_1');
    expect(tx.publicationJob.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: JobStatus.PARTIALLY_COMPLETED,
        }),
      }),
    );
  });

  it('clôture en FAILED quand tous les posts ont échoué', async () => {
    const { service, tx } = makeHarness(null, [
      { status: TargetStatus.FAILED },
      { status: TargetStatus.FAILED, postId: 'post_2' },
    ]);
    await service.complete('job_1');
    expect(tx.publicationJob.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: JobStatus.FAILED }),
      }),
    );
  });
});

describe('JobsService — groupes rejoints uniquement', () => {
  function makeClaimHarness() {
    const prisma: any = {
      profile: {
        findFirst: jest.fn(async () => ({
          id: 'profile_1',
          status: 'ACTIVE',
          ownerId: 'u1',
        })),
      },
      publicationJob: { findFirst: jest.fn(async () => null) },
      // Sa ligne de pilotage : en pause ou non, quota du jour.
      profileRunner: { findUnique: jest.fn(async (): Promise<{ pausedUntil?: Date | null; dailyQuota?: number | null } | null> => null) },
      // Mode « groupe » (lots par groupe) : celui que ces tests décrivent ; le
      // mode « article » a les siens plus bas.
      automationSetting: { findUnique: jest.fn(async (): Promise<Record<string, unknown>> => ({ objectiveTimezone: 'Europe/Paris', pilotMode: 'group' })) },
      // Ce que les AUTRES profils publient en ce moment dans ces groupes.
      publicationJobItem: {
        findMany: jest.fn(async (): Promise<Array<{ job: { groupId: string } }>> => []),
        count: jest.fn(async () => 0),
      },
      postTarget: {
        updateMany: jest.fn(async () => ({ count: 0 })),
        count: jest.fn(async () => 0),
        groupBy: jest.fn(async (): Promise<Array<{ groupId: string; _count: { _all: number } }>> => []),
      },
      // Les groupes liés au profil, pour le diagnostic d'un « rien à publier »,
      // et ceux où il est pré-approuvé.
      profileGroup: { findMany: jest.fn(async (): Promise<Array<{ groupId: string }>> => []) },
      group: {
        findFirst: jest.fn(async () => null),
        findMany: jest.fn(async () => []),
      },
      activityLog: { create: jest.fn(async () => ({})) },
      publicationTrace: { create: jest.fn(async (args: any) => args) },
    };
    prisma.publicationJob.updateMany = jest.fn(async () => ({ count: 0 }));
    const service = new JobsService(prisma, {} as any);
    return { service, prisma };
  }

  const joinedLink = {
    profiles: {
      some: expect.objectContaining({ joinStatus: JoinStatus.JOINED }),
    },
  };

  it('refuse de réserver dans un groupe que le profil n’a pas rejoint', async () => {
    const { service, prisma } = makeClaimHarness();
    await expect(
      service.claim({ profileId: 'profile_1', groupId: 'group_1' }),
    ).rejects.toThrow('pas encore rejoint');
    expect(prisma.group.findFirst).toHaveBeenCalledWith({
      where: expect.objectContaining(joinedLink),
    });
  });

  it('ne choisit que parmi les groupes rejoints', async () => {
    const { service, prisma } = makeClaimHarness();
    const result = await service.claimByProfileExternalId('demo-profile');
    expect(result).toMatchObject({ job: null, posts: [] });
    expect(prisma.group.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining(joinedLink) }),
    );
  });

  describe('rien à publier : le diagnostic dit pourquoi', () => {
    const link = (id: string, joinStatus: string) => ({ joinStatus, group: { id, name: `Groupe ${id}` } });

    it('lié à aucun groupe', async () => {
      const { service } = makeClaimHarness();
      const r: any = await service.claimByProfileExternalId('demo-profile');
      expect(r).toMatchObject({ job: null, reason: 'no_group' });
      expect(r.message).toMatch(/lié à aucun groupe/);
    });

    it('n’a rejoint aucun groupe, et des posts l’attendent ailleurs', async () => {
      const { service, prisma } = makeClaimHarness();
      prisma.profileGroup.findMany.mockResolvedValue([link('g1', 'REQUESTED'), link('g2', 'NOT_JOINED')]);
      prisma.postTarget.count.mockResolvedValue(12);
      const r: any = await service.claimByProfileExternalId('demo-profile');
      expect(r.reason).toBe('not_joined');
      expect(r.message).toMatch(/n’a rejoint aucun de ses 2 groupe/);
      expect(r.message).toMatch(/12 post\(s\) attendent dans des groupes qu’il n’a pas rejoints \(Groupe g1, Groupe g2\)/);
      expect(r.message).toMatch(/marquez-les « rejoint »/);
    });

    it('rien en attente dans ses groupes rejoints', async () => {
      const { service, prisma } = makeClaimHarness();
      prisma.profileGroup.findMany.mockResolvedValue([link('g1', 'JOINED')]);
      const r: any = await service.claimByProfileExternalId('demo-profile');
      expect(r.reason).toBe('no_post');
      expect(r.message).toMatch(/Aucun post en attente dans ses 1 groupe/);
    });

    it('des posts attendent, mais aucun ne lui est permis', async () => {
      const { service, prisma } = makeClaimHarness();
      prisma.profileGroup.findMany.mockResolvedValue([link('g1', 'JOINED')]);
      // 5 en attente dans ses groupes ; 0 permis (autre compte, ou forcés ailleurs).
      prisma.postTarget.count.mockResolvedValueOnce(5).mockResolvedValueOnce(0).mockResolvedValueOnce(0);
      const r: any = await service.claimByProfileExternalId('demo-profile');
      expect(r.reason).toBe('not_allowed');
      expect(r.diagnosis).toMatchObject({ postsInJoinedGroups: 5, postsAllowed: 0 });
    });
  });

  it('commence par le groupe qui porte le post le plus prioritaire', async () => {
    const { service, prisma } = makeClaimHarness();
    prisma.group.findMany.mockResolvedValue([{ id: 'calme' }, { id: 'urgent' }, { id: 'moyen' }]);
    const priorities: Record<string, number> = { calme: 0, urgent: 9, moyen: 2 };
    prisma.postTarget.findFirst = jest.fn(async ({ where }: any) => ({
      post: { priority: priorities[where.groupId] },
    }));
    const tried: string[] = [];
    jest.spyOn(service, 'claim').mockImplementation(async (dto: any) => {
      tried.push(dto.groupId);
      return { job: null, posts: [] };
    });
    await service.claimByProfileExternalId('demo-profile');
    expect(tried).toEqual(['urgent', 'moyen', 'calme']);
  });

  it('un groupe où un autre profil publie en ce moment passe en dernier, sans être exclu', async () => {
    const { service, prisma } = makeClaimHarness();
    prisma.group.findMany.mockResolvedValue([{ id: 'occupe' }, { id: 'libre' }]);
    prisma.postTarget.findFirst = jest.fn(async ({ where }: any) => ({
      post: { priority: where.groupId === 'occupe' ? 9 : 0 },
    }));
    prisma.publicationJobItem.findMany.mockResolvedValue([{ job: { groupId: 'occupe' } }]);
    const tried: string[] = [];
    jest.spyOn(service, 'claim').mockImplementation(async (dto: any) => {
      tried.push(dto.groupId);
      return { job: null, posts: [] };
    });
    await service.claimByProfileExternalId('demo-profile');
    expect(tried).toEqual(['libre', 'occupe']);
    const where = prisma.publicationJobItem.findMany.mock.calls[0][0].where;
    expect(where.job.profileId).toEqual({ not: 'profile_1' });
  });

  it('à priorité égale, il commence par un groupe où il est pré-approuvé', async () => {
    const { service, prisma } = makeClaimHarness();
    prisma.group.findMany.mockResolvedValue([{ id: 'a-valider' }, { id: 'pre-approuve' }]);
    prisma.postTarget.findFirst = jest.fn(async () => ({ post: { priority: 0 } }));
    prisma.profileGroup.findMany.mockResolvedValue([{ groupId: 'pre-approuve' }]);
    const tried: string[] = [];
    jest.spyOn(service, 'claim').mockImplementation(async (dto: any) => {
      tried.push(dto.groupId);
      return { job: null, posts: [] };
    });
    await service.claimByProfileExternalId('demo-profile');
    expect(tried[0]).toBe('pre-approuve');
  });

  it('profil en pause (limité par Facebook) : il ne réserve rien', async () => {
    const { service, prisma } = makeClaimHarness();
    prisma.profileRunner.findUnique.mockResolvedValue({ pausedUntil: new Date(Date.now() + 86_400_000) });
    const r: any = await service.claimByProfileExternalId('demo-profile');
    expect(r.reason).toBe('paused');
    expect(prisma.group.findMany).not.toHaveBeenCalled();
  });

  it('un groupe prioritaire passe avant les posts prioritaires d’un autre groupe', async () => {
    const { service, prisma } = makeClaimHarness();
    prisma.group.findMany.mockImplementation(async (args: any) =>
      args?.select?.priority ? [{ id: 'normal', priority: 0 }, { id: 'vip', priority: 5 }] : [{ id: 'normal' }, { id: 'vip' }],
    );
    prisma.postTarget.findFirst = jest.fn(async ({ where }: any) => ({ post: { priority: where.groupId === 'normal' ? 9 : 0 } }));
    const tried: string[] = [];
    jest.spyOn(service, 'claim').mockImplementation(async (dto: any) => {
      tried.push(dto.groupId);
      return { job: null, posts: [] };
    });
    await service.claimByProfileExternalId('demo-profile');
    expect(tried[0]).toBe('vip');
  });

  describe('article par article', () => {
    function articleHarness() {
      const h = makeClaimHarness();
      h.prisma.automationSetting.findUnique.mockResolvedValue({ objectiveTimezone: 'Europe/Paris', pilotMode: 'article' });
      h.prisma.group.findMany.mockImplementation(async (args: any) =>
        args?.select?.priority ? [{ id: 'g1', priority: 0 }, { id: 'vip', priority: 5 }, { id: 'g3', priority: 0 }] : [{ id: 'g1' }, { id: 'vip' }, { id: 'g3' }],
      );
      h.prisma.postTarget.findFirst = jest.fn(async () => ({ post: { priority: 0 } }));
      // A : en tête de file, attend dans g1 et vip ; B ensuite, dans g1 et g3.
      const where: Record<string, string[]> = { A: ['g1', 'vip'], B: ['g1', 'g3'] };
      h.prisma.postTarget.findMany = jest.fn(async (args: any) =>
        args.where.postId ? where[args.where.postId].map((groupId) => ({ groupId })) : [{ postId: 'A' }, { postId: 'A' }, { postId: 'B' }],
      );
      const tried: Array<[string, string, number]> = [];
      return { ...h, tried };
    }

    it('publie l’article en tête dans tous ses groupes (le prioritaire d’abord) avant le suivant, un post par lot', async () => {
      const { service, tried } = articleHarness();
      jest.spyOn(service, 'claim').mockImplementation(async (dto: any, _a: any, limits: any = {}) => {
        tried.push([dto.groupId, limits.postId, limits.maxCount]);
        return { job: null, posts: [] };
      });
      const r: any = await service.claimByProfileExternalId('demo-profile');
      // A d'abord, dans tous ses groupes (vip, le prioritaire, en tête) ; puis B.
      // g1 et g3 sont à égalité : le hasard les départage.
      expect(tried.slice(0, 2)).toEqual([['vip', 'A', 1], ['g1', 'A', 1]]);
      expect(tried.slice(2).map((t) => t[1])).toEqual(['B', 'B']);
      expect(tried.slice(2).map((t) => t[0]).sort()).toEqual(['g1', 'g3']);
      expect(tried.every((t) => t[2] === 1)).toBe(true);
      expect(r.reason).toBe('taken');
    });

    it('s’arrête au premier lot réservé', async () => {
      const { service, tried } = articleHarness();
      jest.spyOn(service, 'claim').mockImplementation(async (dto: any, _a: any, limits: any = {}) => {
        tried.push([dto.groupId, limits.postId, limits.maxCount]);
        return { jobId: 'job_1', posts: [] } as any;
      });
      const r: any = await service.claimByProfileExternalId('demo-profile');
      expect(r.jobId).toBe('job_1');
      expect(tried).toEqual([['vip', 'A', 1]]);
    });

    it('la file des articles : forcé vers lui, puis priorité, puis le plus ancien', async () => {
      const { service, prisma } = articleHarness();
      jest.spyOn(service, 'claim').mockImplementation(async () => ({ job: null, posts: [] }));
      await service.claimByProfileExternalId('demo-profile');
      const call = prisma.postTarget.findMany.mock.calls.find((c: any) => c[0].select?.postId)[0];
      expect(call.orderBy).toEqual([
        { forcedProfileId: { sort: 'asc', nulls: 'last' } },
        { post: { priority: 'desc' } },
        { post: { createdAt: 'asc' } },
      ]);
    });
  });

  it('un groupe prioritaire reste en tête même si un autre profil vient d’y publier', async () => {
    const { service, prisma } = makeClaimHarness();
    prisma.group.findMany.mockImplementation(async (args: any) =>
      args?.select?.priority ? [{ id: 'libre', priority: 0 }, { id: 'vip', priority: 5 }] : [{ id: 'libre' }, { id: 'vip' }],
    );
    prisma.postTarget.findFirst = jest.fn(async () => ({ post: { priority: 0 } }));
    prisma.publicationJobItem.findMany.mockResolvedValue([{ job: { groupId: 'vip' } }]);
    const tried: string[] = [];
    jest.spyOn(service, 'claim').mockImplementation(async (dto: any) => {
      tried.push(dto.groupId);
      return { job: null, posts: [] };
    });
    await service.claimByProfileExternalId('demo-profile');
    expect(tried).toEqual(['vip', 'libre']);
  });

  describe('règles du pilotage', () => {
    function withRules(groupsRules: any[], extra: (prisma: any) => void = () => {}) {
      const h = makeClaimHarness();
      h.prisma.group.findMany.mockImplementation(async (args: any) =>
        args?.select?.dailyCap ? groupsRules : args?.select?.priority ? groupsRules.map((g) => ({ id: g.id, priority: 0 })) : groupsRules.map((g) => ({ id: g.id })),
      );
      h.prisma.postTarget.findFirst = jest.fn(async () => ({ post: { priority: 0 } }));
      extra(h.prisma);
      const tried: Array<{ groupId: string; max?: number }> = [];
      jest.spyOn(h.service, 'claim').mockImplementation(async (dto: any, _a: any, limits: any = {}) => {
        tried.push({ groupId: dto.groupId, max: limits.maxCount });
        return { job: null, posts: [] };
      });
      return { ...h, tried };
    }
    const g = (id: string, over: any = {}) => ({ id, name: id, dailyCap: null, hoursStart: null, hoursEnd: null, ...over });

    it('quota du profil atteint : rien à réserver aujourd’hui', async () => {
      const { service, tried } = withRules([g('a')], (p) => {
        p.profileRunner.findUnique.mockResolvedValue({ pausedUntil: null, dailyQuota: 10 });
        p.publicationJobItem.count.mockResolvedValue(10);
      });
      const r: any = await service.claimByProfileExternalId('demo-profile');
      expect(r.reason).toBe('quota');
      expect(tried).toEqual([]);
    });

    it('plafond du groupe : un groupe plein est sauté, l’autre limité à ce qu’il lui reste', async () => {
      const { service, tried } = withRules([g('plein', { dailyCap: 5 }), g('presque', { dailyCap: 5 })], (p) => {
        p.postTarget.groupBy.mockImplementation(async (args: any) =>
          args.where.status === 'PUBLISHED' ? [{ groupId: 'plein', _count: { _all: 5 } }, { groupId: 'presque', _count: { _all: 3 } }] : [{ groupId: 'presque', _count: { _all: 1 } }],
        );
      });
      await service.claimByProfileExternalId('demo-profile');
      expect(tried).toEqual([{ groupId: 'presque', max: 1 }]);
    });

    it('heures réservées : hors de sa plage, le groupe est fermé', async () => {
      const now = new Date();
      const parisMinutes = Number(now.toLocaleString('en-GB', { timeZone: 'Europe/Paris', hour: '2-digit', hour12: false })) % 24 * 60;
      const closed = { hoursStart: (parisMinutes + 120) % 1440, hoursEnd: (parisMinutes + 180) % 1440 };
      const { service, tried } = withRules([g('ferme', closed), g('ouvert')]);
      await service.claimByProfileExternalId('demo-profile');
      expect(tried.map((t) => t.groupId)).toEqual(['ouvert']);
    });

    it('tous fermés ou pleins : il le dit', async () => {
      const { service } = withRules([g('plein', { dailyCap: 0 })]);
      const r: any = await service.claimByProfileExternalId('demo-profile');
      expect(r.reason).toBe('group_limits');
      expect(r.message).toMatch(/plafond de 0\/jour/);
    });
  });

  it('un envoi forcé vers ce profil passe avant toute priorité', async () => {
    const { service, prisma } = makeClaimHarness();
    prisma.group.findMany.mockResolvedValue([{ id: 'prioritaire' }, { id: 'force' }]);
    prisma.postTarget.findFirst = jest.fn(async ({ where }: any) =>
      where.groupId === 'force'
        ? { forcedProfileId: 'profile_1', post: { priority: 0 } }
        : { forcedProfileId: null, post: { priority: 50 } },
    );
    const tried: string[] = [];
    jest.spyOn(service, 'claim').mockImplementation(async (dto: any) => {
      tried.push(dto.groupId);
      return { job: null, posts: [] };
    });
    await service.claimByProfileExternalId('demo-profile');
    expect(tried[0]).toBe('force');
  });

  it('ne propose pas une cible forcée vers un autre profil', async () => {
    const { service, prisma } = makeClaimHarness();
    await service.claimByProfileExternalId('demo-profile');
    const [[{ where }]] = prisma.group.findMany.mock.calls;
    expect(where.targets.some.AND).toEqual([
      { OR: [{ forcedProfileId: null }, { forcedProfileId: 'profile_1' }] },
      // Ni une republication qui écarte ce profil (post qu'il avait raté).
      { OR: [{ avoidProfileId: null }, { avoidProfileId: { not: 'profile_1' } }] },
    ]);
  });

  it('cherche ses posts, les posts ouverts de son compte, et ceux créés par un admin', async () => {
    const { service, prisma } = makeClaimHarness();
    await service.claimByProfileExternalId('demo-profile');
    const [[{ where }]] = prisma.group.findMany.mock.calls;
    expect(where.targets.some.post).toEqual({
      status: 'AVAILABLE',
      OR: [
        { profileId: 'profile_1' },
        // Sans propriétaire, créé par un ADMIN, ou du compte du profil.
        { profileId: null, OR: [{ ownerId: null }, { owner: { role: 'ADMIN' } }, { ownerId: 'u1' }] },
      ],
    });
  });
});

describe('JobsService — un lot ne bloque plus un profil pour rien', () => {
  function harness(items: Array<{ id: string; status: string; postTargetId: string }>, jobStatus = 'CLAIMED') {
    const ops: Array<[string, any]> = [];
    const record = (name: string) => jest.fn((args: any) => { ops.push([name, args]); return args; });
    const prisma: any = {
      profileRunner: { findUnique: jest.fn(async () => null) },
      publicationJob: {
        findFirst: jest.fn(async () => ({ id: 'job_1' })),
        findUnique: jest.fn(async () => ({ id: 'job_1', status: jobStatus, profileId: 'p1', groupId: 'g1', items })),
        update: record('publicationJob.update'),
      },
      postTarget: { updateMany: record('postTarget.updateMany') },
      publicationJobItem: { updateMany: record('publicationJobItem.updateMany') },
      activityLog: { create: record('activityLog.create') },
      publicationTrace: { create: jest.fn(async (args: any) => args) },
      $transaction: jest.fn(async (list: any[]) => list),
    };
    return { service: new JobsService(prisma, {} as any), ops };
  }

  it('libérer : les posts pas commencés retournent dans la file', async () => {
    const { service, ops } = harness([
      { id: 'i1', status: 'CLAIMED', postTargetId: 't1' },
      { id: 'i2', status: 'FAILED', postTargetId: 't2' },
      { id: 'i3', status: 'CLAIMED', postTargetId: 't3' },
    ]);
    const r = await service.release('job_1', null, 'repris par l’extension');
    expect(r).toMatchObject({ released: 2, inProgress: 0 });
    const target = ops.find(([n]) => n === 'postTarget.updateMany')![1];
    expect(target.where.id.in).toEqual(['t1', 't3']);
    expect(target.data.status).toBe('AVAILABLE');
    expect(ops.find(([n]) => n === 'publicationJob.update')![1].data.status).toBe('EXPIRED');
    expect(ops.find(([n]) => n === 'activityLog.create')![1].data.eventType).toBe('JOB_RELEASED');
  });

  it('un post en cours de publication n’est jamais remis en file (doublon)', async () => {
    const { service, ops } = harness([
      { id: 'i1', status: 'CONSUMED', postTargetId: 't1' },
      { id: 'i2', status: 'CLAIMED', postTargetId: 't2' },
    ]);
    const r = await service.release('job_1');
    expect(r).toMatchObject({ released: 1, inProgress: 1 });
    expect(ops.find(([n]) => n === 'postTarget.updateMany')![1].where.id.in).toEqual(['t2']);
  });

  it('un lot déjà clos ne bouge pas', async () => {
    const { service, ops } = harness([], 'COMPLETED');
    expect(await service.release('job_1')).toMatchObject({ alreadyClosed: true });
    expect(ops).toEqual([]);
  });
});

describe('JobsService — un lot terminé ne bloque pas le profil', () => {
  it('tous ses posts finis : il est clos, et le profil réserve à nouveau', async () => {
    const logs: any[] = [];
    const prisma: any = {
      profileRunner: { findUnique: jest.fn(async () => null) },
      profile: { findFirst: jest.fn(async () => ({ id: 'p1', status: 'ACTIVE', ownerId: null })) },
      publicationJob: {
        findFirst: jest.fn(async () => ({ id: 'vieux_lot', claimExpiresAt: new Date(Date.now() + 600_000) })),
        updateMany: jest.fn(async () => ({ count: 0 })),
      },
      publicationJobItem: { count: jest.fn(async () => 0) },
      postTarget: { updateMany: jest.fn(async () => ({ count: 0 })), count: jest.fn(async () => 0) },
      profileGroup: { findMany: jest.fn(async () => []) },
      group: { findMany: jest.fn(async () => []) },
      activityLog: { create: jest.fn(async ({ data }: any) => logs.push(data)) },
      publicationTrace: { create: jest.fn(async (args: any) => args) },
    };
    const service = new JobsService(prisma, {} as any);
    const complete = jest.spyOn(service, 'complete').mockResolvedValue({} as any);
    const result: any = await service.claimByProfileExternalId('demo');
    expect(complete).toHaveBeenCalledWith('vieux_lot');
    expect(logs.map((l) => l.eventType)).toContain('JOB_AUTO_COMPLETED');
    expect(logs.map((l) => l.eventType)).not.toContain('CLAIM_SKIPPED_BUSY');
    // Il n'est plus « occupé » : il passe à la recherche de posts.
    expect(result.activeJobId).toBeUndefined();
  });
});

describe('JobsService — un post qui n’est jamais parti repart seul dans la file', () => {
  function harness(attemptsCount: number, others = 2) {
    const prisma: any = {
      publicationJobItem: {
        findUnique: jest.fn(async () => ({
          postTargetId: 't1',
          postTarget: { status: TargetStatus.FAILED, attemptsCount, groupId: 'g1', facebookUrl: null },
          job: { profileId: 'p-mohammed', profile: { name: 'Mohammed' } },
          post: { title: 'Spot the Pigeons' },
        })),
      },
      profileGroup: { count: jest.fn(async () => others) },
      postTarget: { update: jest.fn(async (a: any) => a) },
      publicationTrace: { create: jest.fn(async (a: any) => a) },
      activityLog: { create: jest.fn(async (a: any) => a) },
      $transaction: jest.fn(async (ops: unknown[]) => ops),
    };
    const service = new JobsService(prisma, {} as any);
    jest.spyOn(service as any, 'reachableJob').mockResolvedValue({});
    jest.spyOn(service as any, 'updateItem').mockResolvedValue({ status: TargetStatus.FAILED });
    return { service, prisma };
  }

  it('échec avant « Publier » : remis en file, pour un autre profil du groupe', async () => {
    const { service, prisma } = harness(1);
    await service.markFailed('j1', 'post1', 'the "Write something..." box is not on the page', null, true);
    const data = prisma.postTarget.update.mock.calls[0][0].data;
    expect(data).toMatchObject({ status: TargetStatus.AVAILABLE, avoidProfileId: 'p-mohammed', claimedAt: null });
    const log = prisma.activityLog.create.mock.calls[0][0].data;
    expect(log.eventType).toBe('TARGET_AUTO_REQUEUED');
    expect(log.message).toMatch(/tentative 2\/3/);
  });

  it('au bout de 3 tentatives : laissé en échec, et dit', async () => {
    const { service, prisma } = harness(3);
    await service.markFailed('j1', 'post1', 'x', null, true);
    expect(prisma.postTarget.update).not.toHaveBeenCalled();
    expect(prisma.activityLog.create.mock.calls[0][0].data.eventType).toBe('TARGET_REQUEUE_EXHAUSTED');
  });

  it('sans « requeue » (peut-être publié) : rien ne repart', async () => {
    const { service, prisma } = harness(1);
    await service.markFailed('j1', 'post1', 'x', null, false);
    expect(prisma.publicationJobItem.findUnique).not.toHaveBeenCalled();
  });
});


describe('JobsService — profil limité par Facebook', () => {
  function harness() {
    const prisma: any = {
      publicationJob: {
        findUnique: jest.fn(async () => ({ profileId: 'p1', profile: { name: 'Islam', ownerId: 'u1' } })),
        findMany: jest.fn(async () => [{ id: 'j1' }]),
      },
      automationSetting: { findUnique: jest.fn(async () => ({ rateLimitPauseDays: 5 })) },
      profileRunner: { upsert: jest.fn(async (a: any) => a) },
      postTarget: { updateMany: jest.fn(async () => ({ count: 2 })) },
      post: { updateMany: jest.fn(async () => ({ count: 1 })) },
      activityLog: { create: jest.fn(async (a: any) => a) },
      $transaction: jest.fn(async (ops: any[]) => Promise.all(ops)),
    };
    const service = new JobsService(prisma, {} as any);
    jest.spyOn(service, 'release').mockResolvedValue({ jobId: 'j1', released: 3, inProgress: 0 } as any);
    return { service, prisma };
  }

  it('reconnaît le message de Facebook, en plusieurs langues', () => {
    const { RATE_LIMITED } = require('./jobs.service');
    for (const text of [
      'Facebook a refuse la publication (publication bloquee)',
      'We limit how often you can post, comment or do other things in a given amount of time',
      'Nous limitons la fréquence à laquelle vous pouvez publier',
      'حاول مرة أخرى لاحقاً',
    ]) expect(RATE_LIMITED.test(text)).toBe(true);
    expect(RATE_LIMITED.test('the "Write something..." box is not on the page')).toBe(false);
  });

  it('pause de 5 jours, lot libéré, envois forcés rendus, posts propres ouverts aux autres', async () => {
    const { service, prisma } = harness();
    const now = new Date('2026-10-06T10:00:00Z');
    const r: any = await service.pauseForRateLimit('j1', 'publication bloquee', now);
    expect(prisma.profileRunner.upsert.mock.calls[0][0].update.pausedUntil).toEqual(new Date('2026-10-11T10:00:00Z'));
    expect(service.release).toHaveBeenCalledWith('j1', null, expect.stringContaining('limité par Facebook'));
    expect(prisma.postTarget.updateMany.mock.calls[0][0]).toMatchObject({ where: { forcedProfileId: 'p1' }, data: { forcedProfileId: null } });
    expect(prisma.post.updateMany.mock.calls[0][0]).toMatchObject({ where: { profileId: 'p1' }, data: { profileId: null, ownerId: 'u1' } });
    expect(r).toMatchObject({ released: 3, unforced: 2, opened: 1 });
    expect(prisma.activityLog.create.mock.calls[0][0].data.eventType).toBe('PROFILE_RATE_LIMITED');
  });
});
