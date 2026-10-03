import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { assertMayManage, isAdmin } from '../auth/moderator-guard';
import { ModeratorsService } from './moderators.service';

const ADMIN: any = { id: 'a', username: 'admin', role: 'ADMIN', status: 'ACTIVE' };
const MANAGER: any = { id: 'm', username: 'sofia', role: 'MANAGER', status: 'ACTIVE' };
const NOW = new Date('2026-10-03T12:00:00Z');

describe('protection des modérateurs', () => {
  it('un gestionnaire ne touche pas à un profil modérateur', () => {
    expect(() => assertMayManage({ isModerator: true }, MANAGER)).toThrow(ForbiddenException);
    expect(() => assertMayManage({ isModerator: true }, ADMIN)).not.toThrow();
    expect(() => assertMayManage({ isModerator: false }, MANAGER)).not.toThrow();
    // La clé globale d'automatisation reste l'administrateur.
    expect(() => assertMayManage({ isModerator: true }, null)).not.toThrow();
    expect(isAdmin(MANAGER)).toBe(false);
  });
});

function setup(profile: Record<string, unknown> = {}) {
  const moderator = {
    id: 'mod1',
    name: 'Modo',
    status: 'ACTIVE',
    isModerator: true,
    externalId: 'ext',
    facebookUserId: null,
    moderatorPaused: false,
    moderatorRunAt: null,
    moderatorMembersRunAt: null,
    moderatorBatch: 5,
    moderatorEveryMinutes: 10,
    moderatorMembers: true,
    moderatorSeenAt: new Date('2026-10-03T11:59:00Z'),
    moderatorAgent: null,
    ...profile,
  };
  const prisma: any = {
    profile: {
      findFirst: jest.fn(async () => moderator),
      findMany: jest.fn(async () => [moderator]),
      update: jest.fn(async ({ data }: any) => ({ ...moderator, ...data })),
    },
    postTarget: { updateMany: jest.fn(async () => ({ count: 3 })) },
    profileGroup: { updateMany: jest.fn(async () => ({ count: 2 })) },
    activityLog: { create: jest.fn(async (a: any) => a), findMany: jest.fn(async () => []) },
    automationSetting: { findUnique: jest.fn(async () => null) },
    $queryRaw: jest.fn(async () => []),
  };
  const verify: any = { moderator: jest.fn(async () => moderator), stats: jest.fn(async () => ({ due: 4, needsAction: 1 })) };
  const members: any = { overview: jest.fn(async () => ({ due: 2, problems: [] })) };
  return { service: new ModeratorsService(prisma, verify, members), prisma };
}

describe('ModeratorsService', () => {
  it('liste les modérateurs avec leur état (en ligne) et ce qui attend', async () => {
    const { service, prisma } = setup();
    const r = await service.list(ADMIN, NOW);
    expect(prisma.profile.findMany.mock.calls[0][0].where.isModerator).toBe(true);
    expect(r.due).toEqual({ verifications: 4, needsAction: 1, members: 2 });
    expect(r.moderators[0].settings).toMatchObject({ online: true, paused: false, batchSize: 5 });
  });

  it('« Lancer un passage » est noté pour l’extension, et refusé si suspendu', async () => {
    const a = setup();
    const r = await a.service.run('mod1', ADMIN, 'posts', NOW);
    expect(a.prisma.profile.update.mock.calls[0][0].data).toEqual({ moderatorRunAt: NOW });
    expect(r.online).toBe(true);
    const b = setup({ moderatorPaused: true });
    await expect(b.service.run('mod1', ADMIN, 'posts', NOW)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('l’extension relit ses réglages et se signale en ligne', async () => {
    const { service, prisma } = setup({ moderatorRunAt: NOW, moderatorBatch: 8 });
    const r = await service.control('ext', 'checker 1.3.0', null, NOW);
    expect(prisma.profile.update.mock.calls[0][0].data).toEqual({ moderatorSeenAt: NOW, moderatorAgent: 'checker 1.3.0' });
    expect(r).toMatchObject({ runRequestedAt: NOW, batchSize: 8, online: true });
  });

  it('réglages, revérification, relance des adhésions : journalisés', async () => {
    const { service, prisma } = setup();
    await service.updateSettings('mod1', { paused: true, batchSize: 10 }, ADMIN);
    expect(prisma.profile.update.mock.calls[0][0].data).toEqual({ moderatorPaused: true, moderatorBatch: 10 });
    expect((await service.recheck('mod1', ADMIN)).requeued).toBe(3);
    expect((await service.retryMembers('mod1', ADMIN)).requeued).toBe(2);
    expect(prisma.activityLog.create.mock.calls.map((c: any) => c[0].data.eventType)).toEqual([
      'MODERATOR_SETTINGS',
      'MODERATOR_RECHECK',
      'MODERATOR_RETRY_MEMBERS',
    ]);
  });

  it('les tâches « nos profils » ont leur propre déclencheur, séparé des posts', async () => {
    const { service, prisma } = setup();
    const r = await service.run('mod1', ADMIN, 'members', NOW);
    expect(prisma.profile.update.mock.calls[0][0].data).toEqual({ moderatorMembersRunAt: NOW });
    expect(r.kind).toBe('members');
    expect(prisma.activityLog.create.mock.calls[0][0].data.eventType).toBe('MODERATOR_MEMBERS_RUN_REQUESTED');
    const off = setup({ moderatorMembers: false });
    await expect(off.service.run('mod1', ADMIN, 'members', NOW)).rejects.toThrow('désactivées');
  });
});
