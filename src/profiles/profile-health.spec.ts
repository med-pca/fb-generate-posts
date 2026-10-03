import { healthOf, rankCandidates } from './profile-health';
import { ProfileHealthService } from './profile-health.service';

const base = { published: 0, failed: 0, verifiedOk: 0, verifiedBad: 0, withLink: 0, linkPlaced: 0, failStreak: 0, claimsLost: 0 };

describe('healthOf', () => {
  it('un profil qui publie bien, vérifié, avec ses liens : bon', () => {
    const h = healthOf({ ...base, published: 40, failed: 1, verifiedOk: 20, withLink: 40, linkPlaced: 39 });
    expect(h.label).toBe('good');
    expect(h.score).toBeGreaterThanOrEqual(90);
    expect(h.suggestDeactivate).toBe(false);
  });

  it('beaucoup d’échecs et une série en cours : mauvais, et l’indice de le désactiver avec ses raisons', () => {
    const h = healthOf({ ...base, published: 3, failed: 9, failStreak: 5, withLink: 3, linkPlaced: 1 });
    expect(h.label).toBe('bad');
    expect(h.suggestDeactivate).toBe(true);
    expect(h.reasons.join(' | ')).toMatch(/5 échecs d'affilée/);
    expect(h.reasons.join(' | ')).toMatch(/9 échecs en 14 jours/);
  });

  it('publie, mais ses posts sont introuvables au contrôle : signalé', () => {
    const h = healthOf({ ...base, published: 20, verifiedOk: 2, verifiedBad: 8, withLink: 20, linkPlaced: 20 });
    expect(h.reasons.join()).toMatch(/introuvables ou sans lien/);
    expect(h.score).toBeLessThan(80);
  });

  it('trop peu de données : pas de note, sauf série d’échecs', () => {
    expect(healthOf({ ...base, published: 1 })).toMatchObject({ label: 'new', score: null, suggestDeactivate: false });
    expect(healthOf({ ...base, failed: 3, failStreak: 3 }).suggestDeactivate).toBe(true);
  });

  it('le repreneur : d’abord celui qui couvre les groupes, puis le meilleur score', () => {
    const ranked = rankCandidates([
      { id: 'a', score: 95, coverage: 0.2, running: true },
      { id: 'b', score: 70, coverage: 1, running: true },
      { id: 'c', score: 90, coverage: 1, running: false },
      { id: 'd', score: null, coverage: 1, running: true },
    ]);
    expect(ranked.map((r) => r.id)).toEqual(['c', 'b', 'd', 'a']);
  });
});

describe('ProfileHealthService.deactivate', () => {
  function setup() {
    const prisma: any = {
      profile: {
        findFirst: jest.fn(async ({ where }: any) =>
          where.id === 'p1'
            ? { id: 'p1', name: 'Salim', status: 'ACTIVE', ownerId: 'u1', runner: null }
            : where.id === 'p2'
              ? { id: 'p2', name: 'Nadia' }
              : null,
        ),
        findMany: jest.fn(async () => [
          { id: 'p2', name: 'Nadia', runner: { mode: 'AUTO' }, profileGroups: [{ groupId: 'g1' }] },
        ]),
        update: jest.fn((args: any) => ({ op: 'profile.update', args })),
      },
      postTarget: {
        findMany: jest.fn(async () => [{ id: 't1', groupId: 'g1' }, { id: 't2', groupId: 'g2' }]),
        updateMany: jest.fn((args: any) => ({ op: 'postTarget.updateMany', args, count: 1 })),
      },
      post: {
        findMany: jest.fn(async () => [{ id: 'post1', targets: [{ groupId: 'g1' }] }]),
        updateMany: jest.fn((args: any) => ({ op: 'post.updateMany', args, count: 1 })),
      },
      publicationJob: {
        count: jest.fn(async () => 1),
        findMany: jest.fn(async () => [{ id: 'job1' }]),
      },
      profileGroup: {
        findMany: jest.fn(async ({ where }: any) => (where.profileId === 'p2' ? [{ groupId: 'g1' }] : [{ groupId: 'g1' }])),
      },
      group: { findMany: jest.fn(async () => [{ id: 'g2', name: 'Cuisine', url: 'https://facebook.com/groups/2' }]) },
      profileRunner: { updateMany: jest.fn((args: any) => ({ op: 'runner', args })) },
      activityLog: { create: jest.fn(async (args: any) => args) },
      $queryRaw: jest.fn(async () => []),
      $transaction: jest.fn(async (ops: any[]) => ops),
    };
    const jobs: any = { release: jest.fn(async () => ({ released: 3 })) };
    return { service: new ProfileHealthService(prisma, jobs), prisma, jobs };
  }

  it('libère son lot, confie ses posts au repreneur là où il est membre, signale les groupes orphelins', async () => {
    const { service, prisma, jobs } = setup();
    const r = await service.deactivate('p1', 'p2', null, new Date('2026-10-03T12:00:00Z'));
    expect(jobs.release).toHaveBeenCalledWith('job1', null, 'profil « Salim » désactivé');
    const calls = prisma.postTarget.updateMany.mock.calls.map((c: any) => c[0]);
    // Forcées vers lui → au repreneur dans ses groupes, puis le reste rendu à la file.
    expect(calls[0]).toMatchObject({ where: { forcedProfileId: 'p1', groupId: { in: ['g1'] } }, data: { forcedProfileId: 'p2' } });
    expect(calls[1]).toMatchObject({ where: { forcedProfileId: 'p1' }, data: { forcedProfileId: null } });
    // Ses posts deviennent des posts ouverts de son compte, priorité au repreneur.
    expect(prisma.post.updateMany.mock.calls[0][0]).toMatchObject({ where: { id: { in: ['post1'] } }, data: { profileId: null, ownerId: 'u1' } });
    expect(calls[2]).toMatchObject({ where: { postId: { in: ['post1'] }, groupId: { in: ['g1'] } }, data: { forcedProfileId: 'p2' } });
    expect(prisma.profile.update.mock.calls[0][0]).toMatchObject({ where: { id: 'p1' }, data: { status: 'INACTIVE' } });
    expect(prisma.profileRunner.updateMany.mock.calls[0][0].data).toEqual({ mode: 'OFF' });
    expect(r.transferredTo).toEqual({ id: 'p2', name: 'Nadia' });
    expect(r.released).toBe(3);
    expect(r.orphanGroups).toEqual([{ id: 'g2', name: 'Cuisine', url: 'https://facebook.com/groups/2' }]);
    expect(prisma.activityLog.create.mock.calls[0][0].data.eventType).toBe('PROFILE_DEACTIVATED');
  });

  it('refuse de transférer à lui-même ou à un profil inactif', async () => {
    const { service } = setup();
    await expect(service.deactivate('p1', 'p1', null)).rejects.toThrow('AUTRE profil');
    await expect(service.deactivate('p1', 'zz', null)).rejects.toThrow('actif');
  });
});
