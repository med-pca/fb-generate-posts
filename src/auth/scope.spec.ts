import { RecordStatus, Role } from '@prisma/client';
import type { CurrentUser } from './current-user';
import {
  articleWhere,
  groupManageWhere,
  groupWhere,
  logWhere,
  postWhere,
  profileWhere,
  scopeOf,
  seesEverything,
  siteManageWhere,
  siteWhere,
} from './scope';

const as = (role: Role): CurrentUser => ({
  id: 'u1',
  username: 'sofia',
  role,
  status: RecordStatus.ACTIVE,
});

describe('scopeOf', () => {
  it('ne borne rien pour un administrateur', () => {
    expect(scopeOf(as(Role.ADMIN))).toBeNull();
    expect(seesEverything(scopeOf(as(Role.ADMIN)))).toBe(true);
  });

  /** La clé globale d'automatisation n'appartient à personne et précède les
   * comptes : les automates déjà en place continuent de tout voir. */
  it('ne borne rien pour la clé globale', () => {
    expect(scopeOf(null)).toBeNull();
    expect(scopeOf(undefined)).toBeNull();
  });

  it('borne un gestionnaire à ce qu’il possède', () => {
    expect(scopeOf(as(Role.MANAGER))).toEqual({ ownerId: 'u1' });
  });
});

describe('les conditions de lecture', () => {
  const manager = scopeOf(as(Role.MANAGER));
  const admin = scopeOf(as(Role.ADMIN));

  it('laissent tout passer pour un administrateur', () => {
    for (const where of [
      profileWhere,
      postWhere,
      articleWhere,
      logWhere,
      groupWhere,
      siteWhere,
      groupManageWhere,
      siteManageWhere,
    ]) {
      expect(where(admin)).toEqual({});
    }
  });

  it('filtrent les racines sur leur propriétaire', () => {
    expect(profileWhere(manager)).toEqual({ ownerId: 'u1' });
  });

  /** Ce qui hérite n'a pas de colonne à lui : un post appartient au
   * propriétaire de son profil, un article à celui de son site. */
  it('font hériter les posts et les articles', () => {
    // Un post ouvert porte son propriétaire ; un ancien post, son profil.
    expect(postWhere(manager)).toEqual({
      OR: [{ ownerId: 'u1' }, { profile: { ownerId: 'u1' } }],
    });
    expect(articleWhere(manager)).toEqual({ source: { ownerId: 'u1' } });
  });

  it('rattachent un journal à son profil ou à son groupe, partagé compris', () => {
    expect(logWhere(manager)).toEqual({
      OR: [
        { profile: { ownerId: 'u1' } },
        { group: { ownerId: 'u1' } },
        { group: { access: { some: { userId: 'u1' } } } },
      ],
    });
  });

  /** Un partage donne le droit de PUBLIER, pas de gérer. Confondre les deux
   * conditions laisserait un bénéficiaire renommer le groupe d'un autre. */
  it('ouvrent la lecture aux ressources partagées', () => {
    for (const where of [groupWhere, siteWhere]) {
      expect(where(manager)).toEqual({
        OR: [{ ownerId: 'u1' }, { access: { some: { userId: 'u1' } } }],
      });
    }
  });

  it('réservent la gestion au propriétaire', () => {
    expect(groupManageWhere(manager)).toEqual({ ownerId: 'u1' });
    expect(siteManageWhere(manager)).toEqual({ ownerId: 'u1' });
  });

  it('distinguent bien les deux : gérer est plus étroit que lire', () => {
    expect(groupManageWhere(manager)).not.toEqual(groupWhere(manager));
    expect(siteManageWhere(manager)).not.toEqual(siteWhere(manager));
  });

  /** Le point qui rend un oubli sûr : une ressource sans propriétaire ne
   * correspond à aucune condition de gestionnaire, donc reste invisible —
   * plutôt que partagée par accident. */
  it('ne font jamais correspondre une ressource sans propriétaire', () => {
    const where = profileWhere(manager) as { ownerId?: string | null };
    expect(where.ownerId).toBe('u1');
    expect(where.ownerId).not.toBeNull();
  });
});
