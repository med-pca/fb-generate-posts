import { NotFoundException } from '@nestjs/common';
import { QueueService } from './queue.service';

const post = (id: string, priority = 0) => ({
  id,
  title: `Post ${id}`,
  description: 'Texte',
  imageUrl: null,
  priority,
  createdAt: new Date('2026-09-29T10:00:00Z'),
  article: null,
  url: 'https://site.test/article',
});
const group = { id: 'g1', name: 'Recettes FR', url: 'https://fb/g1', category: { id: 'c1', name: 'Recettes' } };
const profile = { id: 'p1', name: 'Salim', externalId: 'ext-1' };

function setup() {
  const findMany = jest.fn(async ({ where }: any) => {
    if (where.status === 'AVAILABLE') {
      return [
        { id: 't-a', forcedProfile: profile, forcedAt: new Date(), post: post('a', 5), group: { ...group, _count: { profiles: 0 }, profiles: [{ profile }] } },
        { id: 't-b', forcedProfile: null, forcedAt: null, post: post('b'), group: { ...group, _count: { profiles: 8 }, profiles: [] } },
      ];
    }
    if (where.status === 'FAILED') {
      return [
        {
          id: 't-f',
          lastError: 'Groupe fermé aux publications',
          attemptsCount: 2,
          updatedAt: new Date(),
          post: post('f'),
          group: { ...group, _count: { profiles: 0 }, profiles: [{ profile }] },
          jobItems: [{ error: 'x', job: { profile } }],
        },
      ];
    }
    if (where.status === 'PUBLISHED') {
      return [
        {
          id: 't-p',
          publishedAt: new Date('2026-09-29T12:00:00Z'),
          commentedAt: new Date(),
          linkUpdatedAt: null,
          post: post('p'),
          group,
          jobItems: [
            { externalPostUrl: 'https://facebook.com/groups/g1/posts/9', publishedAt: null, job: { profile } },
          ],
        },
      ];
    }
    return [
      {
        id: 't-r',
        status: 'CONSUMED',
        claimedAt: new Date(),
        claimExpiresAt: new Date(),
        post: post('r'),
        group,
        jobItems: [{ job: { id: 'job1', profile } }],
      },
    ];
  });
  const prisma: any = {
    postTarget: { findMany, count: jest.fn(async () => 7) },
    post: {
      findFirst: jest.fn(async ({ where }: any) => (where.id === 'a' ? { id: 'a', priority: 2 } : null)),
      aggregate: jest.fn(async () => ({ _max: { priority: 9 } })),
      update: jest.fn(async ({ data }: any) => ({ id: 'a', ...data })),
    },
  };
  return { service: new QueueService(prisma), prisma, findMany };
}

describe('QueueService.queue', () => {
  it('montre en cours, à venir dans l’ordre, et publiés avec groupe et profil', async () => {
    const { service } = setup();
    const q = await service.queue({ limit: 10, publishedLimit: 20 }, null);
    expect(q.counts).toEqual({ running: 7, upcoming: 7, published: 7, failed: 7 });
    expect(q.failed[0]).toMatchObject({
      error: 'Groupe fermé aux publications',
      attempts: 2,
      profile: { name: 'Salim' },
      candidates: [profile],
    });
    expect(q.upcoming[0].forcedProfile).toEqual(profile);
    // Aucun profil « Rejoint », mais 8 demandes en attente : c'est dit.
    expect(q.upcoming[1]).toMatchObject({ candidates: [], group: { pendingJoins: 8 } });
    expect((q.upcoming[1].group as any).profiles).toBeUndefined();

    expect(q.running[0]).toMatchObject({ state: 'publishing', profile: { name: 'Salim' }, group: { name: 'Recettes FR' } });

    expect(q.upcoming.map((u) => [u.rank, u.post.id])).toEqual([[1, 'a'], [2, 'b']]);
    expect(q.upcoming[0].candidates).toEqual([profile]);

    expect(q.published[0]).toMatchObject({
      group: { name: 'Recettes FR', category: { name: 'Recettes' } },
      profile: { name: 'Salim' },
      facebookUrl: 'https://facebook.com/groups/g1/posts/9',
      link: 'waiting',
    });
  });

  it('prend les prochains dans l’ordre de la réservation : groupe prioritaire, priorité du post, ancienneté', async () => {
    const { service, findMany } = setup();
    await service.queue({ limit: 10, publishedLimit: 20 }, null);
    const upcoming = findMany.mock.calls.find(([args]: any) => args.where.status === 'AVAILABLE')![0];
    expect(upcoming.orderBy).toEqual([
      { forcedProfileId: { sort: 'asc', nulls: 'last' } },
      { group: { priority: 'desc' } },
      { post: { priority: 'desc' } },
      { post: { createdAt: 'asc' } },
      { createdAt: 'asc' },
    ]);
    expect(upcoming.take).toBe(10);
  });

  it('filtre par catégorie', async () => {
    const { service, findMany } = setup();
    await service.queue({ categoryId: 'c1', limit: 10, publishedLimit: 20 }, null);
    for (const [args] of findMany.mock.calls) {
      expect(args.where.group).toMatchObject({ categoryId: 'c1' });
    }
  });
});

describe('QueueService.setPriority', () => {
  it('« en tête » passe devant le plus prioritaire', async () => {
    const { service, prisma } = setup();
    await service.setPriority('a', { move: 'top' }, null);
    expect(prisma.post.update.mock.calls[0][0].data.priority).toBe(10);
  });

  it('monter, descendre, remettre à zéro', async () => {
    const { service, prisma } = setup();
    await service.setPriority('a', { move: 'up' }, null);
    await service.setPriority('a', { move: 'down' }, null);
    await service.setPriority('a', { move: 'reset' }, null);
    expect(prisma.post.update.mock.calls.map(([args]: any) => args.data.priority)).toEqual([3, 1, 0]);
  });

  it('refuse un post hors de portée', async () => {
    const { service } = setup();
    await expect(service.setPriority('zz', { move: 'up' }, null)).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('QueueService — actions sur une publication', () => {
  function actions(target: Record<string, unknown>, extra: Record<string, any> = {}) {
    const prisma: any = {
      postTarget: {
        findFirst: jest.fn(async () => ({
          id: 't1',
          groupId: 'g1',
          postId: 'post1',
          claimExpiresAt: null,
          post: { title: 'Gratin' },
          group: { name: 'Recettes FR' },
          ...target,
        })),
        update: jest.fn((args: any) => args),
        delete: jest.fn((args: any) => ({ deleted: args })),
        count: jest.fn(async () => extra.remaining ?? 1),
      },
      post: {
        delete: jest.fn((args: any) => ({ postDeleted: args })),
        count: jest.fn(async () => extra.allowed ?? 1),
      },
      profile: { findFirst: jest.fn(async () => extra.profile ?? null) },
      activityLog: { create: jest.fn((args: any) => args) },
      publicationTrace: { create: jest.fn(async (args: any) => args) },
      $transaction: jest.fn(async (ops: any[]) => ops),
    };
    return { service: new QueueService(prisma), prisma };
  }
  const salim = (over: Record<string, unknown> = {}) => ({
    id: 'p1', name: 'Salim', ownerId: null, runner: { mode: 'AUTO' }, profileGroups: [{ id: 'pg' }], ...over,
  });

  it('relance un échec : il repart en attente, raison effacée', async () => {
    const { service, prisma } = actions({ status: 'FAILED' });
    await service.retry('t1', null);
    expect(prisma.postTarget.update.mock.calls[0][0].data).toMatchObject({ status: 'AVAILABLE', lastError: null });
  });

  it('« déjà en ligne » : un échec devient publié, sans republier', async () => {
    const { service, prisma } = actions({ status: 'FAILED' });
    await service.markPublished('t1', null);
    expect(prisma.postTarget.update.mock.calls[0][0].data).toMatchObject({ status: 'PUBLISHED', lastError: null });
    expect(prisma.activityLog.create.mock.calls[0][0].data.eventType).toBe('TARGET_MARKED_PUBLISHED');
    const live = actions({ status: 'AVAILABLE' });
    await expect(live.service.markPublished('t1', null)).rejects.toThrow('en échec');
  });

  it('enregistre l’adresse Facebook d’une publication, et la trace', async () => {
    const { service, prisma } = actions({ status: 'PUBLISHED', facebookUrl: null });
    const r = await service.setFacebookUrl('t1', 'https://www.facebook.com/groups/1/posts/5/?mibextid=abc', null);
    expect(r.facebookUrl).toBe('https://www.facebook.com/groups/1/posts/5');
    expect(prisma.publicationTrace.create.mock.calls[0][0].data).toMatchObject({ kind: 'URL_SET' });
    await expect(service.setFacebookUrl('t1', 'https://exemple.com/x', null)).rejects.toThrow('adresse de post Facebook');
    const waiting = actions({ status: 'AVAILABLE' });
    await expect(waiting.service.setFacebookUrl('t1', 'https://www.facebook.com/groups/1/posts/5', null)).rejects.toThrow('publiée');
  });

  it('« déjà en ligne » garde l’adresse donnée', async () => {
    const { service, prisma } = actions({ status: 'FAILED' });
    await service.markPublished('t1', null, 'https://www.facebook.com/groups/1/posts/8');
    expect(prisma.postTarget.update.mock.calls[0][0].data.facebookUrl).toBe('https://www.facebook.com/groups/1/posts/8');
    expect(prisma.publicationTrace.create.mock.calls[0][0].data.kind).toBe('MARKED_PUBLISHED');
  });

  it('retrouve une publication par son adresse, même ancienne', async () => {
    const { service, prisma } = actions({});
    prisma.postTarget.findMany = jest.fn(async () => [
      { id: 't1', status: 'AVAILABLE', facebookUrl: null, verifyStatus: 'REPUBLISHED', post: { id: 'p', title: 'Gratin' }, group: { id: 'g', name: 'Recettes FR' } },
    ]);
    const found = await service.findByUrl('https://facebook.com/groups/1/posts/5', null);
    const where = prisma.postTarget.findMany.mock.calls[0][0].where;
    expect(where.OR[1]).toEqual({ traces: { some: { facebookUrl: 'https://www.facebook.com/groups/1/posts/5' } } });
    expect(found[0]).toMatchObject({ targetId: 't1', current: false });
  });

  it('ne relance que ce qui a échoué', async () => {
    const { service } = actions({ status: 'PUBLISHED' });
    await expect(service.retry('t1', null)).rejects.toThrow('échec');
  });

  it('retire un post d’un seul groupe, sans toucher aux autres', async () => {
    const { service, prisma } = actions({ status: 'AVAILABLE' }, { remaining: 2 });
    expect(await service.removeTarget('t1', null)).toEqual({ removed: true, postDeleted: false });
    expect(prisma.postTarget.delete).toHaveBeenCalledWith({ where: { id: 't1' } });
    expect(prisma.post.delete).not.toHaveBeenCalled();
  });

  it('supprime le post s’il ne visait que ce groupe', async () => {
    const { service, prisma } = actions({ status: 'FAILED' }, { remaining: 0 });
    expect(await service.removeTarget('t1', null)).toEqual({ removed: true, postDeleted: true });
    expect(prisma.post.delete).toHaveBeenCalledWith({ where: { id: 'post1' } });
  });

  it('refuse de retirer une publication faite ou en cours', async () => {
    for (const status of ['PUBLISHED', 'CONSUMED']) {
      const { service } = actions({ status });
      await expect(service.removeTarget('t1', null)).rejects.toThrow('faite ou en cours');
    }
    const live = actions({ status: 'CLAIMED', claimExpiresAt: new Date(Date.now() + 60_000) });
    await expect(live.service.removeTarget('t1', null)).rejects.toThrow('faite ou en cours');
  });

  it('force l’envoi par un profil qui a rejoint le groupe', async () => {
    const { service, prisma } = actions({ status: 'FAILED' }, { profile: salim() });
    const result = await service.force('t1', 'p1', null);
    expect(prisma.postTarget.update.mock.calls[0][0].data).toMatchObject({
      forcedProfileId: 'p1',
      status: 'AVAILABLE',
      lastError: null,
    });
    expect(result).toMatchObject({ forcedProfile: { name: 'Salim' }, warning: null });
  });

  it('prévient quand le profil forcé est à l’arrêt', async () => {
    const { service } = actions({ status: 'AVAILABLE' }, { profile: salim({ runner: null }) });
    const result = await service.force('t1', 'p1', null);
    expect(result.warning).toMatch(/à l'arrêt/);
  });

  it('refuse un profil qui n’a pas rejoint le groupe', async () => {
    const { service } = actions({ status: 'AVAILABLE' }, { profile: salim({ profileGroups: [] }) });
    await expect(service.force('t1', 'p1', null)).rejects.toThrow('rejoint');
  });

  it('refuse un profil qui ne peut pas publier ce post', async () => {
    const { service } = actions({ status: 'AVAILABLE' }, { profile: salim(), allowed: 0 });
    await expect(service.force('t1', 'p1', null)).rejects.toThrow('ne peut pas publier');
  });

  it('annuler rend la publication à la file', async () => {
    const { service, prisma } = actions({ status: 'AVAILABLE' });
    await service.force('t1', null, null);
    expect(prisma.postTarget.update.mock.calls[0][0].data).toEqual({ forcedProfileId: null, forcedAt: null });
  });
});

describe('QueueService.attachUrl — lien collé à la main', () => {
  const at = (min: number) => new Date(Date.UTC(2026, 9, 19, 10, min));
  const row = (id: string, status: string, min: number) => ({
    id, status, publishedAt: null, updatedAt: at(min), lastError: null, approvalPendingSince: null,
    post: { id: `p-${id}`, title: `Post ${id}`, imageUrl: null }, group: { id: 'g1', name: 'Recettes FR' },
  });
  function setup(rows: any[], opts: { known?: any[]; groups?: any[] } = {}) {
    const prisma: any = {
      postTarget: {
        findMany: jest.fn(async (args: any) => (args.where.OR?.some((o: any) => 'facebookUrl' in o && typeof o.facebookUrl === 'string') ? opts.known ?? [] : rows)),
        findFirst: jest.fn(async (args: any) => {
          const id = args.where.AND[1].id;
          const r = rows.find((x) => x.id === id);
          return r ? { ...r, postId: r.post.id, groupId: 'g1', linkUpdatedAt: null, rescueStatus: null, post: { title: r.post.title, url: 'https://site.test/a', noComment: false } } : null;
        }),
        update: jest.fn((args: any) => args),
      },
      group: { findMany: jest.fn(async () => opts.groups ?? [{ id: 'g1', name: 'Recettes FR', url: 'https://www.facebook.com/groups/recettesfr', externalId: '123' }]) },
      activityLog: { create: jest.fn((args: any) => args) },
      publicationTrace: { create: jest.fn(async (args: any) => args) },
      $transaction: jest.fn(async (ops: any[]) => ops),
    };
    const rescue: any = { request: jest.fn(async () => true) };
    return { service: new QueueService(prisma, rescue), prisma, rescue };
  }

  it('une seule publication sans lien dans le groupe : le lien y est rattaché, et le sauveteur prévenu', async () => {
    const { service, prisma, rescue } = setup([row('a', 'AVAILABLE', 9), row('b', 'FAILED', 5)]);
    const r: any = await service.attachUrl('https://m.facebook.com/groups/123/posts/777/?mibextid=x', undefined, null);
    expect(r).toMatchObject({ result: 'attached', targetId: 'b', previousStatus: 'FAILED', rescue: true });
    expect(prisma.postTarget.update.mock.calls[0][0].data).toMatchObject({
      status: 'PUBLISHED', facebookUrl: 'https://www.facebook.com/groups/123/posts/777', verifyStatus: null, approvalPendingSince: null,
    });
    expect(prisma.publicationTrace.create.mock.calls[0][0].data.kind).toBe('URL_ATTACHED');
    expect(rescue.request).toHaveBeenCalledWith('b', expect.any(String), expect.any(Date));
  });

  it('le lien de la photo du post marche aussi, et c’est le lien du post qui est gardé', async () => {
    const { service, prisma } = setup([row('b', 'FAILED', 5)]);
    const r: any = await service.attachUrl('https://www.facebook.com/photo/?fbid=1&set=gm.777&idorvanity=123', undefined, null);
    expect(r).toMatchObject({ result: 'attached', facebookUrl: 'https://www.facebook.com/groups/123/posts/777' });
    expect(prisma.postTarget.update.mock.calls[0][0].data.facebookUrl).toBe('https://www.facebook.com/groups/123/posts/777');
  });

  it('le groupe se reconnaît aussi par le nom de son adresse', async () => {
    const { service } = setup([row('b', 'PUBLISHED', 5)]);
    const r: any = await service.attachUrl('https://www.facebook.com/groups/RecettesFR/permalink/9/', undefined, null);
    expect(r.result).toBe('attached');
  });

  it('plusieurs possibles : propose, sans deviner, les publications sans lien d’abord', async () => {
    const { service, prisma } = setup([row('a', 'AVAILABLE', 9), row('b', 'FAILED', 5), row('c', 'PUBLISHED', 1)]);
    const r: any = await service.attachUrl('https://www.facebook.com/groups/123/posts/777', undefined, null);
    expect(r.result).toBe('choose');
    expect(r.candidates.map((c: any) => c.targetId)).toEqual(['c', 'b', 'a']);
    expect(prisma.postTarget.update).not.toHaveBeenCalled();
    const chosen: any = await service.attachUrl('https://www.facebook.com/groups/123/posts/777', 'a', null);
    expect(chosen).toMatchObject({ result: 'attached', targetId: 'a', previousStatus: 'AVAILABLE' });
  });

  it('un lien déjà connu renvoie sa publication, sans rien changer', async () => {
    const known = [{ id: 'k', status: 'PUBLISHED', facebookUrl: 'https://www.facebook.com/groups/123/posts/777', post: { id: 'p', title: 'X' }, group: { id: 'g1', name: 'G' } }];
    const { service, prisma } = setup([], { known });
    const r: any = await service.attachUrl('https://www.facebook.com/groups/123/posts/777', undefined, null);
    expect(r.result).toBe('known');
    expect(prisma.postTarget.update).not.toHaveBeenCalled();
  });

  it('refuse un lien sans groupe, ou d’un groupe qui n’est pas à nous', async () => {
    const { service } = setup([]);
    await expect(service.attachUrl('https://www.facebook.com/permalink.php?story_fbid=1&id=2', undefined, null)).rejects.toThrow('quel groupe');
    const other = setup([], { groups: [] });
    await expect(other.service.attachUrl('https://www.facebook.com/groups/999/posts/1', undefined, null)).rejects.toThrow(NotFoundException);
  });
});

describe('QueueService.queue — filtre par site', () => {
  it('chaque onglet ne montre que les posts des articles du site choisi', async () => {
    const findMany = jest.fn(async () => []);
    const prisma: any = {
      postTarget: { findMany, groupBy: jest.fn(async () => []), count: jest.fn(async () => 0) },
      profile: { findMany: jest.fn(async () => []) },
    };
    await new QueueService(prisma).queue({ siteId: 'site_1', limit: 10, publishedLimit: 10 } as any, null).catch(() => undefined);
    expect(findMany.mock.calls.length).toBeGreaterThan(0);
    for (const call of findMany.mock.calls as any[]) {
      expect(JSON.stringify(call[0].where)).toContain('"sourceId":"site_1"');
    }
  });
});

describe('Lien de la photo d’un post de groupe', () => {
  it('se lit comme le lien du post : même groupe, même post', async () => {
    const { canonicalGroupPostUrl, groupKeyOf } = require('../trace/trace');
    const photo = 'https://www.facebook.com/photo/?fbid=3786886241476982&set=gm.2977368365960822&idorvanity=2308217362875929';
    expect(canonicalGroupPostUrl(photo)).toBe('https://www.facebook.com/groups/2308217362875929/posts/2977368365960822');
    expect(groupKeyOf(photo)).toBe('2308217362875929');
    expect(canonicalGroupPostUrl('https://www.facebook.com/groups/123/?multi_permalinks=456')).toBe('https://www.facebook.com/groups/123/posts/456');
    expect(canonicalGroupPostUrl('https://m.facebook.com/groups/abc/permalink/789/')).toBe('https://www.facebook.com/groups/abc/posts/789');
    expect(canonicalGroupPostUrl('https://www.facebook.com/permalink.php?story_fbid=1&id=2')).toBeNull();
  });
});
