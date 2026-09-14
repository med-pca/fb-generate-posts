# Data FB Posting API

Backend NestJS/Fastify qui prépare des lots de contenus destinés à des groupes.
Il stocke les profils, groupes et posts, réserve aléatoirement 2 à 6 posts, puis
reçoit les confirmations et les logs du client de publication.

> Cette API ne contourne pas les restrictions de Facebook et ne publie pas
> directement avec un compte personnel. Le client chargé de la publication doit
> utiliser un mécanisme autorisé par Meta et respecter ses conditions.

## Installation

```bash
cp .env.example .env
docker compose up -d
npm install
npm run prisma:generate
npm run prisma:migrate -- --name init
npm run start:dev
```

L'API écoute par défaut sur `http://localhost:3000/api`.

L'interface d'administration est disponible sur `http://localhost:3000/admin/`.
Elle permet de consulter, créer et modifier les profils, groupes et posts.

La documentation interactive Swagger est disponible sur
`http://localhost:3000/api/docs`. Le document OpenAPI JSON est exposé sur
`http://localhost:3000/api/docs-json`.

## Parcours minimal

### 1. Créer un profil

```http
POST /api/profiles
Content-Type: application/json

{
  "name": "Profil A",
  "defaultImageUrl": "https://example.com/default.jpg",
  "minPostsPerJob": 2,
  "maxPostsPerJob": 6
}
```

### 2. Ajouter un groupe

```http
POST /api/profiles/{profileId}/groups
Content-Type: application/json

{
  "name": "Groupe A",
  "url": "https://facebook.com/groups/example"
}
```

Un groupe existant peut être lié à plusieurs profils :

```http
POST   /api/profiles/{profileId}/groups/{groupId}/link
DELETE /api/profiles/{profileId}/groups/{groupId}/link
```

### 3. Ajouter un post manuellement

```http
POST /api/posts
Content-Type: application/json

{
  "profileId": "profile_id",
  "groupIds": ["group_id"],
  "title": "Titre",
  "description": "Description du post",
  "url": "https://example.com",
  "delay": 20
}
```

`imageUrl` est facultatif. En son absence, l'image par défaut du profil est
retournée.

### 4. Récupérer un lot aléatoire

```http
POST /api/jobs/claim
Content-Type: application/json

{
  "profileId": "profile_id",
  "groupId": "group_id"
}
```

Pour un automate, le profil peut aussi être identifié directement par son
`externalId`. Le groupe est facultatif : sans celui-ci, l’API choisit un groupe
lié qui possède encore des posts disponibles.

```http
POST /api/jobs/claim/profile/{profileExternalId}
POST /api/jobs/claim/profile/{profileExternalId}?groupExternalId={groupExternalId}
```

### 5. Confirmer un post

```http
POST /api/jobs/{jobId}/posts/{postId}/consumed
POST /api/jobs/{jobId}/posts/{postId}/published
POST /api/jobs/{jobId}/posts/{postId}/failed
POST /api/jobs/{jobId}/complete
```

La confirmation `consumed` est idempotente. Après cette confirmation, le post
n’est plus redistribué pour ce groupe. Il peut toujours être publié dans ses
autres groupes cibles.

`consumed` est une étape **intermédiaire** : elle doit être suivie de
`published` ou de `failed`, sinon `complete` refuse de clôturer le job. Un
automate peut aussi passer directement de la réservation à `published`.

Une réservation dure `CLAIM_TTL_MINUTES` (30 par défaut). Passé ce délai, les
posts repartent dans le pool. Une confirmation qui arrive après une reprise par
un autre automate est rejetée avec **409 Conflict** : le post est peut-être en
ligne malgré tout, l’incident est tracé en `CLAIM_LOST` dans les logs et doit
être vérifié à la main. Ne republiez jamais un post après un 409.

Dimensionnez `CLAIM_TTL_MINUTES` au-dessus de la durée réelle d’un lot
(`maxPostsPerJob` × `delay`), sans quoi une réservation expire en cours de
publication.

## Alimentation des contenus

- `POST /api/admin/imports/json-data` importe un tableau JSON déjà disponible.
- `POST /api/admin/posts/generate` génère uniquement `title` et `description`
  avec OpenAI. Le délai est tiré côté serveur et l'image reste manuelle.

Pour activer OpenAI, renseigner `OPENAI_API_KEY` et `OPENAI_MODEL` dans `.env`.

## Sécurité

Les routes sont déjà protégées par deux clés distinctes : `AdminAuthGuard`
(session admin) sur `/api/admin/*`, `/api/profiles`, `/api/groups` et
`/api/posts`, et `AutomationAuthGuard` (en-tête `X-API-Key`, comparaison à
temps constant) sur `/api/jobs/*` et `/api/logs`.

Renseigner `AUTOMATION_API_KEY`, `ADMIN_PASSWORD` et `AUTH_SECRET` dans `.env`.
Les secrets ne doivent jamais être enregistrés en base ou transmis dans les
logs.
