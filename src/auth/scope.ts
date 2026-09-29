import { Prisma, Role } from '@prisma/client';
import type { CurrentUser } from './current-user';

/** Ce qu'un appelant a le droit de voir.
 *
 * Une seule règle, écrite une fois : un `ADMIN` et la clé globale voient
 * tout ; un `MANAGER` ne voit que ce qu'il possède. Répartir cette
 * condition dans les quatre-vingt-dix requêtes du projet reviendrait à
 * garantir qu'on en oublie une — et une seule suffit à montrer les données
 * d'un compte à un autre.
 *
 * `null` (clé globale d'automatisation) voit tout : elle n'appartient à
 * personne et précède les comptes.
 */
export type Scope = { ownerId: string } | null;

export function scopeOf(user: CurrentUser | null | undefined): Scope {
  if (!user || user.role === Role.ADMIN) return null;
  return { ownerId: user.id };
}

export const seesEverything = (scope: Scope) => scope === null;

/** Les ressources racines : elles portent leur propriétaire.
 *
 * Une ressource sans propriétaire (`ownerId: null`) n'est visible que des
 * ADMIN : ne jamais la faire correspondre est ce qui rend l'oubli sûr. */
export function ownedWhere(scope: Scope) {
  return scope ? { ownerId: scope.ownerId } : {};
}

export const profileWhere = (scope: Scope): Prisma.ProfileWhereInput =>
  ownedWhere(scope);
export const ingestWhere = (scope: Scope): Prisma.SourceIngestWhereInput =>
  ownedWhere(scope);

/* ── Lire et utiliser, ou modifier ───────────────────────────────────────
 *
 * Un partage donne le droit de PUBLIER, pas de gérer. Deux conditions
 * distinctes, donc : `…Where` pour ce qu'on voit et où l'on peut publier,
 * `…ManageWhere` pour ce qu'on peut renommer, désactiver ou supprimer.
 *
 * Les confondre laisserait un bénéficiaire renommer le groupe d'un autre.
 */

export const groupWhere = (scope: Scope): Prisma.GroupWhereInput =>
  scope
    ? {
        OR: [
          { ownerId: scope.ownerId },
          { access: { some: { userId: scope.ownerId } } },
        ],
      }
    : {};

export const siteWhere = (scope: Scope): Prisma.ContentSourceWhereInput =>
  scope
    ? {
        OR: [
          { ownerId: scope.ownerId },
          { access: { some: { userId: scope.ownerId } } },
        ],
      }
    : {};

/** Gérer suppose posséder : un partage ne se transmet pas et ne se retire
 * pas par son bénéficiaire. */
export const groupManageWhere = (scope: Scope): Prisma.GroupWhereInput =>
  ownedWhere(scope);
export const siteManageWhere = (scope: Scope): Prisma.ContentSourceWhereInput =>
  ownedWhere(scope);

/** Un post porte son propriétaire (`ownerId`) : un post ouvert n'a pas de
 * profil pour le dire. Les anciens posts, liés à un profil, restent aussi
 * reconnus par le propriétaire de ce profil. Un article, lui, hérite de son
 * site. */
export const postWhere = (scope: Scope): Prisma.PostWhereInput =>
  scope
    ? {
        OR: [
          { ownerId: scope.ownerId },
          { profile: { ownerId: scope.ownerId } },
        ],
      }
    : {};

export const articleWhere = (scope: Scope): Prisma.ArticleWhereInput =>
  scope ? { source: { ownerId: scope.ownerId } } : {};

export const jobWhere = (scope: Scope): Prisma.PublicationJobWhereInput =>
  scope ? { profile: { ownerId: scope.ownerId } } : {};

/** Un journal se rattache à un profil ou à un groupe. Ceux qui ne se
 * rattachent à rien — les étapes d'une reprise, le minuteur — restent
 * réservés aux ADMIN : mieux vaut en cacher que d'en montrer trop. */
export const logWhere = (scope: Scope): Prisma.ActivityLogWhereInput =>
  scope
    ? {
        OR: [
          { profile: { ownerId: scope.ownerId } },
          { group: { ownerId: scope.ownerId } },
          { group: { access: { some: { userId: scope.ownerId } } } },
        ],
      }
    : {};

/** Combine la portée et les filtres d'une requête sans qu'aucun des deux ne
 * puisse effacer l'autre : un filtre `profileId` fourni par l'appelant ne
 * doit jamais élargir ce qu'il voit. */
export function withScope<T extends object>(scope: Scope, filters: T): T {
  return seesEverything(scope)
    ? filters
    : ({ AND: [filters, ownedWhere(scope)] } as unknown as T);
}
