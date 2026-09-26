# Data FB Posting API

Backend NestJS/Fastify qui prépare des lots de contenus destinés à des groupes.
Il stocke les profils, groupes et posts, réserve aléatoirement 2 à 6 posts, puis
reçoit les confirmations et les logs du client de publication.

Le contenu part en deux temps : image et description d’abord, puis l’URL dans
un commentaire une fois le lot validé (voir « Parcours de publication »).

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
Elle permet de consulter, créer et modifier les profils, groupes et posts, et
de lire les journaux d'activité remontés par les automates.

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

### 4. Supprimer des posts

```http
DELETE /api/posts/{postId}
```

Un post réservé par un automate en cours répond **409 Conflict** : le
supprimer ferait disparaître une publication en cours de traitement. Passer
`?force=true` pour l'effacer malgré tout.

La suppression en masse accepte soit une sélection, soit les mêmes filtres que
la liste (`profileId`, `groupId`, `articleId`, `status`, `sourceType`) :

```http
POST /api/posts/bulk-delete
Content-Type: application/json

{
  "ids": ["post_id_1", "post_id_2"]
}
```

```http
POST /api/posts/bulk-delete
Content-Type: application/json

{
  "profileId": "profile_id",
  "sourceType": "JSON",
  "dryRun": true
}
```

`dryRun` compte sans rien supprimer. Au moins un critère est obligatoire : une
requête vide est refusée pour ne pas vider la table. La réponse indique ce qui
a été supprimé et ce qui a été épargné :

```json
{ "dryRun": false, "matched": 42, "deleted": 40, "blocked": 2, "blockedPosts": [] }
```

Les cibles (`post_targets`) et les lignes de job liées partent en cascade.

`GET /api/posts` accepte les mêmes filtres, plus `search`, pour préparer la
sélection.

### 5. Récupérer un lot aléatoire

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

**Le lot ne contient pas l’URL.** Chaque post est rendu avec son image, sa
description et le texte du commentaire à poster — rien d’autre :

```json
{
  "id": "post_id",
  "title": "Titre",
  "description": "Description du post",
  "image": "https://example.com/image.jpg",
  "delay": 12,
  "comment": { "text": "Description du post", "willReceiveLink": true }
}
```

`willReceiveLink` annonce qu’une URL viendra remplacer ce commentaire une fois
le lot validé. Voir « Parcours de publication » plus bas.

### 5 bis. Traiter plusieurs profils en parallèle

```http
POST /api/jobs/claim/batch
Content-Type: application/json

{ "limit": 10 }
```

Rend **au plus un job par profil** (10 profils par défaut, 50 au maximum) :
l’automate lance un thread par entrée de `jobs`. Restreindre à certains
profils avec `profileExternalIds`.

Un profil qui tient déjà un job non expiré est **écarté**, avec
`status: "busy"` — la même garantie s’applique à
`POST /api/jobs/claim/profile/{externalId}`. C’est ce qui empêche deux threads
de piloter le même compte en même temps. Les autres statuts de `skipped` sont
`empty` (plus de post disponible) et `error`.

```json
{
  "requested": 10,
  "claimed": 7,
  "posts": 23,
  "jobs": [{ "jobId": "...", "profile": {}, "group": {}, "posts": [] }],
  "skipped": [{ "status": "busy", "profileExternalId": "...", "message": "..." }]
}
```

Un job abandonné sans `complete` bloque son profil jusqu’à l’expiration du
claim (`CLAIM_TTL_MINUTES`). C’est voulu : mieux vaut un profil au repos qu’un
compte piloté deux fois.

### 6. Parcours de publication

La publication se fait en **deux temps** : le post part sans lien, et l’URL
n’arrive qu’ensuite, en modifiant le commentaire déjà en place.

```
publier (image + description, sans URL)   POST .../published
        ↓
commenter (description seule)             POST .../commented
        ↓
clôturer le lot                           POST /jobs/{jobId}/complete   → AWAITING_LINK
        ↓
récupérer les URL                         GET  /jobs/{jobId}/link-updates
        ↓
modifier le commentaire avec l’URL        POST .../link-updated         → COMPLETED
```

```http
POST /api/jobs/{jobId}/posts/{postId}/consumed
POST /api/jobs/{jobId}/posts/{postId}/published
POST /api/jobs/{jobId}/posts/{postId}/commented
POST /api/jobs/{jobId}/posts/{postId}/failed
POST /api/jobs/{jobId}/complete
GET  /api/jobs/{jobId}/link-updates
POST /api/jobs/{jobId}/posts/{postId}/link-updated
GET  /api/jobs/link-updates?profileExternalId={externalId}
```

`commented` s’appelle après `published` et exige `commentExternalId` :

```http
POST /api/jobs/{jobId}/posts/{postId}/commented
Content-Type: application/json

{ "commentExternalId": "1234567890" }
```

Sans cet identifiant, le commentaire ne pourra jamais être retrouvé pour y
placer l’URL. Un post publié sans commentaire ne bloque pas la clôture — il est
en ligne — mais il est tracé en `COMMENT_MISSING` (niveau `WARN`) et compté
dans `missingComments` : son URL ne sera jamais posée.

**L’URL n’existe nulle part avant la clôture.** `GET /jobs/{jobId}/link-updates`
répond **400** tant que le job est réservé : c’est la règle « après la
validation de tous ». Une fois `complete` appelé, le job passe en
`AWAITING_LINK` et l’endpoint rend la liste :

```json
{
  "jobId": "...",
  "status": "AWAITING_LINK",
  "updates": [
    {
      "postId": "...",
      "commentExternalId": "1234567890",
      "url": "https://example.com/article",
      "externalPostUrl": "https://facebook.com/groups/1/posts/2/"
    }
  ]
}
```

Chaque `link-updated` confirmé retire une entrée ; quand la dernière tombe, le
job passe de lui-même en `COMPLETED` (ou `PARTIALLY_COMPLETED` / `FAILED` selon
les publications) et l’événement `JOB_FINALIZED` est écrit.

`GET /api/jobs/link-updates` rend la même chose pour **tous** les jobs qui ne
sont plus réservés, triés du plus ancien au plus récent : c’est la file qu’un
worker consomme après avoir traité ses lots. Les jobs **expirés** faute de
`complete` y figurent aussi — leurs posts sont en ligne et commentés, leur URL
reste à placer.

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

### 7. Adhésion aux groupes (extension navigateur)

Chaque lien profil ↔ groupe porte un `joinStatus` : `NOT_JOINED` (par défaut),
`REQUESTED`, `JOINED`, `QUESTIONS` ou `FAILED`. L’extension
`fb-extention-join` le lit et le met à jour avec la clé `X-API-Key` :

```http
GET  /api/join/profiles/{profileExternalId}/groups?status=NOT_JOINED,FAILED
POST /api/join/profiles/{profileExternalId}/groups/{groupId}/join-status
Content-Type: application/json

{ "joinStatus": "JOINED" }
```

Sans `status`, la liste rend les groupes `NOT_JOINED` et `FAILED` ; `status=all`
rend tout. `error` (facultatif) accompagne un `FAILED`. Chaque mise à jour écrit
un journal `GROUP_JOIN_UPDATED`. Le statut n’influence pas encore la réservation
des lots.

## Alimentation des contenus

- `POST /api/admin/imports/json-data` importe un tableau JSON déjà disponible.
- `POST /api/admin/posts/generate` génère uniquement `title` et `description`
  avec OpenAI. Le délai est tiré côté serveur et l'image reste manuelle.

Pour activer OpenAI, renseigner `OPENAI_API_KEY` et `OPENAI_MODEL` dans `.env`.

### Alimentation automatique par groupe

Le stock se compte **groupe par groupe**, pas seulement par profil : un groupe
descendu à trois ou quatre posts est réalimenté même quand le profil, tous
groupes confondus, paraît fourni. Deux seuils pilotent l'opération :

| Réglage | Portée | Rôle |
| --- | --- | --- |
| `minimumAvailablePerGroup` | Global | Cibles disponibles attendues dans chaque groupe actif |
| `minimumAvailablePerProfile` | Global | Plancher du profil, tous groupes confondus |
| `Profile.minimumAvailablePerGroup` | Un profil | Remplace le seuil global par groupe |
| `Profile.minimumAvailable` | Un profil | Remplace le plancher global du profil |

Les deux champs du profil sont facultatifs : à `null`, le profil suit les
réglages globaux. Une valeur l'emporte pour ce profil seul.

```http
PATCH /api/profiles/{profileId}
Content-Type: application/json

{ "minimumAvailable": 30, "minimumAvailablePerGroup": 12 }
```

Remettre `null` efface la surcharge et fait retomber le profil sur le global.
La réponse de `replenish-now` indique dans `thresholds` quels seuils ont
réellement servi — sans ça, impossible de savoir si un profil a suivi son
propre réglage ou le réglage général.

#### Quand l'alimentation se déclenche

| Déclencheur | Quand | Couvre |
| --- | --- | --- |
| Avant chaque réservation | `POST /jobs/claim/profile/{externalId}` et `claim/batch` | La période d'activité |
| **Minuteur interne** | Toutes les `REPLENISH_INTERVAL_MINUTES` (15 par défaut) | **La période creuse** |
| À la demande | `POST /api/settings/replenish-now` | Après un import d'articles |

Le minuteur est le filet : sans lui, un profil au repos descend sous son seuil
et y reste, puisque plus rien ne réserve. Mettre
`REPLENISH_INTERVAL_MINUTES=0` le désactive ; `autoReplenishEnabled` en base
coupe l'alimentation dans tous les cas. `GET /api/settings` renvoie la cadence
effective, et l'écran Paramètres l'affiche.

Un passage ne chevauche jamais le précédent : sur beaucoup de profils
l'alimentation peut durer plus longtemps que l'intervalle, le tour est alors
sauté. Une erreur est avalée et tracée en `REPLENISH_FAILED` — si elle
remontait, le minuteur mourrait et les profils se videraient en silence. Un
passage qui n'a rien produit n'écrit rien en base : 96 lignes par jour
noieraient les journaux utiles.

Sur plusieurs instances, chacune fera tourner son minuteur. Les collisions sont
absorbées (`P2002`), mais réglez `REPLENISH_INTERVAL_MINUTES=0` sur toutes sauf
une pour éviter le travail en double.

```http
PATCH /api/settings
POST  /api/settings/replenish-now             # tous les profils actifs
POST  /api/settings/replenish-now/{profileId} # un seul profil
POST  /api/settings/replenish-now/all         # un passage du minuteur
```

Depuis cron ou à la main, `scripts/replenish.sh` fait la même chose en ligne de
commande :

```bash
export API_BASE=https://post.pulserecipe.com/api
export ADMIN_USERNAME=... ADMIN_PASSWORD=...
./scripts/replenish.sh                # tous les profils
./scripts/replenish.sh <profileId>    # un seul
```

Pour chaque groupe en manque, dans cet ordre :

1. **Rattachement** : les posts déjà disponibles du profil qui ne visent pas
   encore ce groupe lui sont ajoutés comme cibles. Aucun contenu n'est dupliqué.
2. **Création** : les légendes des articles actifs deviennent de nouveaux posts.
   Les articles les moins exploités passent en premier, et un même post sert
   d'un coup tous les groupes encore en manque.
3. **Variantes** : quand le catalogue est épuisé, les légendes déjà employées
   resservent sous un `externalId` suffixé (`article:profil:0:v1`, `:v2`…). Le
   même article réalimente donc un groupe indéfiniment, plutôt que de le
   laisser vide.

La réponse détaille l'état de chaque groupe et les seuils appliqués :

```json
{
  "profileId": "profile_id",
  "generated": 5,
  "reused": 2,
  "thresholds": { "perProfile": 10, "perGroup": 8 },
  "groups": [{ "groupId": "g1", "name": "Groupe 1", "available": 8, "missing": 0 }]
}
```

Chaque exécution est plafonnée à 200 posts et tracée en `POSTS_REPLENISHED`
dans les journaux.

## Journaux et décision

Les automates écrivent dans `activity_logs` (réservations, publications,
échecs, réservations perdues, réapprovisionnements). Deux accès distincts :

| Route | Clé | Usage |
| --- | --- | --- |
| `POST /api/logs` | `X-API-Key` | L'automate dépose un événement |
| `GET /api/logs` | `X-API-Key` | Les 200 derniers, pour l'automate |
| `GET /api/admin/logs` | Session admin | Lecture filtrée et paginée |
| `GET /api/admin/logs/summary` | Session admin | Synthèse pour décider |

La clé d'automatisation n'a donc pas à circuler dans le navigateur pour
consulter l'historique.

### Lire les journaux

```http
GET /api/admin/logs?level=ERROR&page=1&limit=25
GET /api/admin/logs?eventType=CLAIM_LOST&since=2026-09-14T00:00:00.000Z
GET /api/admin/logs?profileId={profileId}&search=quota&onlyIncidents=true
```

Filtres : `level`, `eventType`, `profileId`, `groupId`, `postId`, `jobId`,
`search` (dans le message), `since`, `until`, `onlyIncidents`. Chaque ligne
porte le nom du profil, du groupe et du titre du post — un identifiant seul ne
permet de décider de rien.

`onlyIncidents=true` ne garde que ce qui appelle une action : niveau `ERROR`,
`CLAIM_LOST` et `COMMENT_MISSING`.

### Décider

```http
GET /api/admin/logs/summary?hours=24
```

```json
{
  "since": "2026-09-15T09:00:00.000Z",
  "total": 130,
  "levels": { "DEBUG": 0, "INFO": 125, "WARN": 0, "ERROR": 5 },
  "claimLost": 2,
  "pendingLinkUpdates": { "total": 3, "oldestJobId": "...", "pendingSince": "..." },
  "eventTypes": [{ "eventType": "JOB_CLAIMED", "total": 100, "errors": 0 }],
  "profiles": [{ "profileId": "p1", "name": "Profil A", "total": 41, "errors": 1 }],
  "incidents": []
}
```

Ce que chaque bloc sert à trancher :

- `claimLost` — **le seul compteur qui impose une intervention manuelle**. Une
  réservation perdue signifie qu'un post est peut-être en ligne sans être
  enregistré. Vérifiez-le à la main, ne le republiez jamais. Un `claimLost`
  récurrent veut dire que `CLAIM_TTL_MINUTES` est trop court face à la durée
  réelle d'un lot.
- `levels.ERROR` — volume d'échecs sur la fenêtre. Stable et faible : rien à
  faire. En hausse : regardez `eventTypes` pour savoir *quoi* échoue.
- `profiles` — trié par nombre d'erreurs. C'est le profil qu'on désactive, pas
  un identifiant : le nom et l'état sont résolus côté API.
- `pendingLinkUpdates` — commentaires posés dont l’URL n’a jamais été placée.
  **Compté hors fenêtre** : un commentaire en attente depuis trois jours reste
  visible en regardant les dernières 24 h. `pendingSince` donne l’ancienneté du
  plus vieux ; s’il dérive, le worker ne consomme plus
  `GET /api/jobs/link-updates`.
- `incidents` — les 20 derniers événements à traiter, avec leur contexte.

### Événements écrits par l’API

| Événement | Niveau | Ce qu’il dit |
| --- | --- | --- |
| `JOB_CLAIMED` | INFO | Un lot a été réservé |
| `JOBS_BATCH_CLAIMED` | INFO / WARN | Réservation par lot : combien de jobs, combien de profils écartés |
| `CLAIM_SKIPPED_BUSY` | INFO | Un profil tenait déjà un job — thread écarté |
| `CLAIM_FAILED` | ERROR | La réservation d’un profil a échoué pendant un lot |
| `POST_PUBLISHED` / `POST_FAILED` | INFO / ERROR | Résultat de la publication |
| `POST_COMMENTED` | INFO | Commentaire posé, en attente de l’URL |
| `COMMENT_DUPLICATE` | WARN | Un second commentaire a été signalé pour le même post |
| `COMMENT_MISSING` | WARN | Post publié sans commentaire : son URL ne pourra pas être posée |
| `JOB_AWAITING_LINK` | INFO | Lot clôturé, commentaires à basculer sur l’URL |
| `COMMENT_LINK_UPDATED` | INFO | Le commentaire porte désormais l’URL |
| `JOB_FINALIZED` | INFO | Toutes les URL sont en place |
| `CLAIM_LOST` | ERROR | Réservation reprise — vérification manuelle |
| `POSTS_REPLENISHED` | INFO | Réapprovisionnement, détail par groupe dans `metadata` |
| `REPLENISH_SCHEDULED` | INFO | Passage du minuteur ayant produit des posts |
| `REPLENISH_FAILED` | ERROR | Passage du minuteur en échec |

La section **Journaux** de l'interface d'administration reprend ces éléments :
compteurs, bandeau d'alerte sur les réservations perdues, répartition par
événement et par profil, puis le tableau filtrable avec les métadonnées
dépliables.

## Scripts de vérification

Deux scripts autonomes vérifient une API déployée. Ils créent leur propre
profil, groupe et post, et suppriment tout à la fin.

```bash
export API_BASE=https://post.pulserecipe.com/api
export ADMIN_USERNAME=... ADMIN_PASSWORD=... AUTOMATION_API_KEY=...

./scripts/smoke-job-lifecycle.sh   # claim -> consumed -> published -> complete
./scripts/smoke-comment-link.sh    # le parcours post -> commentaire -> URL
./scripts/replenish.sh             # forcer une alimentation depuis les articles
```

`smoke-comment-link.sh` vérifie qu’aucune URL ne figure dans le lot réservé,
que `link-updates` est refusé avant la clôture, que `complete` bascule en
`AWAITING_LINK`, que l’URL est bien livrée ensuite, et qu’un profil déjà occupé
est écarté d’une réservation par lot.

## Sécurité

Les routes sont déjà protégées par deux clés distinctes : `AdminAuthGuard`
(session admin) sur `/api/admin/*`, `/api/profiles`, `/api/groups` et
`/api/posts`, et `AutomationAuthGuard` (en-tête `X-API-Key`, comparaison à
temps constant) sur `/api/jobs/*` et `/api/logs`.

Renseigner `AUTOMATION_API_KEY`, `ADMIN_PASSWORD` et `AUTH_SECRET` dans `.env`.
Les secrets ne doivent jamais être enregistrés en base ou transmis dans les
logs.

## Intégration WordPress

Le plugin installable [`wordpress/data-fb-posting.zip`](wordpress/data-fb-posting.zip) transmet les nouveaux articles publiés à `POST /api/wordpress/articles`, protégé par la clé dédiée `WORDPRESS_API_KEY`. Chaque article prépare automatiquement un post court par profil actif, avec l’URL destinée au commentaire. Les modifications ultérieures et les envois répétés ne régénèrent pas les posts.

Voir le [guide d’installation et de fonctionnement](wordpress/README.md).
