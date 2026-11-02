import { missingWhy } from './link-why';

const base = { approvalPendingSince: null, verifyDetail: null, rescueStatus: null, rescueDetail: null, facebookUrl: 'https://facebook.com/groups/1/posts/2', jobItems: [] };
const now = new Date('2026-11-02T12:00:00Z');

describe('missingWhy — pourquoi le lien est manquant', () => {
  it('en attente de validation, puis refusé ou spam après 24 h', () => {
    expect(missingWhy({ ...base, approvalPendingSince: new Date('2026-11-02T08:00:00Z') }, now).title).toContain('En attente de validation');
    expect(missingWhy({ ...base, approvalPendingSince: new Date('2026-10-31T08:00:00Z') }, now).title).toContain('Refusé ou spam');
  });
  it('introuvable pour le vérificateur : supprimé ou spam', () =>
    expect(missingWhy({ ...base, verifyDetail: 'post introuvable : absent du groupe' }, now).code).toBe('removed'));
  it('sauvetage en cours ou échoué', () => {
    expect(missingWhy({ ...base, rescueStatus: 'pending' }, now).code).toBe('rescue');
    expect(missingWhy({ ...base, rescueStatus: 'failed', rescueDetail: 'aucun autre de nos profils dans ce groupe' }, now).detail).toContain('aucun autre');
  });
  it('adresse inconnue, commentaire refusé, sinon raison inconnue', () => {
    expect(missingWhy({ ...base, facebookUrl: null }, now).code).toBe('no_url');
    expect(missingWhy({ ...base, jobItems: [{ error: 'Commentaires désactivés' }] }, now).detail).toContain('Commentaires désactivés');
    expect(missingWhy(base, now).code).toBe('unknown');
  });
});
