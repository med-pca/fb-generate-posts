import { ProfilesService } from './profiles.service';

/** « Remettre au travail » : un compte récupéré retrouve son mode d'avant. */
function setup(profile: Record<string, unknown>, runnerMode: string | null) {
  const state = { profile: { id: 'p1', name: 'Salma', ...profile }, runner: runnerMode ? { mode: runnerMode } : null as { mode: string } | null, logs: [] as any[] };
  const prisma: any = {
    profile: {
      findFirst: jest.fn(async () => ({ ...state.profile })),
      update: jest.fn(async ({ data }: any) => Object.assign(state.profile, data)),
    },
    profileRunner: {
      findUnique: jest.fn(async () => state.runner),
      upsert: jest.fn(async ({ create, update }: any) => (state.runner = state.runner ? { ...state.runner, ...update } : { ...create })),
    },
    profileGroup: { updateMany: jest.fn(async () => ({ count: 0 })) },
    activityLog: { create: jest.fn(async (a: any) => state.logs.push(a.data)) },
  };
  return { state, service: new ProfilesService(prisma, {} as any) };
}

describe('Remettre au travail un profil arrêté par Facebook', () => {
  it('vérification passée : retrouve son mode d’avant (marche forcée)', async () => {
    const t = setup({ facebookSuspension: 'checkpoint', modeBeforeSuspension: 'ON' }, 'OFF');
    const r = await t.service.clearSuspension('p1', null, { resume: true });
    expect(r.mode).toBe('ON');
    expect(t.state.runner?.mode).toBe('ON');
    expect(t.state.profile).toMatchObject({ facebookSuspension: null, modeBeforeSuspension: null });
    expect(t.state.logs[0].message).toMatch(/remis au travail.*après une vérification Facebook/);
  });

  it('mode d’avant inconnu (ancienne suspension) : AUTO', async () => {
    const t = setup({ facebookSuspension: 'checkpoint', modeBeforeSuspension: null }, 'OFF');
    expect((await t.service.clearSuspension('p1', null, { resume: true })).mode).toBe('AUTO');
  });

  it('déconnecté (mode jamais coupé) : garde son mode actuel', async () => {
    const t = setup({ facebookSuspension: 'logged_out', modeBeforeSuspension: null }, 'ON');
    expect((await t.service.clearSuspension('p1', null, { resume: true })).mode).toBe('ON');
  });

  it('sans « resume » : l’arrêt est levé, le mode reste à rallumer (comme avant)', async () => {
    const t = setup({ facebookSuspension: 'checkpoint', modeBeforeSuspension: 'AUTO' }, 'OFF');
    const r = await t.service.clearSuspension('p1', null);
    expect(r.mode).toBeNull();
    expect(t.state.runner?.mode).toBe('OFF');
  });
});
