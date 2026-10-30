import { CampaignsService, type DayPlan } from './campaigns.service';

describe('assign — chaque publication compte pour UNE campagne', () => {
  const camp = (id: string, extra: Partial<DayPlan['campaigns'][number]> = {}): DayPlan['campaigns'][number] => ({
    id, name: id, closed: null, ownerId: null, ownerIsAdmin: true, managed: false,
    profileIds: [], teamToday: null, max: null, used: new Map(), where: { post: { article: { sourceId: 'site' } } }, ...extra,
  });
  // Deux campagnes sur le même site : leurs périmètres couvrent les mêmes cibles.
  const setup = (campaigns: DayPlan['campaigns'], behind: string[] = []) => {
    const prisma = {
      postTarget: { findMany: jest.fn(async ({ where }: any) => where.AND[0].id.in.map((id: string) => ({ id }))) },
    };
    const svc = new CampaignsService(prisma as any);
    jest.spyOn(svc, 'dayPlan').mockResolvedValue({ campaigns });
    jest.spyOn(svc, 'behind').mockResolvedValue(behind.map((id) => ({ id, priority: 0, deficit: 1, where: {}, profileIds: [] })));
    return svc;
  };

  it('deux campagnes du même site ne se partagent pas une publication', async () => {
    const svc = setup([camp('a'), camp('b')], ['b', 'a']);
    const out = await svc.assign({ id: 'p', ownerId: null }, ['t1', 't2']);
    expect([...out.values()]).toEqual(['b', 'b']);
  });

  it('une campagne fermée passe après une ouverte', async () => {
    const svc = setup([camp('a', { closed: 'objectif atteint' }), camp('b')]);
    expect((await svc.assign({ id: 'p', ownerId: null }, ['t1'])).get('t1')).toBe('b');
  });

  it('une campagne réservée à d’autres profils passe après', async () => {
    const svc = setup([camp('a', { profileIds: ['x'] }), camp('b')]);
    expect((await svc.assign({ id: 'p', ownerId: null }, ['t1'])).get('t1')).toBe('b');
  });
});
