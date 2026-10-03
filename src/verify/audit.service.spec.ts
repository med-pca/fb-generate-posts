import { ForbiddenException } from '@nestjs/common';
import { AuditService } from './audit.service';

const NOW = new Date('2026-10-03T12:00:00Z');

function setup(row: Record<string, unknown> = {}) {
  const prisma: any = {
    profileGroup: {
      updateMany: jest.fn(async () => ({ count: 3 })),
      findMany: jest.fn(async () => [
        { id: 'pg1', auditMode: 'check', profile: { name: 'Salim', facebookUserId: '100011', facebookName: null }, group: { name: 'Recettes', url: 'https://facebook.com/groups/1' } },
      ]),
      findFirst: jest.fn(async () => ({
        id: 'pg1', profileId: 'p1', groupId: 'g1', preApprovedAt: null, auditMode: 'check',
        profile: { name: 'Salim', facebookUserId: '100011' }, group: { name: 'Recettes', url: 'https://facebook.com/groups/1' }, ...row,
      })),
      update: jest.fn((a: any) => a),
    },
    profile: { updateMany: jest.fn(async () => ({ count: 1 })) },
    activityLog: { create: jest.fn((a: any) => a) },
    $transaction: jest.fn(async (ops: any[]) => ops),
  };
  const verify: any = { moderator: jest.fn(async () => ({ id: 'm1', name: 'Modo', moderatorPaused: false })) };
  return { service: new AuditService(prisma, verify), prisma };
}
const report = (service: AuditService, outcome: any, detail = '') =>
  service.report('pg1', { profileExternalId: 'm', outcome, facebookUserId: '100011', detail }, null, NOW);

describe('AuditService', () => {
  it('demander un test sur un seul groupe réveille les modérateurs, et se journalise', async () => {
    const { service, prisma } = setup();
    const r = await service.request({ mode: 'check', profileGroupIds: ['pg1'] }, null, NOW);
    expect(prisma.profileGroup.updateMany.mock.calls[0][0].where.id).toEqual({ in: ['pg1'] });
    expect(prisma.profileGroup.updateMany.mock.calls[0][0].data).toMatchObject({ auditRequestedAt: NOW, auditMode: 'check' });
    expect(prisma.profile.updateMany.mock.calls[0][0].data).toEqual({ moderatorRunAt: NOW });
    expect(r).toEqual({ requested: 3, moderators: 1 });
    expect(prisma.activityLog.create.mock.calls[0][0].data.eventType).toBe('MEMBER_AUDIT_REQUESTED');
  });

  it('ne contrôle que nos profils membres, au compte Facebook connu, jamais un modérateur', async () => {
    const { service, prisma } = setup();
    const r = await service.claim('m', 5, null, NOW);
    const where = prisma.profileGroup.findMany.mock.calls[0][0].where;
    expect(where).toMatchObject({ joinStatus: 'JOINED', profile: { isModerator: false, facebookUserId: { not: null } }, profileId: { not: 'm1' } });
    expect(r.tasks[0]).toMatchObject({ taskId: 'pg1', mode: 'check', member: { facebookUserId: '100011' } });
  });

  it('« déjà fait » : enregistré pré-approuvé, journalisé avec ce qui a été vu', async () => {
    const { service, prisma } = setup();
    const r = await report(service, 'already', 'menu : Retirer la pré-approbation');
    expect(r.state).toBe('PREAPPROVED');
    const data = prisma.profileGroup.update.mock.calls[0][0].data;
    expect(data).toMatchObject({ preApprovalState: 'PREAPPROVED', preApprovedAt: NOW, auditRequestedAt: null });
    const log = prisma.activityLog.create.mock.calls[0][0].data;
    expect(log.eventType).toBe('MEMBER_AUDIT_ALREADY');
    expect(log.message).toMatch(/déjà pré-approuvé.*vu : menu : Retirer la pré-approbation/);
  });

  it('« pas fait » : rien modifié sur Facebook, la plateforme le remet à faire', async () => {
    const { service, prisma } = setup({ preApprovedAt: new Date('2026-09-01') });
    await report(service, 'not_done');
    const data = prisma.profileGroup.update.mock.calls[0][0].data;
    expect(data).toMatchObject({ preApprovalState: 'NOT_PREAPPROVED', preApprovedAt: null, memberAttempts: 0 });
    expect(prisma.activityLog.create.mock.calls[0][0].data).toMatchObject({ eventType: 'MEMBER_AUDIT_NOT_DONE', level: 'WARN' });
  });

  it('« corrigé » en mode fix', async () => {
    const { service, prisma } = setup({ auditMode: 'fix' });
    await report(service, 'fixed');
    expect(prisma.activityLog.create.mock.calls[0][0].data.eventType).toBe('MEMBER_AUDIT_FIXED');
  });

  it('page illisible : réessai, la demande reste', async () => {
    const { service, prisma } = setup();
    const r = await report(service, 'unreachable');
    expect(r.result).toBe('retry_later');
    expect(prisma.profileGroup.update.mock.calls[0][0].data.auditRequestedAt).toBeUndefined();
  });

  it('refuse un constat pour un autre compte Facebook', async () => {
    const { service } = setup();
    await expect(
      service.report('pg1', { profileExternalId: 'm', outcome: 'already', facebookUserId: '999999' }, null, NOW),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
