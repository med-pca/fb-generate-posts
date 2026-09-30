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
un journal `GROUP_JOIN_UPDATED`.

La réservation des lots (`/jobs/claim…`) ne considère que les groupes `JOINED`
pour le profil : un groupe lié mais pas encore rejoint ne reçoit aucune
publication. Les liens créés avant cette fonctionnalité ont été passés à
`JOINED` par la migration.

## Alimentation des contenus

- `POST /api/admin/imports/json-data` importe un tableau JSON déjà disponible.
- `POST /api/admin/posts/generate` génère uniquement `title` et `description`
  avec OpenAI. Le délai est tiré côté serveur et l'image reste manuelle.

Pour activer OpenAI, renseigner `OPENAI_API_KEY` et `OPENAI_MODEL` dans `.env`.

### Catégories et posts ouverts

Il n'y a plus d'alimentation automatique : elle recréait des variantes pour
remplir un stock par profil, d'où les doublons. Les posts naissent désormais
des articles WordPress (import automatique → dépôt → mise en ligne → renvoi du
plugin).

```
site (catégorie « Recettes »)
   └─ article reçu ─> UN post ouvert ─> tous les groupes actifs « Recettes »
                                        (chaque groupe le reçoit une fois,
                                         par le premier profil qui l'a rejoint)
```

- **Catégories** : une liste gérée (page **Catégories**, `GET/POST
  /api/categories`). Tout compte en crée ; seuls les ADMIN renomment ou
  suppriment (`PATCH/DELETE /api/categories/{id}`). Un groupe et un site
  portent chacun une catégorie (`categoryId`, chaîne vide = aucune).
- **Un post ouvert** n'a pas de profil (`profileId: null`). Un profil le
  réserve s'il a rejoint l'un de ses groupes, et s'il appartient au même compte
  que le post (`ownerId`, celui du site ; un post sans propriétaire sert tous
  les profils). La cible post × groupe ne part qu'une fois.
- **Qui reçoit l'article** : les groupes actifs de la catégorie du site que son
  propriétaire atteint (les siens et ceux qu'on lui partage ; tous pour un site
  sans propriétaire ou tenu par un ADMIN). Une reprise qui a choisi ses
  groupes (`groupIds`) les garde. **Un site sans catégorie ne produit aucun
  post** : l'article est reçu, et un avertissement est journalisé.
- **Un post n'est jamais lié à un profil**, seulement à des groupes d'une
  même catégorie : à la main (`POST /api/posts`), depuis un article
  (« Créer les posts »), par import JSON ou par génération. Le profil vient
  chercher le post dans le groupe où il publie.
- **Un article sert une fois** : à la première publication d'un de ses posts,
  il est archivé (`archivedAt`, événement `ARTICLE_ARCHIVED`). On n'en tire plus
  de nouveau post (« Créer les posts » est refusé, 409). Son post déjà créé
  finit sa tournée des groupes, chacun le recevant une fois.

- **Retirer les posts d'un groupe** (bouton « Retirer les posts » de la page
  Groupes, `DELETE /api/groups/{id}/posts`, `?dryRun=true` pour compter) : les
  posts en attente sont retirés de CE groupe seulement. Un post qui vise aussi
  d'autres groupes y reste ; un post qui ne visait que celui-ci est supprimé.
  Les publications faites ou en cours sont conservées. Un compte ne retire que
  ses propres posts, même d'un groupe partagé. Journalisé en
  `GROUP_POSTS_REMOVED`.

Les anciens posts, liés à un profil, continuent de fonctionner comme avant.

### La file de publication

Page **Posts → File d'attente**. L'unité est la **cible** : un post × un
groupe. Un post qui vise trois groupes part trois fois, à chaque fois par un
profil qui a rejoint le groupe.

| Tableau | Ce qu'il montre |
| --- | --- |
| En cours | Réservé par un automate, ou en train d'être publié : quel post, quel groupe, **quel profil**, depuis quand |
| Prochaines publications | Les 10 prochaines (« voir plus »), **dans l'ordre exact de réservation**, avec les profils qui peuvent les publier (ceux qui ont rejoint le groupe ; « aucun profil » = ce post n'en partira pas) |
| Déjà publiés | Quand, dans quel groupe, **par quel profil**, le lien Facebook, et si le lien de l'article est posé en commentaire |

Filtrable par **catégorie** et par groupe. La page se relit toutes les 15 s.

**Ordre de passage** : priorité, puis le plus ancien. Il remplace le tirage
au hasard : c'est ce qui rend la file prévisible et pilotable. Le groupe
essayé en premier est celui qui porte le post le plus prioritaire.

**Prioriser** (`PATCH /api/posts/{id}/priority`) : `{"move": "top"}` passe
devant tous les autres, `up` / `down` d'un cran, `reset` remet à 0, ou
`{"priority": n}` (−1000 à 1000). La priorité porte sur le post : il passe en
tête dans **tous** ses groupes.

```http
GET /api/posts/queue?categoryId=&groupId=&limit=10&publishedLimit=20
```

**Agir sur une publication** (un post dans un groupe), depuis la file :

| Geste | Effet | Route |
| --- | --- | --- |
| ↻ Relancer | Un échec repart en attente, raison effacée (le compteur de tentatives reste) | `POST /api/posts/targets/{id}/retry` |
| Envoyer par… | Le profil choisi la prend **en premier à son prochain passage** ; aucun autre ne la prend entre-temps. Un échec est relancé au passage. Refusé si le profil n'a pas rejoint le groupe ; averti s'il est à l'arrêt dans le Pilotage | `PUT /api/posts/targets/{id}/force` `{"profileId": "…"}` (`null` = annuler) |
| Retirer | Retire le post de **ce groupe seulement** ; s'il ne visait que lui, il est supprimé. Refusé pour une publication faite ou en cours | `DELETE /api/posts/targets/{id}` |
| Modifier | Texte, lien, image (avec aperçu) du post, dans tous ses groupes | `PATCH /api/posts/{id}` |

Le tableau **En échec** montre la raison, le profil qui a essayé et le nombre
de tentatives. Journaux : `TARGET_RETRIED`, `TARGET_FORCED`, `TARGET_REMOVED`.

### L'extension WordPress de chaque site

La page **Sites** dit, site par site, si le plugin Data FB Posting est
installé et accepte la clé :

| État | Signification |
| --- | --- |
| Connectée | La route `dfb/v1/status` répond et accepte la clé |
| Clé refusée | Le plugin est là, mais la clé ne correspond pas |
| À mettre à jour | Pas de route `dfb/v1`, mais le site nous envoie ses articles : plugin antérieur à 1.2.2. Il publie chez nous, mais ne reçoit pas les reprises. Installer la 1.3.0 |
| Absente | Pas de route `dfb/v1` et aucun article reçu : plugin absent ou désactivé |
| Site injoignable | Le site ne répond pas |
| Non vérifiée | Jamais vérifié |

```http
POST /api/sites/check        # tous ses sites
POST /api/sites/{id}/check   # un seul
```

Le serveur vérifie aussi tous les sites actifs toutes les
`SITE_CHECK_INTERVAL_MINUTES` (360 par défaut, 0 = jamais), et un site qui nous
envoie un article est marqué connecté à la réception (`lastDeliveryAt`).

## Pilotage des profils

L'admin décide quand chaque profil publie ; le terrain vient lire cet ordre.
Page **Pilotage** de l'administration.

```
admin ──mode, fenêtre horaire, réglages──> API
                                            ▲ ▲
         agent local (ouvre les profils) ───┘ │
         extension de chaque navigateur ──────┘
                  (battement toutes les minutes)
```

L'ordre voyage toujours dans ce sens : l'API de NSTBrowser n'écoute que sur la
machine où elle tourne, et un navigateur n'a pas d'adresse joignable. L'API ne
peut donc rien lancer elle-même — elle publie une décision, que l'agent local et
les extensions viennent chercher.

### Appairer un navigateur

Un navigateur doit savoir trois choses : l'adresse de l'API, une clé, et lequel
des profils il tient. Les faire saisir à la main dans chaque navigateur, c'était
deux valeurs recopiées à l'identique partout et un profil à choisir dans une
liste — donc trois occasions de se tromper, et une clé de 64 caractères qui
circule.

Un code court les remplace :

```http
POST /api/runners/{profileId}/pair-code    (admin)  -> { code, expiresAt }
POST /api/control/pair                     (public) -> { apiBaseUrl, apiKey, profileExternalId }
```

Dans l'admin : **Pilotage** → la ligne du profil → **Appairer**. Le code se colle
dans les options de l'extension du navigateur visé. Comme il porte l'identité du
profil, l'opérateur n'a rien à choisir : il prend le code de la ligne qu'il veut.

`POST /api/control/pair` est la **seule** route du pilotage sans clé d'API — le
navigateur n'en a pas encore, et le code est justement ce qui la lui donne. Elle
vit dans son propre contrôleur ([`pair.controller.ts`](src/runners/pair.controller.ts))
pour que cette absence de garde se voie, plutôt que d'ouvrir une exception dans
la garde d'automatisation. Ce qui la protège :

- le code vaut 15 minutes et ne sert qu'une fois ;
- un nouveau code annule le précédent : jamais deux codes valides pour un profil ;
- les tentatives sont comptées par adresse (10 échecs, puis 429) ;
- le code est tiré d'un alphabet sans `0/O` ni `1/I` (32^8), pour être recopié
  sans erreur autant que pour ne pas être devinable.

La clé remise est celle du **propriétaire** du profil quand il en a un — elle ne
voit que son périmètre et se révoque sans couper les autres comptes. À défaut,
`AUTOMATION_API_KEY`.

L'adresse renvoyée est celle par laquelle la requête est arrivée (`x-forwarded-*`
derrière un proxy), donc celle qui marche depuis ce navigateur.
`PUBLIC_API_BASE_URL` la force quand l'adresse vue du serveur n'est pas celle que
le navigateur doit appeler.

### La clé NSTBrowser de chaque compte

Chaque compte règle sa propre clé de l'API locale NSTBrowser dans l'admin
(bouton **Clé NSTBrowser** en haut, ou **Comptes → Modifier** pour un
administrateur). Plus besoin de toucher au `.env` de la machine :

```http
PUT /api/me/nstbrowser-key   { "nstApiKey": "..." }   # "" = la retirer
```

`GET /api/control/launcher` remet à chaque profil la clé de son propriétaire
(`nstApiKey`), et l'agent local ouvre le profil avec. Par profil et non une
fois pour tout le plan : la clé globale voit les profils de plusieurs comptes.
Profil sans propriétaire, compte sans clé ou désactivé : `null`, et l'agent
retombe sur son `NST_API_KEY`.

La clé n'est jamais relue par l'admin : `/api/me` et `/api/users` ne disent
que `hasNstApiKey` et ses quatre derniers caractères (`nstApiKeyHint`).

### Les profils créés dans NSTBrowser

Inutile de les recréer dans la plateforme : l'agent local liste son
NSTBrowser au démarrage puis toutes les 10 minutes, et l'API crée ceux
qu'elle ne connaît pas (`externalId` = UUID NSTBrowser, nom repris).

```http
POST /api/control/profiles/sync   { "profiles": [{ "externalId": "...", "name": "..." }] }
```

- Le profil appartient au compte de la clé d'API de l'agent, et la liste est
  lue avec la clé NSTBrowser de ce compte. Avec la clé globale, il naît sans
  propriétaire (visible des ADMIN, à réattribuer).
- Il arrive **à l'arrêt** : rien ne s'ouvre avant qu'on l'allume dans le Pilotage.
- On ne fait qu'ajouter : rien n'est renommé, déplacé ni supprimé.
- `python -m app.launcher --no-sync` la désactive, `--sync-every 300` change le rythme.

### Ce que l'admin règle, par profil

| Mode | Effet |
| --- | --- |
| `OFF` | le profil s'arrête (après l'étape en cours, jamais au milieu d'un post) |
| `AUTO` | il publie dans sa fenêtre horaire, à **son** fuseau |
| `ON` | il publie tout de suite, fenêtre ignorée |

La fenêtre est en minutes depuis minuit (`windowStart`/`windowEnd`) plus des
jours ISO (`days: "1,2,3,4,5"`). Deux détails qui ne se voient qu'à l'usage :
des bornes égales valent « toute la journée », et une fenêtre de nuit
(22:00 → 06:00) appartient au jour où elle **commence** — « vendredi 22 h → 6 h »
va donc jusqu'au samedi matin.

`settings` est un JSON poussé à l'extension à chaque battement (rythme entre
lots, groupe imposé, premier commentaire…). L'extension ne retient que les clés
qu'elle connaît et **refuse** l'adresse de l'API, sa clé et l'identifiant de
profil : ce sont eux qui font qu'un navigateur est bien celui-là.

`publishingEnabled` (Paramètres) est le coupe-circuit global : à `false`, aucun
profil ne publie, quel que soit son mode.

### Les routes

Côté admin (jeton) :

```http
GET   /api/runners                      tous les profils, leur ordre et leur état
PATCH /api/runners/{profileId}          { mode, windowStart, windowEnd, days, timezone, settings }
PATCH /api/runners/all                  { mode }   tout allumer / tout éteindre
POST  /api/runners/{profileId}/pair-code   émettre un code d'appairage
```

Côté terrain (`X-API-Key`) :

```http
POST  /api/control/pair                            SANS clé : échanger un code
GET   /api/control/profile/{externalId}            l'ordre seul
POST  /api/control/profile/{externalId}/heartbeat  rapporter ET recevoir l'ordre
GET   /api/control/launcher                        quoi ouvrir, quoi fermer
POST  /api/control/launcher/{externalId}           ce qu'est devenu le navigateur
```

Le battement porte les deux moitiés en un aller-retour : un état sans ordre
obligerait à un second appel, un ordre sans état laisserait l'admin aveugle.

### Ce qui protège une publication en cours

`mayClose` est distinct de `shouldRun` dans le plan de l'agent local. Tant que
l'extension a battu récemment en disant travailler, son navigateur n'est **pas**
fermable, même après un ordre d'arrêt : le fermer couperait la page sous une
publication en cours, et personne ne saurait si le post est sorti. Il se referme
au tour suivant, une fois le post terminé.

Réciproquement, un worker mort reste `running: true` pour toujours — c'est
pourquoi l'admin distingue « il dit travailler » de « vu il y a 20 s ».

`mayClose: true` est une autorisation, pas un ordre : l'agent local ne ferme
rien sans son option `--close`. Un navigateur ouvert peut être celui dans lequel
l'opérateur travaille, alors qu'en ouvrir un ne détruit rien.

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

### Les journaux par domaine

Page **Journaux** : un onglet par domaine, chacun avec son nombre d'erreurs
(rouge) ou d'avertissements (orange). L'onglet choisi borne tout : compteurs,
répartition, incidents et liste. Le domaine se déduit du type d'événement
([src/logs/domains.ts](src/logs/domains.ts)) : l'historique est rangé
d'emblée, sans migration.

| Domaine | Ce qu'on y lit | Événements |
| --- | --- | --- |
| Publication | Les automates : réservations, publications, commentaires, liens ; les gestes de la file | `JOB_*`, `CLAIM_*`, `POST_*`, `COMMENT_*`, `TARGET_*`, `GROUP_POSTS_REMOVED`, `ARTICLE_ARCHIVED` |
| Captures | Les reprises de FB Catch Post : capture refusée, lecture de la source, réécriture, dépôt | `INGEST_*` (dont `INGEST_REJECTED`) |
| Synchronisation | Ce qui entre : articles WordPress reçus, mis à jour, **reçus sans post (et pourquoi)**, refusés ; changements d'état des extensions ; profils NSTBrowser ajoutés | `WORDPRESS_ARTICLE_RECEIVED` / `_UPDATED` / `_NO_POST` / `_REJECTED`, `SITE_PLUGIN_CHANGED`, `PROFILES_SYNCED` |
| Groupes & pilotage | Adhésions aux groupes, navigateurs | `GROUP_JOIN_*`, `BROWSER_*`, `RUNNER_*` |
| Autres | Tout événement non classé (un automate qui en invente un) | — |

```http
GET /api/admin/logs?domain=sync
GET /api/admin/logs/summary?domain=capture   # + domains : les comptes de chaque onglet
```

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
| `ARTICLE_ARCHIVED` | INFO | Premier post publié : l’article ne sert plus |
| `GROUP_POSTS_REMOVED` | WARN | Posts en attente retirés d’un groupe |
| `INGEST_CREATED` | INFO | Une reprise a été enregistrée |
| `INGEST_SCRAPE_CLAIMED` | INFO | Une extension a réservé une collecte |
| `INGEST_SCRAPED` | INFO | Le texte et l’image du post d’origine sont arrivés |
| `INGEST_SOURCE_READ` | INFO | La page source a été lue |
| `INGEST_REWRITTEN` | INFO | L’article réécrit est prêt |
| `INGEST_PUBLISHED` | INFO | L’article réécrit est déposé sur WordPress |
| `INGEST_IMAGE_SKIPPED` | INFO | Article en ligne, mais sans son image |
| `INGEST_FAILED` | ERROR | Étape en échec : `metadata.stage` dit laquelle |

La section **Journaux** de l'interface d'administration reprend ces éléments :
compteurs, bandeau d'alerte sur les réservations perdues, répartition par
événement et par profil, puis le tableau filtrable avec les métadonnées
dépliables.

### Dans l'interface

La section **Comptes** n'apparaît qu'aux administrateurs : elle liste les
comptes, permet d'en créer, de les désactiver et de régénérer leur clé. La
clé s'affiche dans une fenêtre qui prévient qu'on ne la reverra pas — elle
n'est rendue qu'à la création et à la régénération.

Les lignes des **Sites** et des **Groupes** portent un bouton *Partager* :
il ouvre la liste de qui y a accès, et permet d'ajouter ou de retirer un
compte. Ne sont proposés que les gestionnaires actifs qui n'y ont pas déjà
accès — un administrateur voit déjà tout, le proposer laisserait croire que
son accès vient de là.

L'en-tête rappelle qui est connecté et à quel titre : sans cela, un
gestionnaire ne comprend pas pourquoi il voit si peu de choses.

## Scripts de vérification

Deux scripts autonomes vérifient une API déployée. Ils créent leur propre
profil, groupe et post, et suppriment tout à la fin.

```bash
export API_BASE=https://post.pulserecipe.com/api
export ADMIN_USERNAME=... ADMIN_PASSWORD=... AUTOMATION_API_KEY=...

./scripts/smoke-job-lifecycle.sh   # claim -> consumed -> published -> complete
./scripts/smoke-comment-link.sh    # le parcours post -> commentaire -> URL
```

`smoke-ingest.sh` déroule une reprise complète sur une API qui tourne, étage
par étage, et dit où elle s'arrête : lecture de la page, réécriture, dépôt
WordPress, renvoi du plugin, posts fabriqués. La reprise créée est supprimée
à la fin (`KEEP=1` pour la garder).

```bash
export API_BASE=http://localhost:3000/api
export ADMIN_USERNAME=... ADMIN_PASSWORD=... AUTOMATION_API_KEY=...
./scripts/smoke-ingest.sh                          # source par défaut
./scripts/smoke-ingest.sh https://exemple.com/article
```

`public/admin/tests/ui-test.js` rend l'interface dans jsdom et joue le
parcours des comptes, pour les deux rôles. Un double de l'API suffit : ce
qu'on teste, c'est ce que l'interface montre et masque.

```bash
node public/admin/tests/ui-test.js
```

`read-source.ts` s'essaie à la lecture d'une page et, avec `--rewrite`, à sa
réécriture. Rien n'est écrit : ni base, ni WordPress, ni Facebook. De quoi
vérifier qu'un site se laisse extraire avant de lui confier une reprise.

```bash
npx ts-node scripts/read-source.ts https://exemple.com/article
npx ts-node scripts/read-source.ts https://exemple.com/article --rewrite --lang fr
```

`smoke-comment-link.sh` vérifie qu’aucune URL ne figure dans le lot réservé,
que `link-updates` est refusé avant la clôture, que `complete` bascule en
`AWAITING_LINK`, que l’URL est bien livrée ensuite, et qu’un profil déjà occupé
est écarté d’une réservation par lot.

## Comptes et propriété

Un `ADMIN` gère tout. Un `MANAGER` possède ses propres profils, groupes et
sites, et reçoit les accès qu'on lui partage.

Les identifiants du `.env` restent acceptés **tant qu'aucun compte ne porte
ce nom** : à la première connexion ils créent le premier `ADMIN`, et tout ce
qui existait lui est attribué. Une installation en place n'a donc rien à
faire.

| Route | Qui |
| --- | --- |
| `POST /api/auth/login` | tous |
| `GET /api/me` | tout compte connecté |
| `GET/POST/PATCH/DELETE /api/users` | `ADMIN` seulement |
| `POST /api/users/:id/rotate-key` | `ADMIN` seulement |

Chaque compte a **sa propre clé d'automatisation**, rendue une seule fois à
sa création ou à sa régénération : aucune lecture ultérieure ne la montre.
La clé globale `AUTOMATION_API_KEY` reste valable et n'appartient à
personne. Le compte est relu en base à chaque requête, donc **désactiver
quelqu'un lui coupe l'accès immédiatement**, sans attendre l'expiration de
son jeton.

Trois refus évitent de s'enfermer dehors : un administrateur ne peut ni se
rétrograder, ni se désactiver, ni se supprimer, et le dernier administrateur
actif ne peut pas être retiré.

### Qui possède quoi

`Profile`, `Group`, `ContentSource` et `SourceIngest` portent un
propriétaire. Le reste en hérite : un post appartient au propriétaire de son
profil, un article à celui de son site.

`NULL` veut dire **sans propriétaire**, donc réservé aux `ADMIN`. C'est ce
que devient une ressource quand son compte est supprimé : la clé étrangère
est en `SET NULL`, jamais en `CASCADE` — supprimer un compte ne doit pas
emporter ses groupes et l'historique de publication qui en dépend. La
réponse de la suppression dit combien de ressources ont été relâchées, et un
`ADMIN` les réattribue avec `PATCH /api/sites/:id { "ownerId": "..." }`
(chaîne vide pour retirer le propriétaire).

### Ce que chacun voit

Un `MANAGER` ne voit que ce qu'il possède : profils, groupes, sites, posts,
articles, reprises, journaux et lots de publication. Un `ADMIN` et la clé
globale d'automatisation voient tout.

La règle est écrite **une seule fois**, dans
[`src/auth/scope.ts`](src/auth/scope.ts) : la répartir dans les
quatre-vingt-dix requêtes du projet reviendrait à garantir qu'on en oublie
une, et une seule suffit à montrer les données d'un compte à un autre. Les
racines filtrent sur `ownerId` ; ce qui en dépend hérite — un post par son
profil, un article par son site, un lot par son profil.

Deux conséquences voulues :

- **Une ressource sans propriétaire ne correspond à aucune condition de
  gestionnaire.** Un oubli la rend invisible, jamais partagée par accident.
- **Hors de portée veut dire introuvable, pas interdit.** Toutes les routes
  répondent `404`, y compris les écritures : un `403` confirmerait
  l'existence de la ressource à qui devine son identifiant.

La clé d'automatisation d'un compte ne voit que ses profils et ne réserve
que ses lots. Chaque étape du parcours de publication — `consumed`,
`published`, `commented`, `complete`, `link-updated` — vérifie que le lot
lui appartient : ces routes ne prennent qu'un `jobId`, et sans ce contrôle
il suffirait de le deviner.

### Partager, sans donner la main

Un groupe ou un site se partage avec un compte **en publication seule** :

```bash
POST   /api/groups/:id/access  { "userId": "..." }
DELETE /api/groups/:id/access/:userId
GET    /api/groups/:id/access
```

Les mêmes trois routes existent sous `/api/sites/:id/access`. Le
propriétaire accorde, ou un `ADMIN`.

| Le bénéficiaire peut | Le bénéficiaire ne peut pas |
| --- | --- |
| voir la ressource | la renommer, changer son URL |
| publier dedans / y déposer | la désactiver, la supprimer |
| la choisir dans son extension | la repartager, voir qui y a accès |
| | lire la clé du plugin du site |

C'est ce qui impose **deux conditions de portée** dans
[`src/auth/scope.ts`](src/auth/scope.ts) : `groupWhere` / `siteWhere` pour
ce qu'on voit et où l'on peut publier, `groupManageWhere` /
`siteManageWhere` pour ce qu'on peut modifier. Les confondre laisserait un
bénéficiaire renommer le groupe d'un autre.

Sur une tentative de gestion, la réponse est un **403 explicite** — « Ce
groupe vous est partagé pour publier : seul son propriétaire le modifie » —
et non un 404 : la ressource, on la voit déjà, il n'y a rien à cacher.

Trois refus à la création d'un partage : avec le propriétaire lui-même,
avec un `ADMIN` (qui voit déjà tout, et croirait tenir l'accès de là), et
avec un compte désactivé. Repartager ce qui l'est déjà ne fait rien plutôt
que d'échouer. Supprimer un compte emporte ses partages — `CASCADE` ici,
contrairement à la propriété qui est en `SET NULL`.

## Sécurité

Les routes sont déjà protégées par deux clés distinctes : `AdminAuthGuard`
(session admin) sur `/api/admin/*`, `/api/profiles`, `/api/groups` et
`/api/posts`, et `AutomationAuthGuard` (en-tête `X-API-Key`, comparaison à
temps constant) sur `/api/jobs/*` et `/api/logs`.

Renseigner `AUTOMATION_API_KEY`, `ADMIN_PASSWORD` et `AUTH_SECRET` dans `.env`.
Les secrets ne doivent jamais être enregistrés en base ou transmis dans les
logs.

## Reprise d’une publication Facebook

Une reprise part d’un post Facebook et de la page qui en porte le contenu.
L’API lit la page, en fait réécrire un article, le dépose sur WordPress, et le
retour du plugin fabrique le nouveau post — image d’origine, texte réécrit,
lien vers le nouvel article.

```bash
# 1. Enregistrer la reprise. `siteUrl` est facultatif : défaut WORDPRESS_SITE_URL.
curl -X POST "$API_BASE/admin/ingest" -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' -d '{
    "facebookUrl": "https://www.facebook.com/exemple/posts/123",
    "sourceUrl": "https://exemple.com/article",
    "language": "fr"
  }'

# 2. La collecte. En temps normal l’extension s’en charge (voir plus bas) ;
#    à la main, la réponse attend la suite du traitement : compter une minute.
curl -X POST "$API_BASE/admin/ingest/$ID/scrape-result" -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"caption": "Texte du post d’origine", "imageUrl": "https://.../image.jpg"}'

# 3. Suivre, et relancer ce qui a échoué.
curl "$API_BASE/admin/ingest/$ID" -H "Authorization: Bearer $TOKEN"
curl -X POST "$API_BASE/admin/ingest/$ID/retry" -H "Authorization: Bearer $TOKEN"
```

`profileIds` et `groupIds` restreignent la diffusion ; laissés vides, la
reprise s’adresse à tous les profils actifs et à leurs groupes.

### Ce que chaque étape garde

Une étape qui échoue ne fait pas perdre celles d’avant : le statut reste celui
de l’étape à refaire, `attempts` monte, `lastError` dit pourquoi. `retry`
repart de ce que la fiche contient déjà — une réécriture obtenue n’est jamais
repayée, une page déjà lue n’est jamais relue. Au bout de cinq échecs la
reprise passe en `FAILED` et cesse de se relancer seule.

| Statut | Ce qu’on attend |
| --- | --- |
| `PENDING_SCRAPE` | Le texte et l’image du post d’origine |
| `SCRAPED` | La lecture de la page source |
| `REWRITING` | La réécriture par le modèle |
| `REWRITTEN` | Le dépôt sur WordPress |
| `AWAITING_ECHO` | Le retour du plugin, qui fabrique les posts |
| `COMPLETED` | Rien : la boucle est fermée |
| `FAILED` | Une décision : `retry` ou suppression |

### Fournisseurs de réécriture

Les modèles sont essayés dans l’ordre de `LLM_PROVIDERS` (défaut
`kimi,openai,gemini`). **Seul un fournisseur muni d’une clé entre dans la
chaîne** ; le premier qui rend un JSON exploitable l’emporte. Un compte
suspendu, un quota dépassé, une panne ou une réponse illisible font passer au
suivant, et le journal dit sur lequel on a basculé.

| Fournisseur | Clé | Modèle par défaut | Schéma strict | Budget / délai |
| --- | --- | --- | --- | --- |
| `openai` | `OPENAI_API_KEY` | `gpt-4.1-mini` | oui | ceux de l’appel |
| `deepseek` | `DEEPSEEK_API_KEY` | `deepseek-v4-pro` | **non** | 8 000 tokens, 180 s |
| `gemini` | `GEMINI_API_KEY` | `gemini-2.5-flash` | oui | ceux de l’appel |
| `kimi` | `KIMI_API_KEY` | `kimi-k2.6` | non | ceux de l’appel |

Deux particularités mesurées sur l’API, pas devinées. DeepSeek **refuse le
schéma strict** (`response_format type is unavailable`) : la chaîne bascule
sur le mode JSON libre, le schéma part dans la consigne, et la sortie est de
toute façon renormalisée. Et ses modèles **raisonnent** — environ 2 500 tokens
avant la première phrase, 75 s pour un article complet — d’où son budget et
son délai propres, sans quoi la réponse serait tronquée.

Les modèles OpenAI récents refusent `max_tokens` et veulent
`max_completion_tokens` ; les passerelles compatibles n’ont souvent que
l’ancien nom. Le bon est choisi par fournisseur.

Tous sont appelés en « Chat Completions » : c’est la seule interface que les
quatre exposent. Chaque réglage se surcharge par fournisseur —
`<PREFIX>_MODEL`, `<PREFIX>_BASE_URL`, `<PREFIX>_TIMEOUT_MS`,
`<PREFIX>_MAX_TOKENS`, `<PREFIX>_TOKEN_PARAM`, `<PREFIX>_JSON_SCHEMA` — ou
globalement avec `LLM_TIMEOUT_MS` et `LLM_MAX_TOKENS`.

Sans aucune clé, la reprise s’arrête en `REWRITING` et le dit dans
`lastError`. `/admin/posts/generate` reste sur OpenAI seul, sans repli.

### Les sites de destination

Une reprise se dépose sur un site **déclaré dans la plateforme**, section
**Sites** de l’interface d’administration (ou `GET/POST/PATCH/DELETE
/api/sites`). Chaque site porte son nom, son adresse, et **la clé de son
propre plugin** — deux sites n’ont aucune raison de partager la même.
Laissée vide, la clé globale `WORDPRESS_API_KEY` sert.

Un site inconnu est **refusé** : sans cette vérification, la clé
d’automatisation suffirait à faire déposer nos articles sur n’importe quel
domaine. Le site de `WORDPRESS_SITE_URL` fait exception : il se déclare tout
seul la première fois, sans quoi une installation neuve refuserait sa propre
destination.

Un site désactivé n’est plus proposé comme destination ; ses articles et ses
posts restent intacts. Un site qui porte des articles ne se supprime pas —
la suppression les emporterait, et avec eux les posts qui en sont nés.

L’extension lit cette liste sur `GET /api/jobs/sites` (clé d’automatisation)
et en fait un menu déroulant. **Aucune clé de site n’en ressort**, ni par
cette route, ni par la lecture admin : on sait seulement si un site en a une.
Un site ajouté dans la plateforme apparaît dans l’extension sans rien y
réinstaller.

### La collecte par l’extension

Deux chemins, selon qu’on décide au coup par coup ou qu’on laisse tourner.

**Au coup par coup — l’extension [`extension/fb-catch-post`](extension/fb-catch-post/).**
On est devant une publication qui marche, on clique, on colle l’adresse de
l’article à réécrire, et tout part en un seul appel :

```bash
curl -X POST "$API_BASE/jobs/scrape/capture" -H "X-API-Key: $KEY" \
  -H 'Content-Type: application/json' -d '{
    "facebookUrl": "https://www.facebook.com/…/posts/…",
    "sourceUrl":   "https://exemple.com/article",
    "caption":     "Le texte du post, tel quel",
    "imageUrl":    "https://scontent…/photo.jpg",
    "profileIds":  ["<un profil>"]
  }'
```

La réponse est immédiate ; la suite se fait côté serveur. C’est le seul appel
dont l’extension a besoin : ni réservation, ni attente.

**En continu — la file de collecte.** Pour un automate qui traite une liste
préparée à l’avance :

Un post Facebook ne se lit pas depuis le serveur : une requête sur une
permalink renvoie un mur de connexion. L’extension, elle, est déjà connectée
au compte. Elle interroge donc les mêmes routes que les lots de publication,
avec la même clé `X-API-Key` :

```bash
# Réserver une collecte. Rend `scrape: null` quand la file est vide.
curl -X POST "$API_BASE/jobs/scrape/claim?profileExternalId=mon-profil" -H "X-API-Key: $KEY"
# → {"scrape": {"scrapeId": "...", "facebookUrl": "...", "claimExpiresAt": "..."}}

# Rendre ce qu’on a relevé. La réponse est immédiate.
curl -X POST "$API_BASE/jobs/scrape/$SCRAPE_ID/result" -H "X-API-Key: $KEY" \
  -H 'Content-Type: application/json' \
  -d '{"caption": "Texte du post", "imageUrl": "https://.../photo.jpg"}'

# Ou signaler que la publication est illisible.
curl -X POST "$API_BASE/jobs/scrape/$SCRAPE_ID/failed" -H "X-API-Key: $KEY" \
  -H 'Content-Type: application/json' -d '{"error": "Publication supprimée"}'
```

Deux extensions qui interrogent en même temps repartent avec deux reprises
différentes : la réservation se fait en `SKIP LOCKED`. Une réservation expire
après `CLAIM_TTL_MINUTES` et la reprise **revient d’elle-même dans la file**,
sans balayage séparé — une extension qui disparaît en cours de route ne
bloque rien. Un résultat déposé après l’expiration reste accepté : la
collecte est faite, la perdre n’aurait pas de sens.

`result` rend la main tout de suite et laisse la lecture de la page, la
réécriture et le dépôt WordPress se poursuivre côté serveur : l’extension a
d’autres lots à traiter. L’avancement se suit sur `/admin/ingest/:id`.

`failed` remet la reprise dans la file ; au bout de cinq échecs elle passe en
`FAILED` et n’est plus proposée.

### Le dépôt et le retour

Une fois l’article réécrit, l’API le dépose sur `POST
{siteUrl}/wp-json/dfb/v1/articles`, protégé par `WORDPRESS_API_KEY` — la même
clé que la réception, et le **plugin 1.2.0** est requis. L’image du post
d’origine part en base64 dans le corps : une URL de CDN Facebook est signée et
expire, et le site WordPress n’a aucune raison d’y accéder.

Le plugin publie, ce qui déclenche son envoi habituel vers
`POST /api/wordpress/articles` — avec `ingestRef` en plus. **C’est ce retour,
et lui seul, qui fabrique les posts** : rien n’est dupliqué, la réception
WordPress sait déjà le faire. La diffusion se limite à `profileIds` /
`groupIds` si la reprise en a fixé.

### La langue, et ce que « réécrire » veut dire

`language` vaut **`auto`** par défaut : l'article garde la langue de la page
source, lue sur son `<html lang>` puis sur son `og:locale`. Une langue
imposée (`fr`, `en`, …) l'emporte, mais elle fait **traduire** l'article au
passage — réécrire n'est pas traduire. La langue retenue est enregistrée sur
la reprise, donc une relance ne la redemande pas.

La consigne du modèle étant en français, il ne suffisait pas de lui demander
de « garder la langue des notes » : il repartait en français. La langue est
donc nommée explicitement, et la règle porte sur **chaque champ** du JSON —
l'énumérer champ par champ laissait `metaDescription` en français pendant
que le reste était en anglais.

La consigne demande une **réécriture fidèle**, pas un article neuf : mêmes
informations, même ordre, même niveau de détail, mots neufs. Rien n'est
ajouté ni retiré, et des notes brèves donnent un article bref. Une version
précédente demandait « structure, plan et formulation entièrement
nouveaux » — elle produisait un autre article sur le même thème.

Le contenu vient bien de l'URL fournie : la page est lue et extraite
(Readability), et `sourceText` sur la reprise dit combien de caractères ont
été retenus. **Une source pauvre donne un article pauvre** : si `sourceText`
est de l'ordre du millier de caractères, c'est la page source qu'il faut
changer, pas la consigne.

### L'article déposé est découpé en pages

WordPress coupe un article sur `<!--nextpage-->` et rend un lien « page
suivante ». `ARTICLE_PAGES` (défaut **3**) dit en combien de pages l'article
déposé est coupé ; `1` le laisse d'un seul tenant.

La coupure est décidée à l'API, pas par le modèle : on veut un nombre de
pages prévisible, et un modèle qui oublie la consigne rendrait un article
d'une seule page sans qu'on le sache. Elle tombe **au début d'une section**,
juste avant un `<h2>`, et une invitation à poursuivre la précède, dans la
langue de l'article.

Un article trop court fait **moins** de pages que demandé plutôt que des
pages vides : en deçà de 350 caractères par page, la coupure est abandonnée.

Le texte gardé sur la reprise reste d'un seul tenant : c'est au dépôt que le
découpage s'applique, donc un nouveau dépôt peut le redécouper autrement.

### Ce qui change, et ce qui ne change pas

C’est le cœur de la reprise : **seul l’article change**.

| | |
| --- | --- |
| Texte du post Facebook | **identique** à la publication d’origine, mot pour mot |
| Image du post | **identique**, simplement réhébergée sur le site |
| Contenu de l’article | **réécrit** intégralement |
| Lien en commentaire | le **nouvel** article |

Seule l’URL qui figurait dans la légende d’origine est retirée : elle
renverrait vers le site repris, alors que le nouveau lien arrive plus tard,
dans le commentaire. Hashtags et emojis de la légende restent, et rien ne
leur est ajouté. La légende réécrite par le modèle ne sert que de secours,
quand la collecte n’a rapporté aucun texte.

Une image qui ne suit pas n’arrête rien : l’article est en ligne, et
`INGEST_IMAGE_SKIPPED` le signale.

Pour essayer la chaîne sans rien écrire :

```bash
npx ts-node scripts/read-source.ts https://exemple.com/article --rewrite
```

## Intégration WordPress

Le plugin installable [`wordpress/data-fb-posting.zip`](wordpress/data-fb-posting.zip) transmet les nouveaux articles publiés à `POST /api/wordpress/articles`, protégé par la clé dédiée `WORDPRESS_API_KEY`. Chaque article prépare automatiquement un post court par profil actif, avec l’URL destinée au commentaire. Les modifications ultérieures et les envois répétés ne régénèrent pas les posts.

Voir le [guide d’installation et de fonctionnement](wordpress/README.md).
