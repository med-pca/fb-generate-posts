import { ForbiddenException } from '@nestjs/common';
import { MembersService } from './members.service';

const NOW = new Date('2026-10-03T12:00:00Z');

function setup(row: Record<string, any> = {}) {
  const prisma: any = {
    profileGroup: {
      findMany: jest.fn(async () => [
        { id: 'pg1', joinStatus: 'REQUESTED', profile: { name: 'Salim', facebookUserId: '100011', facebookName: 'Salim B.' }, group: { name: 'Recettes', url: 'https://facebook.com/groups/1' } },
        { id: 'pg2', joinStatus: 'JOINED', profile: { name: 'Nadia', facebookUserId: '100022', facebookName: null }, group: { name: 'Cuisine', url: 'https://facebook.com/groups/2' } },
      ]),
      findFirst: jest.fn(async () => ({
        id: 'pg1',
        profileId: 'p1',
        groupId: 'g1',
        memberAttempts: 0,
        profile: { name: 'Salim', facebookUserId: '100011' },
        group: { name: 'Recettes' },
        ...row,
      })),
      update: jest.fn(async (args: any) => args),
      updateMany: jest.fn(async () => ({ count: 2 })),
      count: jest.fn(async () => 0),
    },
    profile: { count: jest.fn(async () => 0) },
    activityLog: { create: jest.fn(async (args: any) => args) },
    $transaction: jest.fn(async (ops: any[]) => ops),
  };
  const verify: any = { moderator: jest.fn(async () => ({ id: 'm1', name: 'Modo' })) };
  return { service: new MembersService(prisma, verify), prisma, verify };
}

describe('MembersService', () => {
  it('ne propose que nos profils dont le compte Facebook est connu, jamais le vérificateur lui-même', async () => {
    const { service, prisma } = setup();
    const res = await service.claim('m', 5, null, NOW);
    const where = prisma.profileGroup.findMany.mock.calls[0][0].where;
    expect(where.profile).toMatchObject({ status: 'ACTIVE', facebookUserId: { not: null }, id: { not: 'm1' } });
    expect(res.tasks).toEqual([
      { taskId: 'pg1', kind: 'approve', member: { facebookUserId: '100011', name: 'Salim B.' }, group: { name: 'Recettes', url: 'https://facebook.com/groups/1' } },
      { taskId: 'pg2', kind: 'preapprove', member: { facebookUserId: '100022', name: 'Nadia' }, group: { name: 'Cuisine', url: 'https://facebook.com/groups/2' } },
    ]);
    expect(prisma.profileGroup.updateMany.mock.calls[0][0].data.memberClaimedUntil).toEqual(new Date('2026-10-03T12:30:00Z'));
  });

  it('adhésion acceptée : le profil devient membre', async () => {
    const { service, prisma } = setup();
    await service.report('pg1', { profileExternalId: 'm', kind: 'approve', outcome: 'done', facebookUserId: '100011' }, null, NOW);
    expect(prisma.profileGroup.update.mock.calls[0][0].data).toMatchObject({ joinStatus: 'JOINED', memberApprovedAt: NOW, memberAttempts: 0 });
    expect(prisma.activityLog.create.mock.calls[0][0].data.eventType).toBe('MEMBER_APPROVED');
  });

  it('pré-approbation enregistrée', async () => {
    const { service, prisma } = setup();
    await service.report('pg1', { profileExternalId: 'm', kind: 'preapprove', outcome: 'done', facebookUserId: '100011' }, null, NOW);
    expect(prisma.profileGroup.update.mock.calls[0][0].data).toMatchObject({ preApprovedAt: NOW });
    expect(prisma.activityLog.create.mock.calls[0][0].data.eventType).toBe('MEMBER_PREAPPROVED');
  });

  it('refuse un rapport pour un autre compte Facebook que celui du profil', async () => {
    const { service, prisma } = setup();
    await expect(
      service.report('pg1', { profileExternalId: 'm', kind: 'preapprove', outcome: 'done', facebookUserId: '999999' }, null, NOW),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.profileGroup.update).not.toHaveBeenCalled();
    expect(prisma.activityLog.create.mock.calls[0][0].data.eventType).toBe('MEMBER_MISMATCH');
  });

  it('sans l’option (pas modérateur) : réessai le lendemain, puis abandon', async () => {
    const a = setup();
    const r = await a.service.report('pg1', { profileExternalId: 'm', kind: 'preapprove', outcome: 'no_permission', facebookUserId: '100011' }, null, NOW);
    expect(r.result).toBe('retry_later');
    expect(a.prisma.profileGroup.update.mock.calls[0][0].data.memberClaimedUntil).toEqual(new Date('2026-10-04T12:00:00Z'));
    expect(a.prisma.profileGroup.update.mock.calls[0][0].data.memberActionError).toMatch(/administrateur ou modérateur/);

    const b = setup({ memberAttempts: 5 });
    const g = await b.service.report('pg1', { profileExternalId: 'm', kind: 'approve', outcome: 'not_found', facebookUserId: '100011' }, null, NOW);
    expect(g.result).toBe('gave_up');
  });
});

describe('MembersService — actions demandées par l’admin', () => {
  function req(blocked: any[] = [], moderators: any[] = [{ id: 'mod', moderatorPaused: false, moderatorMembers: true }]) {
    const prisma: any = {
      profileGroup: {
        updateMany: jest.fn(async () => ({ count: 6 })),
        findMany: jest.fn(async () => blocked),
        count: jest.fn(async () => 2),
      },
      profile: { findMany: jest.fn(async () => moderators), updateMany: jest.fn(async () => ({ count: 1 })) },
      activityLog: { create: jest.fn(async (a: any) => a) },
    };
    return { service: new MembersService(prisma, { moderator: jest.fn() } as any), prisma };
  }
  const NOW2 = new Date('2026-10-03T12:00:00Z');

  it('pré-approuver nos profils membres : en tête de file, modérateur réveillé, journalisé', async () => {
    const { service, prisma } = req();
    const r = await service.request('preapprove', {}, null, NOW2);
    const call = prisma.profileGroup.updateMany.mock.calls[0][0];
    expect(call.where).toMatchObject({ joinStatus: 'JOINED', preApprovedAt: null, profile: { isModerator: false, facebookUserId: { not: null } } });
    expect(call.data).toMatchObject({ memberRequestedAt: NOW2, memberAttempts: 0, memberActionError: null });
    expect(prisma.profile.updateMany.mock.calls[0][0].data).toEqual({ moderatorRunAt: NOW2 });
    expect(r).toMatchObject({ requested: 6, moderators: 1, blocked: { noFacebookId: 0 } });
    expect(prisma.activityLog.create.mock.calls[0][0].data.eventType).toBe('MEMBER_ACTION_REQUESTED');
  });

  it('dit pourquoi certains profils ne peuvent pas être traités (compte Facebook inconnu)', async () => {
    const { service, prisma } = req([{ profile: { name: 'Nadia' } }, { profile: { name: 'Nadia' } }, { profile: { name: 'Omar' } }]);
    const r = await service.request('approve', {}, null, NOW2);
    expect(r.blocked).toEqual({ noFacebookId: 3, profiles: ['Nadia', 'Omar'] });
    expect(prisma.activityLog.create.mock.calls[0][0].data.message).toMatch(/compte Facebook inconnu \(Nadia, Omar\)/);
  });

  it('prévient quand aucun modérateur ne peut le faire', async () => {
    const { service, prisma } = req([], [{ id: 'mod', moderatorPaused: true, moderatorMembers: true }]);
    const r = await service.request('preapprove', { profileGroupIds: ['pg1'] }, null, NOW2);
    expect(r.moderators).toBe(0);
    expect(prisma.profile.updateMany).not.toHaveBeenCalled();
    expect(prisma.activityLog.create.mock.calls[0][0].data.message).toMatch(/AUCUN modérateur actif/);
  });
});
