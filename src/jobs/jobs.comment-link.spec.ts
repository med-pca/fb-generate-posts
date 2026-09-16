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

function service(prisma: any, settings: any = { replenishProfile: jest.fn() }) {
  const config = { get: (_: string, fallback: number) => fallback };
  return new JobsService(prisma, config as any, settings as any);
}

describe('JobsService — publication sans URL puis commentaire', () => {
  it('ne transmet jamais l’URL dans le lot réservé', async () => {
    const tx: any = {
      publicationJob: {
        updateMany: jest.fn(async () => ({})),
        create: jest.fn(async () => ({
          id: 'job_1',
          claimExpiresAt: EXPIRES,
          profile: { id: 'p1', externalId: 'demo', name: 'Profil', defaultImageUrl: 'https://img/default.jpg' },
          group: { id: 'g1', externalId: 'grp', name: 'Groupe', url: 'https://facebook.com/groups/1' },
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
      profile: { findFirst: jest.fn(async () => ({ id: 'p1', minPostsPerJob: 1, maxPostsPerJob: 1 })) },
      group: { findFirst: jest.fn(async () => ({ id: 'g1' })) },
      $transaction: jest.fn(async (cb: any) => cb(tx)),
    };

    const result = await service(prisma).claim({ profileId: 'p1', groupId: 'g1' });

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
      publicationJob: { update: jest.fn(async ({ data }: any) => ({ id: 'job_1', ...data })) },
      activityLog: { create: jest.fn(async () => ({})) },
    };
    const prisma: any = {
      publicationJob: {
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
      publicationJob: { update: jest.fn(async ({ data }: any) => ({ id: 'job_1', ...data })) },
      activityLog: { create: jest.fn(async () => ({})) },
    };
    const prisma: any = {
      publicationJob: {
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
        findUnique: jest.fn(async () => ({
          id: 'job_1',
          status: JobStatus.AWAITING_LINK,
          completedAt: EXPIRES,
          profile: { id: 'p1', name: 'Profil', externalId: 'demo' },
          group: { id: 'g1', name: 'Groupe', externalId: 'grp' },
          items: [item(), item({ postId: 'post_2', linkUpdatedAt: new Date() })],
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
    };
    const prisma: any = {
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

describe('JobsService — réservation par lot', () => {
  it('écarte un profil qui tient déjà un job', async () => {
    const prisma: any = {
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
      activityLog: { create: jest.fn(async () => ({})) },
    };

    const result = await service(prisma).claimBatch({ limit: 10 });

    expect(result.claimed).toBe(0);
    expect(result.skipped).toHaveLength(2);
    expect(result.skipped.every((entry: any) => entry.status === 'busy')).toBe(true);
    expect(prisma.activityLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ eventType: 'JOBS_BATCH_CLAIMED' }),
      }),
    );
  });

  it('rend un profil libre mais sans stock comme « empty »', async () => {
    const prisma: any = {
      profile: {
        findMany: jest.fn(async () => [{ id: 'p1', name: 'Profil 1', externalId: 'demo-1' }]),
        findFirst: jest.fn(async () => ({ id: 'p1' })),
      },
      publicationJob: { findFirst: jest.fn(async () => null) },
      group: { findMany: jest.fn(async () => []) },
      activityLog: { create: jest.fn(async () => ({})) },
    };

    const result = await service(prisma).claimBatch({ limit: 10 });

    expect(result.claimed).toBe(0);
    expect(result.skipped[0].status).toBe('empty');
  });
});
