import { BadRequestException } from '@nestjs/common';
import { JobStatus, TargetStatus } from '@prisma/client';
import { JobsService } from './jobs.service';

const EXPIRES = new Date('2026-09-16T12:00:00.000Z');

function item(overrides: Record<string, unknown> = {}) {
  return {
    id: 'item_1',
    jobId: 'job_1',
    postId: 'post_1',
    postTargetId: 'target_1',
    status: TargetStatus.PUBLISHED,
    commentExternalId: 'comment_1',
    commentedAt: new Date(),
    linkUpdatedAt: null,
    externalPostUrl: 'https://facebook.com/groups/1/posts/2/',
    post: { url: 'https://exemple.test/recette', title: 'Recette' },
    ...overrides,
  };
}

function service(prisma: any) {
  const config = { get: (_: string, fallback: number) => fallback };
  return new JobsService(prisma, config as any);
}

describe('JobsService — la réservation couvre le lot entier', () => {
  it('30 min + la somme des délais des posts choisis', async () => {
    const tx: any = {
      publicationJob: {
        updateMany: jest.fn(async () => ({})),
        create: jest.fn(async ({ data }: any) => ({
          id: 'job_1',
          claimExpiresAt: data.claimExpiresAt,
          profile: { id: 'p1', externalId: 'demo', name: 'Profil', defaultImageUrl: null },
          group: { id: 'g1', externalId: 'grp', name: 'Groupe', url: 'https://fb/g1' },
          items: [],
        })),
      },
      postTarget: { updateMany: jest.fn(async () => ({})) },
      // Trois posts, espacés de 40, 25 et 10 minutes.
      $queryRaw: jest.fn(async () => [
        { id: 't1', postId: 'p1', delay: 40 },
        { id: 't2', postId: 'p2', delay: 25 },
        { id: 't3', postId: 'p3', delay: 10 },
      ]),
    };
    const prisma: any = {
      profile: { findFirst: jest.fn(async () => ({ id: 'p1', minPostsPerJob: 3, maxPostsPerJob: 3 })) },
      group: { findFirst: jest.fn(async () => ({ id: 'g1' })) },
      $transaction: jest.fn(async (cb: any) => cb(tx)),
    };
    const before = Date.now();
    await service(prisma).claim({ profileId: 'p1', groupId: 'g1' });
    // Le premier appel balaie les réservations expirées ; celui-ci réserve.
    const reserving = tx.postTarget.updateMany.mock.calls.find(([args]: any) => args.data.status === 'CLAIMED');
    const expires = reserving[0].data.claimExpiresAt.getTime();
    // 30 + 40 + 25 + 10 = 105 minutes : le lot entier tient dans la réservation.
    expect(Math.round((expires - before) / 60_000)).toBe(105);
    expect(tx.publicationJob.create.mock.calls[0][0].data.claimExpiresAt.getTime()).toBe(expires);
  });
});

describe('JobsService — publication sans URL puis commentaire', () => {
  it('ne transmet jamais l’URL dans le lot réservé', async () => {
    const tx: any = {
      publicationJob: {
        updateMany: jest.fn(async () => ({})),
        create: jest.fn(async () => ({
          id: 'job_1',
          claimExpiresAt: EXPIRES,
          profile: {
            id: 'p1',
            externalId: 'demo',
            name: 'Profil',
            defaultImageUrl: 'https://img/default.jpg',
          },
          group: {
            id: 'g1',
            externalId: 'grp',
            name: 'Groupe',
            url: 'https://facebook.com/groups/1',
          },
          items: [
            {
              post: {
                id: 'post_1',
                title: 'Recette',
                description: 'Une description appétissante',
                url: 'https://exemple.test/recette',
                imageUrl: null,
                delay: 12,
              },
            },
          ],
        })),
      },
      postTarget: { updateMany: jest.fn(async () => ({})) },
      $queryRaw: jest.fn(async () => [{ id: 'target_1', postId: 'post_1' }]),
    };
    const prisma: any = {
      profile: {
        findFirst: jest.fn(async () => ({
          id: 'p1',
          minPostsPerJob: 1,
          maxPostsPerJob: 1,
        })),
      },
      group: { findFirst: jest.fn(async () => ({ id: 'g1' })) },
      $transaction: jest.fn(async (cb: any) => cb(tx)),
    };

    const result = await service(prisma).claim({
      profileId: 'p1',
      groupId: 'g1',
    });

    if (!('jobId' in result)) throw new Error('réservation attendue');
    const [post] = result.posts;
    expect(post).not.toHaveProperty('url');
    // Le commentaire reprend la description, et annonce qu'il recevra le lien.
    expect(post.comment).toEqual({
      text: 'Une description appétissante',
      willReceiveLink: true,
    });
    expect(post.image).toBe('https://img/default.jpg');
  });

  it('bascule le job en AWAITING_LINK au lieu de le clore', async () => {
    const tx: any = {
      publicationJob: {
        update: jest.fn(async ({ data }: any) => ({ id: 'job_1', ...data })),
      },
      activityLog: { create: jest.fn(async () => ({})) },
      publicationTrace: { create: jest.fn(async (args: any) => args) },
    };
    const prisma: any = {
      publicationJob: {
        // Le garde de portée interroge `findFirst` avant chaque étape.
        findFirst: jest.fn(async () => ({ id: 'job_1' })),
        findUnique: jest.fn(async () => ({
          id: 'job_1',
          profileId: 'p1',
          groupId: 'g1',
          items: [item()],
        })),
      },
      $transaction: jest.fn(async (cb: any) => cb(tx)),
    };

    const result = await service(prisma).complete('job_1');

    expect(result.status).toBe(JobStatus.AWAITING_LINK);
    expect(result.awaitingLink).toBe(1);
    expect(result.missingComments).toBe(0);
    expect(tx.activityLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ eventType: 'JOB_AWAITING_LINK' }),
      }),
    );
  });

  it('clôture normalement et signale un post publié sans commentaire', async () => {
    const tx: any = {
      publicationJob: {
        update: jest.fn(async ({ data }: any) => ({ id: 'job_1', ...data })),
      },
      activityLog: { create: jest.fn(async () => ({})) },
      publicationTrace: { create: jest.fn(async (args: any) => args) },
    };
    const prisma: any = {
      publicationJob: {
        // Le garde de portée interroge `findFirst` avant chaque étape.
        findFirst: jest.fn(async () => ({ id: 'job_1' })),
        findUnique: jest.fn(async () => ({
          id: 'job_1',
          profileId: 'p1',
          groupId: 'g1',
          items: [item({ commentExternalId: null, commentedAt: null })],
        })),
      },
      $transaction: jest.fn(async (cb: any) => cb(tx)),
    };

    const result = await service(prisma).complete('job_1');

    expect(result.status).toBe(JobStatus.COMPLETED);
    // Sans commentaire, l'URL ne sera jamais posée : ça doit se voir.
    expect(result.missingComments).toBe(1);
    expect(tx.activityLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          eventType: 'COMMENT_MISSING',
          level: 'WARN',
        }),
      }),
    );
  });

  it('refuse de livrer l’URL tant que le lot n’est pas validé', async () => {
    const prisma: any = {
      publicationJob: {
        // Le garde de portée interroge `findFirst` avant chaque étape.
        findFirst: jest.fn(async () => ({ id: 'job_1' })),
        findUnique: jest.fn(async () => ({
          id: 'job_1',
          status: JobStatus.CLAIMED,
          items: [item()],
        })),
      },
    };

    await expect(service(prisma).linkUpdates('job_1')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('livre l’URL une fois le lot clôturé', async () => {
    const prisma: any = {
      publicationJob: {
        // Le garde de portée interroge `findFirst` avant chaque étape.
        findFirst: jest.fn(async () => ({ id: 'job_1' })),
        findUnique: jest.fn(async () => ({
          id: 'job_1',
          status: JobStatus.AWAITING_LINK,
          completedAt: EXPIRES,
          profile: { id: 'p1', name: 'Profil', externalId: 'demo' },
          group: { id: 'g1', name: 'Groupe', externalId: 'grp' },
          items: [
            item(),
            item({ postId: 'post_2', linkUpdatedAt: new Date() }),
          ],
        })),
      },
    };

    const result = await service(prisma).linkUpdates('job_1');

    expect(result.updates).toEqual([
      {
        postId: 'post_1',
        title: 'Recette',
        commentExternalId: 'comment_1',
        url: 'https://exemple.test/recette',
        externalPostUrl: 'https://facebook.com/groups/1/posts/2/',
      },
    ]);
  });

  it('finalise le job quand le dernier commentaire reçoit son URL', async () => {
    const tx: any = {
      publicationJobItem: {
        update: jest.fn(async ({ data }: any) => ({ id: 'item_1', ...data })),
        findMany: jest.fn(async () => [
          item({ linkUpdatedAt: new Date() }),
          item({ postId: 'post_2', linkUpdatedAt: new Date() }),
        ]),
      },
      postTarget: { update: jest.fn(async () => ({})) },
      publicationJob: { update: jest.fn(async () => ({})) },
      activityLog: { create: jest.fn(async () => ({})) },
      publicationTrace: { create: jest.fn(async (args: any) => args) },
    };
    const prisma: any = {
      // Le garde de portée interroge le lot avant l'étape.
      publicationJob: { findFirst: jest.fn(async () => ({ id: 'job_1' })) },
      publicationJobItem: {
        findUnique: jest.fn(async () => ({
          ...item(),
          job: {
            id: 'job_1',
            status: JobStatus.AWAITING_LINK,
            profileId: 'p1',
            groupId: 'g1',
          },
        })),
      },
      $transaction: jest.fn(async (cb: any) => cb(tx)),
    };

    const result = await service(prisma).markLinkUpdated('job_1', 'post_1', {});

    expect(result.remaining).toBe(0);
    expect(tx.publicationJob.update).toHaveBeenCalledWith({
      where: { id: 'job_1' },
      data: { status: JobStatus.COMPLETED },
    });
    expect(tx.activityLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ eventType: 'JOB_FINALIZED' }),
      }),
    );
  });
});

describe('JobsService — l’URL post par post', () => {
  it('renvoie l’URL du post dès que son commentaire est enregistré', async () => {
    const tx: any = {
      publicationJobItem: {
        update: jest.fn(async ({ data }: any) => ({ id: 'item_1', ...data })),
      },
      postTarget: { update: jest.fn(async () => ({})) },
      activityLog: { create: jest.fn(async () => ({})) },
      publicationTrace: { create: jest.fn(async (args: any) => args) },
    };
    const prisma: any = {
      publicationJob: { findFirst: jest.fn(async () => ({ id: 'job_1' })) },
      publicationJobItem: {
        findUnique: jest.fn(async () => ({
          ...item({ commentExternalId: null, commentedAt: null }),
          job: {
            id: 'job_1',
            status: JobStatus.CLAIMED,
            claimExpiresAt: new Date(Date.now() + 3600_000),
          },
          postTarget: {
            id: 'target_1',
            status: TargetStatus.PUBLISHED,
            claimedByJobId: 'job_1',
          },
        })),
      },
      $transaction: jest.fn(async (cb: any) => cb(tx)),
    };
    const svc: any = service(prisma);
    svc.stillOwnsTarget = () => true;

    const result = await svc.markCommented('job_1', 'post_1', {
      commentExternalId: 'comment_1',
    });

    expect(result.url).toBe('https://exemple.test/recette');
    expect(result.commentExternalId).toBe('comment_1');
  });

  it('accepte link-updated avant la clôture du lot', async () => {
    const tx: any = {
      publicationJobItem: {
        update: jest.fn(async ({ data }: any) => ({ id: 'item_1', ...data })),
        findMany: jest.fn(async () => [
          item({ linkUpdatedAt: new Date() }),
          item({
            postId: 'post_2',
            commentedAt: null,
            commentExternalId: null,
          }),
        ]),
      },
      postTarget: { update: jest.fn(async () => ({})) },
      publicationJob: { update: jest.fn(async () => ({})) },
      activityLog: { create: jest.fn(async () => ({})) },
      publicationTrace: { create: jest.fn(async (args: any) => args) },
    };
    const prisma: any = {
      publicationJob: { findFirst: jest.fn(async () => ({ id: 'job_1' })) },
      publicationJobItem: {
        findUnique: jest.fn(async () => ({
          ...item(),
          job: {
            id: 'job_1',
            status: JobStatus.CLAIMED,
            profileId: 'p1',
            groupId: 'g1',
          },
        })),
      },
      $transaction: jest.fn(async (cb: any) => cb(tx)),
    };

    const result: any = await service(prisma).markLinkUpdated(
      'job_1',
      'post_1',
      {},
    );

    expect(result.linkUpdatedAt).toBeInstanceOf(Date);
    // Le lot est encore réservé : son statut n'est pas touché.
    expect(tx.publicationJob.update).not.toHaveBeenCalled();
  });
});

describe('JobsService — réservation par lot', () => {
  it('écarte un profil qui tient déjà un job', async () => {
    const prisma: any = {
      profileRunner: { findUnique: jest.fn(async () => null) },
      profile: {
        findMany: jest.fn(async () => [
          { id: 'p1', name: 'Profil 1', externalId: 'demo-1' },
          { id: 'p2', name: 'Profil 2', externalId: 'demo-2' },
        ]),
        findFirst: jest.fn(async ({ where }: any) => ({
          id: where.externalId === 'demo-1' ? 'p1' : 'p2',
        })),
      },
      // Les deux profils sont occupés : deux threads ne doivent pas piloter
      // le même compte.
      publicationJob: {
        findFirst: jest.fn(async () => ({
          id: 'job_en_cours',
          claimExpiresAt: EXPIRES,
        })),
      },
      // Un post du lot est encore à publier : le lot travaille vraiment.
      publicationJobItem: { count: jest.fn(async () => 1) },
      activityLog: { create: jest.fn(async () => ({})) },
      publicationTrace: { create: jest.fn(async (args: any) => args) },
    };

    const result = await service(prisma).claimBatch({ limit: 10 });

    expect(result.claimed).toBe(0);
    expect(result.skipped).toHaveLength(2);
    expect(result.skipped.every((entry: any) => entry.status === 'busy')).toBe(
      true,
    );
    expect(prisma.activityLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ eventType: 'JOBS_BATCH_CLAIMED' }),
      }),
    );
  });

  it('rend un profil libre mais sans stock comme « empty »', async () => {
    const prisma: any = {
      profileRunner: { findUnique: jest.fn(async () => null) },
      profile: {
        findMany: jest.fn(async () => [
          { id: 'p1', name: 'Profil 1', externalId: 'demo-1' },
        ]),
        findFirst: jest.fn(async () => ({ id: 'p1' })),
      },
      // Le balayage des réservations expirées tourne avant de regarder le
      // stock : sans lui, un profil dont toutes les cibles sont tenues par des
      // réservations périmées ne pourrait plus jamais rien réserver.
      publicationJob: {
        findFirst: jest.fn(async () => null),
        updateMany: jest.fn(async () => ({ count: 0 })),
      },
      postTarget: {
        updateMany: jest.fn(async () => ({ count: 0 })),
        count: jest.fn(async () => 0),
      },
      profileGroup: { findMany: jest.fn(async () => []) },
      group: { findMany: jest.fn(async () => []) },
      activityLog: { create: jest.fn(async () => ({})) },
      publicationTrace: { create: jest.fn(async (args: any) => args) },
    };

    const result = await service(prisma).claimBatch({ limit: 10 });

    expect(prisma.postTarget.updateMany).toHaveBeenCalled();

    expect(result.claimed).toBe(0);
    expect(result.skipped[0].status).toBe('empty');
  });
});
