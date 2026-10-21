import { CampaignsService, type DayPlan } from './campaigns.service';
import { stateGroupNames, wantedNstGroup, withSuspension } from '../runners/runners.service';

const svc = new CampaignsService({} as any);
const campaign = (over: Partial<DayPlan['campaigns'][number]>): DayPlan['campaigns'][number] => ({
  id: 'c',
  name: 'Tera',
  closed: null,
  ownerId: null,
  ownerIsAdmin: true,
  managed: false,
  profileIds: [],
  teamToday: null,
  max: null,
  used: new Map(),
  where: { post: { article: { sourceId: 's' } } },
  ...over,
});
const me = { id: 'p1', ownerId: 'u1', team: 'A' };

describe('profileDay — rotation, plafond, repos', () => {
  it('sans campagne : jamais au repos, rien d’exclu', () => {
    expect(svc.profileDay(me, { campaigns: [] })).toMatchObject({ resting: false, exclude: null, left: null });
  });

  it('sans rotation ni plafond : pas de repos, mais ses posts restent à ses profils', () => {
    const c = campaign({ profileIds: ['autre'] });
    const day = svc.profileDay(me, { campaigns: [c] });
    expect(day.resting).toBe(false);
    expect(day.exclude).toEqual({ OR: [{ OR: [c.where] }] });
  });

  it('son équipe est de service : il travaille', () => {
    const day = svc.profileDay(me, { campaigns: [campaign({ managed: true, teamToday: 'A' })] });
    expect(day).toMatchObject({ resting: false, exclude: null, campaigns: ['Tera'] });
  });

  it('pas son équipe aujourd’hui, aucune autre campagne : repos complet', () => {
    const day = svc.profileDay(me, { campaigns: [campaign({ managed: true, teamToday: 'B' })] });
    expect(day.resting).toBe(true);
    expect(day.reason).toContain('pas son équipe');
  });

  it('pas son équipe ici, mais du travail ailleurs : il travaille, sans les cibles de la campagne à rotation', () => {
    const rot = campaign({ id: 'r', name: 'Rotation', managed: true, teamToday: 'B', where: { groupId: 'g1' } });
    const other = campaign({ id: 'o', name: 'Autre', where: { groupId: 'g2' } });
    const day = svc.profileDay(me, { campaigns: [rot, other] });
    expect(day.resting).toBe(false);
    expect(day.exclude).toEqual({ OR: [{ AND: [{ groupId: 'g1' }, { NOT: { OR: [{ groupId: 'g2' }] } }] }] });
  });

  it('plafond par profil : ce qu’il reste, puis repos une fois atteint', () => {
    const used = new Map([['p1', 3]]);
    expect(svc.profileDay(me, { campaigns: [campaign({ managed: true, max: 5, used })] }).left).toBe(2);
    used.set('p1', 5);
    const day = svc.profileDay(me, { campaigns: [campaign({ managed: true, max: 5, used })] });
    expect(day.resting).toBe(true);
    expect(day.reason).toContain('plafond du jour atteint');
  });

  it('la campagne d’un autre gestionnaire ne le touche pas', () => {
    const day = svc.profileDay(me, { campaigns: [campaign({ managed: true, teamToday: 'B', ownerId: 'u2', ownerIsAdmin: false })] });
    expect(day).toMatchObject({ resting: false, exclude: null });
  });
});

describe('wantedNstGroup — groupes NSTBrowser d’état', () => {
  const names = stateGroupNames({ nstGroupLimited: 'PostFlow · Limités', nstGroupCheckpoint: 'PostFlow · Vérification', nstGroupDisabled: 'PostFlow · Désactivés', nstGroupLoggedOut: 'PostFlow · Déconnectés' });
  const now = new Date('2026-10-14T10:00:00Z');
  const base = { nstGroupId: 'gA', nstGroupName: 'Équipe A', teamNstGroupId: 'gA', teamNstGroupName: 'Équipe A' };

  it('agent ancien (groupe inconnu) : rien', () => {
    expect(wantedNstGroup({ facebookSuspension: 'disabled' }, null, names, now)).toBeNull();
  });
  it('désactivé, vérification, déconnecté, limité : leur groupe', () => {
    expect(wantedNstGroup({ ...base, facebookSuspension: 'disabled' }, null, names, now)?.groupName).toBe('PostFlow · Désactivés');
    expect(wantedNstGroup({ ...base, facebookSuspension: 'checkpoint' }, null, names, now)?.groupName).toBe('PostFlow · Vérification');
    expect(wantedNstGroup({ ...base, facebookSuspension: 'logged_out' }, null, names, now)?.groupName).toBe('PostFlow · Déconnectés');
    expect(wantedNstGroup(base, new Date('2026-10-15T00:00:00Z'), names, now)?.groupName).toBe('PostFlow · Limités');
  });
  it('déjà dans le bon groupe : rien', () => {
    expect(wantedNstGroup({ ...base, nstGroupId: 'gL', nstGroupName: 'PostFlow · Limités' }, new Date('2026-10-15T00:00:00Z'), names, now)).toBeNull();
  });
  it('pause finie : retour dans son équipe', () => {
    expect(wantedNstGroup({ ...base, nstGroupId: 'gL', nstGroupName: 'PostFlow · Limités' }, new Date('2026-10-13T00:00:00Z'), names, now)).toMatchObject({ groupId: 'gA', groupName: 'Équipe A' });
  });
  it('mis à la main dans une autre équipe : on ne le bouge pas', () => {
    expect(wantedNstGroup({ ...base, nstGroupId: 'gB', nstGroupName: 'Équipe B' }, null, names, now)).toBeNull();
  });
  it('nom vide : cet état ne déplace pas', () => {
    expect(wantedNstGroup({ ...base, facebookSuspension: 'disabled' }, null, { ...names, disabled: '' }, now)).toBeNull();
  });
});

describe('withSuspension', () => {
  it('déconnecté : arrêt, raison claire', () => {
    expect(withSuspension({ run: true, reason: 'x' }, 'logged_out')).toEqual({ run: false, reason: 'déconnecté de Facebook : à reconnecter dans ce navigateur' });
    expect(withSuspension({ run: true, reason: 'x' }, null)).toEqual({ run: true, reason: 'x' });
  });
});

describe('Campagne fermée : plage horaire et rythme', () => {
  const where = (site: string) => ({ post: { article: { sourceId: site } } });
  it('ses publications sont fermées à tous les profils, sauf si une campagne ouverte les couvre', () => {
    const plan = { campaigns: [campaign({ id: 'a', name: 'Tera', closed: 'hors de sa plage horaire (08:00 → 22:00)', where: where('s1') })] };
    const day = svc.profileDay({ id: 'p1', ownerId: null, team: null }, plan);
    expect(day.exclude).toEqual({ OR: [{ OR: [where('s1')] }] });
    expect(day.closed[0]).toContain('hors de sa plage horaire');
    const both = { campaigns: [...plan.campaigns, campaign({ id: 'b', name: 'Autre', where: where('s2') })] };
    expect(svc.profileDay({ id: 'p1', ownerId: null, team: null }, both).exclude).toEqual({
      OR: [{ AND: [{ OR: [where('s1')] }, { NOT: { OR: [where('s2')] } }] }],
    });
  });
  it('une campagne à rotation fermée met le profil au repos', () => {
    const plan = { campaigns: [campaign({ managed: true, closed: 'objectif atteint (100/100)', where: where('s1') })] };
    const day = svc.profileDay({ id: 'p1', ownerId: null, team: null }, plan);
    expect(day.resting).toBe(true);
    expect(day.reason).toContain('objectif atteint');
  });
  it('ouverte, elle ne ferme rien', () => {
    const day = svc.profileDay({ id: 'p1', ownerId: null, team: null }, { campaigns: [campaign({ where: where('s1') })] });
    expect(day.exclude).toBeNull();
  });
});

describe('Campagne : sa liste de groupes est respectée', () => {
  const where = { post: { article: { sourceId: 's1' } }, groupId: { in: ['g1'] } };
  const outside = { post: { article: { sourceId: 's1' } }, groupId: { notIn: ['g1'] } };
  it('les posts de son site ne partent pas dans un groupe hors de sa liste', () => {
    const day = svc.profileDay({ id: 'p1', ownerId: null, team: null }, { campaigns: [campaign({ where, outside })] });
    expect(day.exclude).toEqual({ OR: [{ AND: [{ OR: [outside] }, { NOT: { OR: [where] } }] }] });
  });
  it('sauf si une autre campagne ouverte du même site vise ce groupe', () => {
    const other = { post: { article: { sourceId: 's1' } }, groupId: { in: ['g2'] } };
    const day = svc.profileDay({ id: 'p1', ownerId: null, team: null }, {
      campaigns: [campaign({ where, outside }), campaign({ id: 'b', name: 'B', where: other, outside: { post: { article: { sourceId: 's1' } }, groupId: { notIn: ['g2'] } } })],
    });
    expect(JSON.stringify(day.exclude)).toContain('"NOT":{"OR":[' + JSON.stringify(where) + ',' + JSON.stringify(other) + ']}');
  });
});

