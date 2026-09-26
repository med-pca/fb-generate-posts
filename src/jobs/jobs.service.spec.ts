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
  };
  const prisma: any = {
    publicationJobItem: { findUnique: jest.fn(async () => item) },
    publicationJob: {
      findUnique: jest.fn(async () => ({
        id: 'job_1',
        profileId: 'profile_1',
        groupId: 'group_1',
        items,
      })),
      update: jest.fn(async ({ data }: any) => data),
    },
    activityLog: { create: jest.fn(async () => ({})) },
    $transaction: jest.fn(async (cb: any) => cb(tx)),
  };
  const service = new JobsService(prisma, {} as any, {} as any);
  return { service, prisma, tx };
}

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
          externalPostUrl: 'https://www.facebook.com/groups/1/posts/2/',
        }),
      }),
    );
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
        data: expect.objectContaining({ eventType: 'CLAIM_LOST', level: 'ERROR' }),
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
    await expect(service.complete('job_1')).rejects.toThrow(BadRequestException);
  });

  it('clôture en PARTIALLY_COMPLETED quand un post a échoué', async () => {
    const { service, tx } = makeHarness(null, [
      { status: TargetStatus.PUBLISHED },
      { status: TargetStatus.FAILED, postId: 'post_2' },
    ]);
    await service.complete('job_1');
    expect(tx.publicationJob.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: JobStatus.PARTIALLY_COMPLETED }),
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
        findFirst: jest.fn(async () => ({ id: 'profile_1', status: 'ACTIVE' })),
      },
      publicationJob: { findFirst: jest.fn(async () => null) },
      publicationJobItem: {},
      postTarget: { updateMany: jest.fn(async () => ({ count: 0 })) },
      group: {
        findFirst: jest.fn(async () => null),
        findMany: jest.fn(async () => []),
      },
      activityLog: { create: jest.fn(async () => ({})) },
    };
    prisma.publicationJob.updateMany = jest.fn(async () => ({ count: 0 }));
    const settings: any = { replenishProfile: jest.fn(async () => ({})) };
    const service = new JobsService(prisma, {} as any, settings);
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
});
