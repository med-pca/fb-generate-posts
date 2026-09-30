import { keyHash, pairingHealth } from './pairing';

const now = new Date('2026-09-30T12:00:00Z');
const hoursAgo = (h: number) => new Date(now.getTime() - h * 3_600_000);
const runner = (over: Record<string, unknown> = {}) => ({
  pairedAt: hoursAgo(48),
  pairCode: null,
  pairCodeExpiresAt: null,
  pairedKeyHash: keyHash('cle-du-compte'),
  pairedExternalId: 'ext-1',
  keyRejectedAt: null,
  keyRejectReason: null,
  lastSeenAt: hoursAgo(0.1),
  ...over,
});
const profile = { externalId: 'ext-1' };
const current = keyHash('cle-du-compte');
const state = (over: Record<string, unknown> = {}, currentKey: string | null = current, p = profile) =>
  pairingHealth(runner(over) as any, p, currentKey, now);

describe('pairingHealth — l’état réel d’un appairage', () => {
  it('confirmé par un battement récent', () => {
    expect(state()).toMatchObject({ state: 'confirmed', broken: false });
  });

  it('jamais appairé, ou code en attente', () => {
    expect(pairingHealth(null, profile, current, now).state).toBe('never');
    expect(
      state({ pairedAt: null, pairCode: 'ABCD2345', pairCodeExpiresAt: hoursAgo(-0.1) }).state,
    ).toBe('code_pending');
  });

  it('cassé si la clé du compte a changé depuis (clé régénérée, autre propriétaire)', () => {
    const health = state({}, keyHash('nouvelle-cle'));
    expect(health).toMatchObject({ state: 'key_changed', broken: true });
    expect(health.detail).toMatch(/ré-appairer/);
  });

  it('cassé si l’identifiant NSTBrowser a changé depuis', () => {
    expect(state({}, current, { externalId: 'ext-2' })).toMatchObject({ state: 'id_changed', broken: true });
  });

  it('cassé si le navigateur bat mais se fait refuser', () => {
    const health = state({ keyRejectedAt: hoursAgo(0.01), keyRejectReason: 'clé inconnue', lastSeenAt: hoursAgo(5) });
    expect(health).toMatchObject({ state: 'rejected', broken: true });
    expect(health.detail).toContain('clé inconnue');
  });

  it('un refus effacé par un battement réussi plus récent ne compte plus', () => {
    expect(state({ keyRejectedAt: hoursAgo(5), lastSeenAt: hoursAgo(0.1) }).state).toBe('confirmed');
  });

  it('non confirmé : appairé, mais aucun battement depuis', () => {
    expect(state({ pairedAt: hoursAgo(1), lastSeenAt: hoursAgo(10) }).state).toBe('unconfirmed');
    expect(state({ lastSeenAt: null }).state).toBe('unconfirmed');
  });

  it('à confirmer : plus vu depuis plus d’un jour', () => {
    expect(state({ pairedAt: hoursAgo(200), lastSeenAt: hoursAgo(72) })).toMatchObject({ state: 'stale', broken: false });
  });

  it('un ancien appairage sans empreinte n’est pas déclaré cassé à tort', () => {
    expect(state({ pairedKeyHash: null, pairedExternalId: null }, keyHash('autre')).state).toBe('confirmed');
  });
});
