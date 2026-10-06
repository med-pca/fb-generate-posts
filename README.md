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

L'interface d'administration est disponible sur `http://localhost:3000/`.
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
   └─ article reçu ─> un post PAR groupe actif « Recettes », mêmes données
                        ├─ post → Groupe A
                        ├─ post → Groupe B
                        └─ post → Groupe C
      (publié dans son groupe par le premier profil qui l'a rejoint)
```

Chaque groupe a **son** post : il se priorise, se modifie, se relance ou se
retire sans toucher aux autres. Son identifiant `article:group:<groupe>` rend
impossible un second exemplaire du même article dans le même groupe, même si
WordPress renvoie l'article. Une modification de l'article sur WordPress
réaligne tous ses posts encore à publier.

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

### Qui peut publier un post sans profil

Un post n'est attaché à un profil **qu'au moment de la réservation** : le
profil qui passe prend la prochaine publication d'un groupe qu'il a rejoint,
et le lot créé dit « ce profil publie ce post dans ce groupe ».

Un post sans profil est réservable par un profil quand :

1. le profil a **rejoint** le groupe (adhésion « Rejoint », profil et groupe
   actifs) ;
2. le post est **sans propriétaire, ou créé par un ADMIN** — ou créé par le
   gestionnaire à qui appartient le profil. (Un post créé à la main dans
   l'admin appartient au compte admin ; les profils ajoutés par la
   synchronisation NSTBrowser n'ont pas de propriétaire : exiger le même
   compte les excluait.)
3. la publication n'est pas forcée vers un autre profil.

**Rien à publier ?** La réservation dit pourquoi (`reason`, `message`,
`diagnosis`) et l'extension l'écrit dans le journal (`WORKER_NO_POST`, au plus
toutes les 30 min pour une même raison) :

| `reason` | Ce qu'il faut faire |
| --- | --- |
| `no_group` | lier le profil à des groupes |
| `not_joined` | il n'a rejoint aucun de ses groupes ; si des demandes ont été acceptées, « ✓ rejoint » dans Groupes |
| `no_post` | aucun post en attente dans ses groupes rejoints (les posts sont peut-être dans d'autres groupes, nommés dans le message) |
| `not_allowed` | les posts appartiennent à un autre gestionnaire, ou sont forcés vers un autre profil |
| `taken` | pris par d'autres profils entre-temps |

### Un lot ne bloque plus un profil pour rien

Un profil ne réserve pas de nouveau lot tant qu'il en tient un. Trois causes
pouvaient le laisser « occupé » sans que rien ne se publie :

- **La réservation était trop courte** : 30 min fixes, alors que l'extension
  attend le délai de chaque post (10 à 60 min) entre deux posts d'un lot. Elle
  dure désormais **`CLAIM_TTL_MINUTES` + la somme des délais** des posts du lot.
- **Un échec faisait attendre le délai complet** : rien n'a été publié, rien à
  espacer — l'extension (1.0.12) passe au post suivant après 15 s.
- **Un lot oublié** (extension réinstallée ou relancée en plein lot) : quand
  l'extension retrouve un lot qu'elle ne connaît pas, elle le **libère**
  (`POST /api/jobs/{id}/release`) et réserve aussitôt.

Côté API, un lot dont tous les posts sont terminés est **clos
automatiquement** à la réservation suivante (`JOB_AUTO_COMPLETED`). Et
l'admin peut **libérer un lot** depuis la file (« En train de partir » →
« Libérer le lot », `POST /api/admin/jobs/{id}/release`). Libérer rend à la
file les posts pas encore commencés ; un post en cours de publication est
laissé tel quel, pour ne jamais le publier deux fois (`JOB_RELEASED`).

### Retrouver le post publié, pour le commenter

Après la publication, l'extension doit **retrouver le post** dans le groupe
pour l'ouvrir et y poser le premier commentaire « . », remplacé ensuite par
l'URL. Depuis la version **1.0.13** :

- le post est reconnu sur ses **lettres et chiffres** seulement : les emojis
  (affichés en images par Facebook), les caractères stylisés et la
  ponctuation ne l'empêchent plus ;
- s'il n'est pas dans le fil, l'extension **recharge** le fil, puis cherche dans
  **« Votre contenu publié »** du groupe (les seuls posts du compte) ;
- un post **soumis** (fenêtre de publication fermée) mais toujours introuvable
  est enregistré **publié, à vérifier** — plus en échec : une relance l'aurait
  publié deux fois.

Pour remplacer « . » par l'URL, l'extension doit aussi lire **l'identifiant
du commentaire**. Facebook l'écrit en chiffres ou en base64
(`comment:<post>_<commentaire>`) ; avant la version **1.0.14**, seul le format
en chiffres était lu — le commentaire restait « . » (`WORKER_COMMENT_ID_MISSING`).

Depuis la 1.0.14 aussi, un lot interrompu par un arrêt (Pilotage, fenêtre
horaire, navigateur relancé) entre deux posts est **repris** au redémarrage,
au lieu d'être oublié puis libéré.

Dans la file, un échec qui est en réalité en ligne se règle avec **« ✓ Déjà en
ligne »** (`POST /api/posts/targets/{id}/published`, `TARGET_MARKED_PUBLISHED`) :
enregistré publié, jamais republié. **« ↻ Relancer » ne sert que si le post
n'est pas sur Facebook.**

### L'image d'un post

L'extension de publication télécharge l'image elle-même. Les images sont sur
les sites WordPress — un domaine par site — et Chrome ne laisse l'extension les
lire que si elle y est autorisée :

- depuis la version **1.0.11**, l'extension a d'office le droit de lire les
  images en HTTPS de n'importe quel site (plus de clic « Autoriser un autre
  domaine » dans chaque profil) ;
- si un site refuse quand même (anti-hotlink, erreur réseau), l'extension
  demande l'image à la plateforme : `GET /api/jobs/media?url=…` (`X-API-Key`).
  Ce relais ne sert **que** les images utilisées par un post ou un profil, en
  HTTPS, vers une adresse publique vérifiée à chaque redirection.

### Adhésions : « aucun profil » alors que le profil a rejoint

Seul un profil marqué **Rejoint** publie dans un groupe. Une demande acceptée
plus tard par l'administrateur du groupe restait « Demande envoyée » : le
groupe apparaissait « sans profil » dans la file. Trois corrections :

- **L'extension d'adhésion** (`fb-extention-join` 1.2.0) revérifie les
  demandes en attente toutes les 6 h, sans jamais recliquer.
- **Groupes → Voir les profils** : un bouton **✓ rejoint** à côté de chaque
  profil non rejoint corrige l'adhésion à la main
  (`PATCH /api/groups/{id}/profiles/{profileId}/join-status`).
- **La file et l'objectif** disent « N demande(s) en attente » au lieu de
  « aucun profil » quand c'est le cas.

Une revérification qui ne change rien n'écrit plus dans les journaux ; un
changement d'état reste tracé (`GROUP_JOIN_UPDATED`, « REQUESTED → JOINED »).

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

### La vérification des publications (profil vérificateur)

L'extension de publication peut se croire victorieuse à tort (permission
refusée, profil déconnecté, commentaire jamais remplacé par l'URL). Un profil
désigné **Vérificateur** dans le Pilotage rouvre chaque post publié avec
l'extension `extension/fb-post-checker` (voir son README) :

- en ligne avec le lien → **✓ Vérifié** ;
- introuvable → remis dans la file, **republié** dans ce groupe ;
- en ligne **sans** le lien → le vérificateur le **supprime** (il doit être
  admin du groupe), puis il est republié ; s'il n'a pas pu le supprimer, rien
  n'est republié (doublon) et il passe **⚠ À traiter** ;
- en attente de validation ou page illisible → revu plus tard.

Garde-fous : vérification au plus tôt 30 min après publication
(`VERIFY_AFTER_MINUTES`), 2 republications maximum par groupe, 5 pages
illisibles → À traiter. Dans **Posts → File d'attente**, la colonne
« Vérification » montre l'état de chaque publication, et le panneau
« À traiter » propose **C'est bon** ou **Republier** (sans plafond).

Routes : `POST /verify/claim`, `POST /verify/:targetId/result` (clé d'API,
profil vérificateur) ; `GET /admin/verify`, `PATCH /admin/verify/profiles/:id`,
`POST /admin/verify/targets/:id/resolve` (admin). Journaux : `VERIFY_REPUBLISH`,
`VERIFY_NEEDS_ACTION` (domaine Publication).

Migration : `npx prisma migrate deploy` (`20261002090000_publication_verification`).

### Le vérificateur accepte et pré-approuve nos profils

Dans les groupes dont il est admin ou modérateur, le vérificateur (extension
« Modérateur · PostFlow » (ex-FB Post Checker)) accepte la **demande d'adhésion** de nos profils, puis les
**pré-approuve** pour que leurs posts paraissent sans validation.

- Seuls les profils de la plateforme sont concernés, désignés par leur
  **identifiant Facebook numérique** : l'extension de publication (≥ 1.3.0,
  permission `cookies`) le remonte à chaque battement ; le Pilotage l'affiche
  sous le nom du profil (« saisir » / « modifier » à la main). Deux
  navigateurs sur un même compte Facebook sont signalés
  (`PROFILE_FACEBOOK_CONFLICT`), et un changement de compte remet ses
  autorisations à refaire.
- L'extension n'agit que sur la ligne portant exactement cet identifiant ; le
  serveur revérifie à chaque rapport (`MEMBER_MISMATCH` sinon).
- Pilotage → **Adhésions et pré-approbations** : bilan, échecs et leur
  raison, bouton **Relancer**. Journaux `MEMBER_APPROVED`,
  `MEMBER_PREAPPROVED`, `MEMBER_ACTION_FAILED` (Groupes & pilotage).

Routes : `POST /verify/members/claim`, `POST /verify/members/:id/result`
(vérificateur) ; `POST /admin/verify/members/:id/retry`,
`PATCH /admin/verify/profiles/:id` `{ facebookUserId }` (admin). Migration :
`20261003090000_member_moderation`.

### La rubrique Modérateurs (profils protégés)

Les profils **modérateurs** (vérification des publications, adhésion et
pré-approbation de nos profils) sont **à part** et **protégés** :

- seul un **administrateur de la plateforme** peut en désigner un, le
  modifier, le désactiver, le lier ou le délier, régler son pilotage, ou lui
  retirer le rôle ; un gestionnaire le voit en lecture seule (refus
  « Profil modérateur : seul un administrateur… ») ;
- ils n'apparaissent plus dans la page Profils, ni dans les actions en masse,
  ni comme repreneurs à la désactivation d'un profil ; « Tout en auto / tout
  arrêter » du Pilotage ne les touche pas (sauf pour un administrateur).

**Rubrique `/moderateurs`** : chaque modérateur avec son état (**en ligne**
si son extension a relu ses réglages il y a moins de 3 min, **suspendu**),
ses chiffres du jour et de la semaine, et ce qui attend (publications à
vérifier, à traiter, adhésions à faire). L'administrateur y **désigne** un
modérateur.

**Page `/moderateurs/<id>`** : ses chiffres (aujourd'hui, 7 j, 30 j, total —
vérifiées, en ligne avec lien, sans lien, introuvables, en attente,
illisibles, supprimées, suppressions impossibles, adresses retrouvées,
adhésions acceptées, pré-approuvés, échecs), le graphe des 14 jours, ses 40
dernières actions (avec le lien du post et l'historique), et pour
l'administrateur :

- **▶ Vérifier les posts** et, séparément, **▶ Lancer les tâches profils**
  (adhésions, pré-approbations, contrôles) : son extension s'y met dans la
  minute ; chiffres et dernières actions sont présentés séparément ;
- **Suspendre / Reprendre** : suspendu, il ne reçoit plus aucune tâche ;
- **Réglages** : publications par passage, fréquence, adhésions et
  pré-approbations oui/non (relus par l'extension chaque minute) ;
- **Revérifier « à traiter »**, **Relancer les adhésions en échec**,
  **Retirer le rôle**.

Routes : `GET /moderators`, `GET /moderators/:id`,
`PATCH /moderators/:id/settings`, `POST /moderators/:id/run|recheck|retry-members`
(admin), et pour l'extension `POST /verify/control` (relu chaque minute).
Journaux `MODERATOR_*`. Migrations `20261003180000_moderators` et
`20261004090000_moderator_members_run`. Extension
« Modérateur · PostFlow » (ex-FB Post Checker) **1.3.0** requise pour les passages demandés et les réglages
à distance.

### Demander au modérateur : accepter les adhésions, pré-approuver

Le modérateur fait ces deux actions à chaque passage, mais on peut aussi les
**demander** (elles passent alors en tête de sa file, et il s'y met dans la
minute) :

- rubrique **Modérateurs** → bloc **Demander au modérateur** :
  - **✓ Accepter les adhésions en attente** : nos profils en « Demande
    envoyée » / « Questions » ;
  - **★ Pré-approuver nos profils membres** : nos profils « Rejoint » pas
    encore pré-approuvés ;
  chaque bloc dit combien sont à faire, et combien sont **impossibles** (compte
  Facebook du profil inconnu : l'extension de publication ≥ 1.3 le remonte,
  ou il se saisit dans le Pilotage) ;
- **page d'un profil** → sur la ligne du groupe : **★ Pré-approuver** ou
  **✓ Accepter**, ou plusieurs groupes cochés → « Pré-approuver la
  sélection ».

La ligne passe à « ⏳ demandé au modérateur », puis au résultat. Journal :
`MEMBER_ACTION_REQUESTED` (avec les profils bloqués et pourquoi), puis
`MEMBER_APPROVED`, `MEMBER_PREAPPROVED` ou `MEMBER_ACTION_FAILED` (« Suivre au
journal → »). Si aucun modérateur ne peut le faire (aucun désigné, suspendu,
ou adhésions désactivées dans ses réglages), c'est dit tout de suite.

Routes : `GET /moderators/members`, `POST /moderators/members { kind,
profileGroupIds?, profileId? }` (admin). Migration
`20261003230000_member_requests`.

### La page « ★ Pré-approbations »

`/pre-approbations` liste chaque groupe où l'un de nos profils est
**membre**, **les profils les plus récemment ajoutés en premier**, groupés
par profil (date d'ajout, nombre de groupes).

- **Filtres** : un profil (liste des profils récents d'abord, avec ce qui
  reste à faire), une recherche (groupe ou profil), et l'état :
  **✗ À pré-approuver** (par défaut), **⏳ Demandé**, **⚠ En échec** (avec la
  raison et le nombre d'essais), **✓ Déjà pré-approuvé**, **Compte Facebook
  inconnu**, **Tous** — chaque onglet avec son compte.
- **Sélection** : une case par ligne, une case par profil (tous ses
  groupes), « Tout cocher (visibles) ».
- **Actions** (administrateur) : **★ Pré-approuver la sélection** ou ligne par
  ligne, **🔍 Tester** (le modérateur regarde sans rien modifier).

Route : `GET /moderators/preapprovals?profileId&state&search`.

### Tester la pré-approbation : déjà faite ou pas ?

Le modérateur peut **contrôler sur Facebook**, pour chacun de nos profils
dans chacun de ses groupes, si la pré-approbation est faite :

- **Contrôler (sans rien modifier)** : il ouvre la page du membre dans le
  groupe, ouvre le menu de gestion, lit les options, le referme. **Rien n'est
  cliqué.** « Retirer la pré-approbation » proposé = **déjà faite** ;
  « Pré-approuver » proposé = **pas faite** ; aucun menu = pas l'option
  (il n'est pas admin/modérateur) ; ni l'un ni l'autre = introuvable.
- **Contrôler et corriger** : même chose, puis il pré-approuve ce qui manque.

Où le lancer :
- **un seul groupe** (premier essai) : page du profil → ligne du groupe →
  **🔍 Tester** (ou plusieurs groupes cochés → « Tester la pré-approbation ») ;
- **tout** : rubrique Modérateurs → **Contrôler tout** / **Contrôler et
  corriger**. Les modérateurs actifs sont réveillés et s'y mettent dans la
  minute (extension « Modérateur · PostFlow » (ex-FB Post Checker) **1.4.0**).

Traçabilité : chaque constat est enregistré sur la liaison profil × groupe
(état, date, ce qui a été vu) et écrit au journal — `MEMBER_AUDIT_REQUESTED`,
`MEMBER_AUDIT_ALREADY`, `MEMBER_AUDIT_NOT_DONE`, `MEMBER_AUDIT_FIXED`,
`MEMBER_AUDIT_NO_PERMISSION`, `MEMBER_AUDIT_NOT_FOUND`,
`MEMBER_AUDIT_UNREACHABLE` — avec le libellé exact vu sur Facebook et le
modérateur qui a regardé. La plateforme s'aligne sur Facebook : « pas faite »
remet la pré-approbation en tâche, « déjà faite » l'enregistre. La rubrique
Modérateurs affiche le bilan et le détail (filtres : en attente, déjà faite,
pas faite, impossible), et la page du profil montre pour chaque groupe
« ✓ déjà faite / ✗ pas faite — vérifié il y a … ».

Routes : `POST /moderators/audit { mode, profileGroupIds?, profileId? }`
(admin), `GET /moderators/audit`, et pour l'extension
`POST /verify/members/audit/claim`, `POST /verify/members/audit/:id/result`.
Migration `20261003210000_preapproval_audit`.

### Traçabilité : le lien de chaque publication et son historique

Chaque publication (un post dans un groupe) garde **l'adresse de son post
Facebook** et un **historique** qui ne s'efface pas (table
`publication_traces`) : publié par quel profil et à quelle adresse, publié
sans adresse, commentaire posé, lien de l'article posé, échec, relance,
vérification (en ligne, introuvable, sans lien), suppression par le
vérificateur, remise en file (avec l'ancienne adresse), validation à la main.

D'où vient l'adresse :
- l'extension de publication la donne en confirmant la publication ;
- sinon, le **vérificateur la retrouve** dans le fil du groupe (texte et
  auteur du post) et la renvoie ;
- ou l'admin la colle : **Coller le lien** sur la ligne publiée, ou au moment
  de « Déjà en ligne ».

Dans **Posts → File d'attente** :
- « Déjà publiés » montre le lien Facebook, ou **⚠ adresse inconnue** ;
- **Historique** ouvre les tentatives (profil, état, lien) et le fil des
  événements ;
- le champ **Coller un lien de post Facebook… → Retrouver** retrouve la
  publication derrière n'importe quel lien, même un ancien (post supprimé puis
  republié).

Routes : `GET /posts/targets/:id/history`, `PUT /posts/targets/:id/facebook-url`,
`GET /posts/targets-by-url?url=`. Migration :
`20261002120000_publication_traces` (reprend les adresses et les publications
déjà enregistrées).

### Nos extensions : téléchargement et historique

Les quatre extensions Chrome sont dans ce projet, dossier `extension/` :

| Extension | Dossier |
|---|---|
| Publication · PostFlow | `extension/fb-group-poster` (ex-`fb-lyazidi/extension`) |
| Adhésion aux groupes · PostFlow | `extension/fb-group-joiner` (ex-`fb-extention-join`) |
| Capture de posts · PostFlow | `extension/fb-catch-post` |
| Modérateur · PostFlow | `extension/fb-post-checker` |

**Aucune clé dans le code** : les fichiers de configuration sont vides dans
le dépôt. La rubrique **Extensions** (`/extensions`, menu « Suivi &
réglages ») fabrique le paquet ZIP à la demande :

- **Télécharger (préconfigurée)** : la clé d'API du compte connecté (et sa clé
  NSTBrowser) est écrite dans le fichier de configuration — rien à saisir à
  l'installation ; ne pas partager ce fichier ;
- **Sans clé** : le paquet tel quel.

**Historique = sauvegarde** : au démarrage du serveur (ou « ↻ Relire les
versions »), chaque extension est relue ; toute nouvelle version — ou un
contenu changé sans changer de numéro (`1.9.0+abc1234`) — est enregistrée en
base (table `extension_releases`) et **jamais effacée**. Chaque version
reste téléchargeable ; un administrateur peut **revenir** à une version
(« ↩︎ », elle devient la version proposée) puis « Suivre à nouveau la plus
récente ». Journal (domaine Sécurité) : `EXTENSION_RELEASED`,
`EXTENSION_DOWNLOADED` (qui, quelle version, préconfigurée ou non),
`EXTENSION_PINNED`.

Pour publier une nouvelle version : modifier le code, **monter la version**
dans son `manifest.json`, déployer. Migration :
`20261004120000_extension_releases`. Les ZIP ne sont plus suivis par git
(`extension/*.zip`).

### Le menu et le Pilotage : organisation

**Menu** groupé par tâche, en sections repliables (l'état est retenu ; la
section de la rubrique ouverte reste dépliée ; une section repliée affiche
un point rouge si l'une de ses rubriques a une alerte) :

- *Vue d'ensemble*
- **Publication** : Posts, Articles, Sites, Catégories
- **Profils Facebook** : Profils, Groupes, Pilotage, Actions en masse
- **Modération** : Modérateurs, Pré-approbations
- **Suivi & réglages** : Journaux, Comptes, Paramètres

**Pilotage** — trois sous-onglets, chacun avec son adresse : **Profils**
(`/pilotage`), **Objectif du jour** (`/pilotage/objectif`), **Nos profils
dans les groupes** (`/pilotage/adhesions`). L'interrupteur « Publication
autorisée » est toujours visible (vert / rouge).

Onglet Profils : des **filtres rapides cliquables** avec leur compteur
(Tous, ⚠ À vérifier, ▶ Au travail, ⏸ Doivent publier sans travailler, ■
Arrêtés, 🔑 Appairage à refaire), une barre (recherche, mode, état, Tout en
auto, Tout arrêter, Vérifier les appairages), et un tableau resserré : profil
(+ identifiant Facebook), pilotage (mode, fenêtre), navigateur · extension,
appairage, compteurs, « Réglages » et « ⋯ » (appairer, identifiant Facebook,
page du profil, rôle modérateur). Les lignes à vérifier sont marquées d'un
trait rouge.

### La page Posts : organisation

Deux onglets : **File de publication** et **Bibliothèque de posts**, avec
« + Nouveau post » toujours à droite.

**File de publication** — une barre de filtres (catégorie, groupe, recherche
dans le titre, le texte ou le groupe ; « 🔗 Retrouver par lien Facebook »
s'ouvre à la demande), puis **un onglet par état, avec son compteur**, et un
seul tableau affiché :

| Onglet | Adresse | Contenu |
|---|---|---|
| ⏳ À venir | `/posts` | l'ordre de passage, priorités ⤒ ↑ ↓ |
| ▶ En cours | `/posts/en-cours` | réservés / en publication, « Libérer le lot » |
| ✓ Publiés | `/posts/publies` | date, lien Facebook, lien article, vérification |
| ⚠ En échec | `/posts/echecs` | raison, « ↻ Relancer » |
| 🔍 À traiter | `/posts/a-traiter` | ce que le modérateur n'a pas réglé |

Les onglets « En échec » et « À traiter » passent en rouge quand ils ne sont
pas vides. Chaque ligne montre **une** action (Modifier, ↻ Relancer, ✓ C'est
bon…) et un menu **« ⋯ »** pour le reste : Envoyer par un profil, Déjà en
ligne, Modifier, Historique, Corriger le lien, Retirer de ce groupe.

**Bibliothèque de posts** (`/posts/tous`) — une liste compacte : image, titre
et texte, groupes visés (2 + « +N »), **avancement** (barre « x/y publiés »,
échecs en rouge), date et délai, « Modifier » et « ⋯ → Supprimer ».

### Un site désactivé ne synchronise plus

Tant qu'un site est **inactif** (page Sites → Modifier → État), ses articles
sont **ignorés pour de bon** : ni article, ni post. À la réactivation, les
articles **suivants** sont créés normalement ; ceux publiés pendant la pause
ne le seront jamais.

- L'API répond un succès (`ignored: true`) : le plugin marque l'article envoyé
  et cesse de le renvoyer.
- L'article ignoré est retenu (`ignored_articles`) : WordPress le renverrait à
  sa prochaine modification, et il serait alors créé après coup. Il reste
  ignoré, même une fois le site réactivé.
- Un article reçu **avant** la pause n'est pas mis à jour pendant celle-ci,
  mais reste un article du site.
- Journal : `WORDPRESS_SITE_INACTIVE` (Synchronisation). Les reprises vers un
  site inactif sont refusées.

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

### Santé des profils, fiche détaillée, désactivation avec transfert

**Page Profils** : filtres par recherche (nom, identifiant NSTBrowser ou
Facebook), statut, **santé** (Bon, À surveiller, Mauvais, Pas assez de
données, **⚠ À désactiver ?**), pilotage (en marche / arrêté), catégorie, et
tri (récents, meilleur score, plus d'échecs, plus de publications, nom).
Chaque carte montre son **score sur 100**.

**Le score** (14 jours) : réussite des publications 50 %, posts vérifiés en
ligne avec leur lien 30 % (constats du vérificateur imputés au profil qui
avait publié), lien de l'article posé 20 %, moins 10 points par échec
d'affilée au-delà du premier. Bon ≥ 80, À surveiller ≥ 50, Mauvais en
dessous ; moins de 3 tentatives = pas assez de données.

**Indice « À désactiver ? »** quand le profil est mauvais (ou en série
d'échecs) avec une raison : 3 échecs d'affilée, ≥ 5 échecs et moins de 50 %
de réussite, ≥ 3 posts introuvables/sans lien au contrôle, lien posé sur
moins de la moitié des posts, ≥ 3 réservations perdues.

**Fiche détaillée** (clic sur le profil) : score et raisons, publiés
aujourd'hui / 7 j / 30 j / total, échecs, taux de réussite, de vérification et
de liens, échecs d'affilée, réservations perdues, groupes rejoints et
pré-approuvés, graphe des 14 jours, détail par groupe, erreurs les plus
fréquentes, derniers échecs (avec leur historique).

**La page d'un profil** (`/profils/<id>`, clic sur un profil) remplace la
fenêtre : santé, statistiques, graphe, activité par groupe, erreurs, et
**tous ses groupes** (catégorie, adhésion, pré-approbation, posts en
attente) avec filtres, sélection multiple, « ✓ rejoint », « Retirer », et un
bloc **Lier ce profil à d'autres groupes** (par catégorie, recherche, tout
cocher).

**Désactiver** passe par cette page, qui propose un **repreneur** : actif, qui a
rejoint le plus de groupes concernés, puis le meilleur score (présélectionné).
À la désactivation : son lot en cours est libéré, ses publications forcées et
ses propres posts vont en priorité au repreneur dans les groupes qu'il a
rejoints (ailleurs, ils restent dans la file pour les autres profils), son
pilotage passe à l'arrêt. Les groupes où il était le seul profil sont
signalés. Journal : `PROFILE_DEACTIVATED`.

Routes : `GET /profiles?search&status&health&activity&categoryId&sort`,
`GET /profiles/:id/health`, `POST /profiles/:id/deactivate { transferTo }`.

### Actions en masse

Page `/actions-en-masse` (menu, et boutons des pages Profils et Groupes) :

- **Lier profils ↔ groupes** : cocher des profils (recherche, actifs/tous) et
  des groupes (catégorie, recherche), « Tout cocher (visibles) », puis
  **Lier** ou **Délier** : chaque profil coché à chaque groupe coché. Une
  liaison existante n'est pas dupliquée, une liaison désactivée est
  réactivée, un nouveau lien part « à rejoindre ». 50 000 liaisons au plus
  d'un coup.
- **Partager avec des comptes** (administrateurs) : groupes ou sites ×
  comptes gestionnaires, **Partager** ou **Retirer le partage** ; chaque refus
  (pas propriétaire, compte désactivé…) est détaillé sans arrêter les autres.

Routes : `GET /bulk/profiles`, `GET /bulk/groups?search&categoryId`,
`POST /bulk/link { profileIds, groupIds, action }`,
`POST /bulk/share { kind, ids, userIds, action }`. Journaux
`GROUP_BULK_LINK`, `GROUP_BULK_UNLINK`, `GROUP_BULK_SHARE`,
`GROUP_BULK_UNSHARE`.

### L'objectif du jour

En tête du **Pilotage** : un objectif de publications par jour (par exemple
200), étalé sur une plage horaire (8 h → 22 h par défaut, fuseau
`Europe/Paris`), suivi en temps réel (relu toutes les 30 s).

- **Où l'on en est** : publiés / objectif, et surtout l'écart avec ce qui est
  **attendu à cette heure** (à mi-plage, la moitié). Statut : en avance, dans
  les temps (moins de 10 % de retard), en retard, atteint, manqué.
- **Rythme** : celui de la dernière heure, celui qu'il faut tenir d'ici la fin,
  et la projection en fin de plage au rythme actuel.
- **Stock** : les posts prêts dans des groupes qui peuvent publier (au moins un
  profil actif, non arrêté, qui les a rejoints), et ceux **bloqués** ailleurs.
- **Articles à importer** : ce qui manque au stock, converti en articles — un
  article d'un site devient un post dans chaque groupe prêt de sa catégorie.
- **Par catégorie, par groupe, par profil** : publiés, stock, blocages ; la
  part de l'objectif de chaque profil participant.
- **Conseils** : ce qu'il faut faire, par ordre d'importance.

```http
GET   /api/insights/objective
PATCH /api/settings   { "dailyTarget": 200, "objectiveStart": 480, "objectiveEnd": 1320 }
```

Autres lectures : `GET /api/insights/counters` (les compteurs du menu de
gauche) et `GET /api/insights/profiles` (par profil : publiés aujourd'hui, sur
7 jours, au total, échecs, groupes rejoints ou en attente, stock qui l'attend).

### Effacer les posts, les articles, ou les deux

**Paramètres → Zone dangereuse** (ADMIN), sur tous les comptes. On coche ce
qu'on veut effacer ; la fenêtre dit, avant de confirmer, exactement ce qui va
se passer.

| Coché | Effet |
| --- | --- |
| Posts seulement | Tous les posts et leurs publications par groupe. Les articles restent ; option **désarchiver** les articles, pour qu'ils redonnent des posts |
| Articles seulement | Tous les articles. Pour les posts qui en viennent, la fenêtre **demande** : les supprimer aussi, ou les garder (ils restent dans la file, sans article) |
| Les deux | Tout |

Jamais touchés : profils, groupes, catégories, sites, comptes, réglages,
journaux. Les lots de publication vidés partent avec leurs posts.

```http
POST /api/admin/reset  { "posts": true, "unarchive": true, "dryRun": true }         # compter, voir le plan
POST /api/admin/reset  { "articles": true, "articlePosts": "keep", "confirm": "EFFACER" }
```

`confirm: "EFFACER"` est exigé. Dès que des posts sont supprimés, c'est
refusé pendant qu'un lot se publie, sauf `force: true`. Journal :
`ADMIN_RESET`, avec le choix fait. Les sites WordPress ne renvoient pas
d'eux-mêmes les articles déjà transmis.

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

### Appairage automatique (sans code)

Avec beaucoup de profils, copier un code par profil devient pénible. À la
place :

1. Construire le paquet préconfiguré de l'extension de publication :
   `cd fb-lyazidi/extension && npm run pack:preset` → `fb-lyazidi/dist/fb-group-poster-preset.zip`.
   Il prend l'adresse de l'API, la clé (`JOB_API_KEY`) et la clé NSTBrowser
   (`NST_API_KEY`) dans `fb-lyazidi/.env`. **Il contient la clé : ne pas le
   partager** (`dist/` est ignoré par git).
2. L'installer **une fois pour tous les profils** dans NSTBrowser.
3. Au lancement de chaque profil, l'extension **détecte seule son profil
   NSTBrowser** (un bref onglet + l'API locale de NSTBrowser) et s'annonce :
   `POST /api/control/auto-pair { profileExternalId, name }` (`X-API-Key`).
   Un profil absent de la plateforme est créé au nom du compte de la clé ; un
   profil d'un autre compte est refusé. Journal : `RUNNER_AUTO_PAIRED`.

La détection est refaite à chaque démarrage : un profil NSTBrowser cloné se
présente sous son propre identifiant. L'appairage par code reste disponible
(options de l'extension), avec un bouton « Détecter le profil et s'appairer ».

### L'état réel d'un appairage

« Appairé » ne veut plus dire « un code a été échangé un jour ». La colonne
Appairage du Pilotage montre ce que l'API peut constater, sans pouvoir
interroger le navigateur :

| État | Ce qui le prouve | Quoi faire |
| --- | --- | --- |
| appairé ✓ | un battement réussi depuis moins de 24 h | rien |
| non confirmé | appairé, mais aucun battement depuis | ouvrir le navigateur |
| à confirmer | plus vu depuis plus de 24 h | ouvrir le navigateur |
| à ré-appairer (clé) | la clé du compte n'est plus celle du navigateur : clé régénérée, profil passé à un autre compte, compte désactivé | Ré-appairer |
| à ré-appairer (identifiant) | l'identifiant NSTBrowser a changé depuis l'appairage | Ré-appairer |
| refusé | le navigateur bat, mais sa clé est refusée (inconnue, ou d'un compte qui ne voit pas ce profil) | Ré-appairer |

Ce que le serveur retient pour en juger (`profile_runners`) : l'empreinte
sha256 de la clé remise à l'appairage puis relue à chaque battement
(`paired_key_hash`), l'identifiant remis (`paired_external_id`), et le dernier
battement refusé (`key_rejected_at`, `key_reject_reason`). La clé elle-même
n'est jamais stockée une seconde fois.

**Vérifier les appairages** (bouton du Pilotage, `POST /api/runners/pairing-check`)
vérifie tous les profils appairés d'un coup, affiche le bilan en tête de page
(ce qui est à refaire et pourquoi) et filtre la liste sur les appairages à
refaire. Journal : `RUNNER_PAIRING_CHECKED` (domaine « Groupes & pilotage »).
Un appairage cassé compte aussi dans « ⚠ à vérifier ».

Les appairages faits avant cette version n'ont pas d'empreinte : ils sont
jugés sur leurs battements, et reçoivent leur empreinte au premier battement
réussi.

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

### Suivre une publication dans le journal

Chaque événement d'une publication porte, quand il y en a un, **le lien de son
post Facebook** (colonne « Post Facebook », cliquable) ainsi que son profil,
son groupe, son post et la publication (post × groupe) :

| Étape | Événements |
|---|---|
| Publication | `POST_PUBLISHED` (avec le lien, ou WARN « sans adresse »), `POST_FAILED`, `WORKER_PUBLISHED` |
| Commentaire et lien | `POST_COMMENTED`, `COMMENT_LINK_UPDATED` (avec l'URL de l'article posée) |
| Vérification | `VERIFY_OK`, `VERIFY_PENDING`, `VERIFY_UNREACHABLE`, `VERIFY_MISSING_POST`, `VERIFY_MISSING_LINK` (avec les liens vus à la place), `VERIFY_DELETED`, `VERIFY_DELETE_FAILED`, `VERIFY_URL_FOUND`, `VERIFY_REPUBLISH`, `VERIFY_NEEDS_ACTION` — l'URL d'article attendue est dans les détails (`expectedLink`) |
| Gestes de l'admin | `TARGET_MARKED_PUBLISHED`, `TARGET_URL_SET`, `TARGET_RETRIED`… |
| Nos profils dans les groupes | `MEMBER_APPROVED`, `MEMBER_PREAPPROVED`, `MEMBER_ACTION_FAILED`, `MEMBER_MISMATCH` |

Filtres : domaine, période (ou **dates précises**), niveau, événement, profil,
**catégorie**, **groupe**, **lien Facebook** (complet ou numéro du post),
**avec lien seulement**, incidents seulement, recherche (message, événement,
lien). Un clic sur un profil, un groupe ou un post d'une ligne filtre sur lui ;
**Tout sur cette publication** suit une publication d'un bout à l'autre ;
**Historique** ouvre sa chronologie. **Exporter (CSV)** télécharge les lignes
filtrées (5 000 au plus, lisible par Excel, liens et URL d'article inclus).

Route : `GET /admin/logs` (`groupId`, `categoryId`, `postTargetId`,
`facebookUrl`, `withUrl`, `since`, `until`…) et `GET /admin/logs/export`.
Migration : `20261003120000_log_facebook_url` (reprend les liens déjà connus).

### Les journaux par domaine

Page **Journaux** : un onglet par domaine, chacun avec son nombre d'erreurs
(rouge) ou d'avertissements (orange). L'onglet choisi borne tout : compteurs,
répartition, incidents et liste. Le domaine se déduit du type d'événement
([src/logs/domains.ts](src/logs/domains.ts)) : l'historique est rangé
d'emblée, sans migration.

| Domaine | Ce qu'on y lit | Événements |
| --- | --- | --- |
| Publication | Les automates : réservations, publications, commentaires, liens ; les gestes de la file ; ce que l'extension de publication écrit | `JOB_*`, `CLAIM_*`, `POST_*`, `COMMENT_*`, `TARGET_*`, `WORKER_*`, `GROUP_POSTS_REMOVED`, `ARTICLE_ARCHIVED` |
| Captures | Les reprises de « Capture de posts · PostFlow » (ex-FB Catch Post) : capture refusée, lecture de la source, réécriture, dépôt | `INGEST_*` (dont `INGEST_REJECTED`) |
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

## Accès à la plateforme et sécurité

La plateforme est à la racine : `https://post.pulserecipe.com/`. Les anciennes
adresses `/admin/…` redirigent (301) vers la nouvelle.

**Une adresse par rubrique** : `/` (vue d'ensemble), `/profils`, `/groupes`,
`/categories`, `/sites`, `/articles`, `/posts` (file d'attente),
`/posts/tous`, `/journaux`, `/pilotage`, `/parametres`, `/comptes`,
`/actions-en-masse`, et `/profils/<id>` pour la page d'un profil. Les boutons
Précédent / Suivant du navigateur fonctionnent, et un lien se partage.

**Connexion** sur une page à part, `/login`. Sans session, toute rubrique y
renvoie (`/login?next=/pilotage`) puis ramène à la page demandée. L'interface
elle-même (HTML, JS, CSS) n'est **jamais servie** sans session ; la
documentation de l'API (`/api/docs`) non plus.

- **Session** : un jeton aléatoire de 256 bits dans un cookie `HttpOnly`,
  `SameSite=Strict`, et `Secure` + préfixe `__Host-` en HTTPS. Aucun script
  ne peut le lire ; la base n'en garde que l'empreinte (table `sessions`).
  Elle expire après **12 h**, ou **2 h d'inactivité**.
- **Déconnexion réelle** : « Se déconnecter » révoque la session côté
  serveur. Changer le mot de passe, désactiver ou changer le rôle d'un compte
  ferme toutes ses sessions. `POST /api/auth/logout-everywhere` ferme toutes
  les siennes.
- **Essais limités** : 5 échecs en 15 min pour un identifiant depuis une même
  adresse (20 pour une adresse) bloquent 15 min ; chaque échec est ralenti ;
  le message ne dit jamais si c'est l'identifiant ou le mot de passe.
- **CSRF** : toute modification doit venir de la plateforme (Origin/Referer
  du même hôte, ou en-tête `X-Requested-With: PostFlow`), en plus de
  `SameSite=Strict`.
- **En-têtes** : CSP stricte (seuls nos scripts s'exécutent), anti-iframe
  (`X-Frame-Options: DENY`, `frame-ancestors 'none'`), `nosniff`,
  `Referrer-Policy`, HSTS en HTTPS.
- **Journal « Sécurité »** : `AUTH_LOGIN`, `AUTH_LOGIN_FAILED`,
  `AUTH_LOGIN_LOCKED`, `AUTH_LOGOUT`, `AUTH_LOGOUT_ALL`, avec l'adresse IP.

Les extensions et automates ne changent pas : ils utilisent toujours leur clé
`X-API-Key` sur `/api/…`.

Déploiement : `npx prisma migrate deploy` (`20261003150000_sessions`). Derrière
nginx, transmettre le protocole et l'adresse du client :

```nginx
proxy_set_header Host $host;
proxy_set_header X-Forwarded-Proto $scheme;
proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
```

En production, `NODE_ENV=production` force le cookie `Secure`.
`AUTH_SECRET` n'est plus utilisé.

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

## Extensions : release et archives

Les quatre extensions vivent dans `extension/` (`fb-group-poster` =
Publication, `fb-group-joiner` = Adhésion, `fb-catch-post` = Capture,
`fb-post-checker` = Modérateur). La page **🧩 Extensions** (`/extensions`)
montre pour chacune :

- la **release actuelle** — la version épinglée, sinon la plus récente ;
  téléchargeable « préconfigurée » (clé d'automatisation et clé NSTBrowser de
  l'utilisateur injectées dans le zip, à ne pas partager) ou « sans clé » ;
- les **archives** — toutes les anciennes versions, gardées pour toujours en
  base (`ExtensionRelease`, fichiers + sha256). En cas de problème, un admin
  remet une ancienne version en release avec « ↩︎ ».

Au démarrage (ou via « ↻ Relire les versions »), le serveur :

1. importe `extension/archive/index.json` (anciennes versions, avec leur date
   d'origine et leur source) ;
2. relit les dossiers `extension/*` : tout contenu nouveau devient une nouvelle
   version (un contenu déjà connu n'est jamais dupliqué).

Pour publier une nouvelle version : modifier l'extension, monter `version`
dans son `manifest.json`, déployer. L'ancienne passe d'elle-même en archive.

Pour reconstituer l'archive depuis l'historique git (et y ajouter des zips
anciens) : `node scripts/collect-extension-history.mjs [--zip <clé> <fichier.zip>]`.
Les clés (`apiKey`, `nstApiKey`) sont vidées avant d'archiver ; aucun dossier
d'extension ne doit en contenir — elles sont injectées au téléchargement.

## Capture : la description du post Facebook, mot pour mot

Les posts d'un article venu d'une capture reprennent **la légende du post
Facebook capturé** (sans son lien), jamais l'extrait WordPress. La capture est
retrouvée :

1. par `ingestRef`, quand l'article a été déposé par la réécriture ;
2. sinon par adresse : l'URL donnée dans l'extension (ou celle du dépôt) est
   celle de l'article reçu (`www`, barre finale et paramètres ignorés) ;
3. et, pour un renvoi (article retouché dans WordPress), par la capture déjà
   rattachée à l'article — la description Facebook n'est pas écrasée.

**URL d'un article de notre site** dans l'extension Capture (≥ 1.4.0) : pas de
lecture ni de réécriture. Si l'article est déjà dans la plateforme, sa
description et celle de ses posts encore à publier deviennent tout de suite
celle du post Facebook (`INGEST_CAPTION_APPLIED`) ; sinon la capture attend sa
réception (`INGEST_WAITING_ARTICLE` — le réenregistrer dans WordPress l'envoie).

Le **plugin WordPress** est sur la page 🧩 Extensions (carte « Plugin
WordPress », ZIP prêt à téléverser, anciennes versions en archives). Jamais
préconfiguré : sa clé est `WORDPRESS_API_KEY` du serveur.

## Quand WordPress ne renvoie pas l'article

Après un dépôt, c'est le plugin qui renvoie l'article (et c'est ce renvoi qui
crée l'article et ses posts). Il passe par **WP-Cron**, qui ne tourne qu'à la
visite du site : sur un site peu visité, ou avec `DISABLE_WP_CRON`, le renvoi
peut ne jamais partir. Plusieurs filets :

- le plugin **1.4.0** réveille WP-Cron dès la mise en ligne (`spawn_cron`) ;
- passé **2 min** sans renvoi, le serveur **relit l'article lui-même**
  (`INGEST_PULLED`) : route `GET dfb/v1/articles/<id>` du plugin ≥ 1.4.0
  (protégée par la clé), sinon l'API publique `wp/v2/posts`. Il le reçoit
  comme un renvoi : article, posts, description Facebook. Échec → raison au
  journal (`INGEST_ECHO_MISSING`), nouvel essai à 4, 8… min (au plus 1 h,
  10 essais) ;
- **« Relancer »** une capture déjà déposée relit l'article — elle ne le
  redépose jamais (c'était un doublon sur le site).

**Synchronisation tirée (plugin ≥ 1.4.1)** : toutes les 2 min
(`WORDPRESS_PULL_INTERVAL_MINUTES`), la plateforme appelle
`GET dfb/v1/pending` sur chaque site actif — les articles publiés que le site
n'a pas réussi à envoyer, même ceux publiés à la main —, les reçoit comme un
envoi normal (mêmes validations), puis les acquitte (`POST dfb/v1/ack`).
Journal : `WORDPRESS_PULLED`, avec la raison pour laquelle le site n'envoyait
pas. La page Sites affiche combien d'articles attendent sur le site, et
pourquoi. La réception accepte la clé globale **ou** la clé propre du site.

Côté WordPress, la colonne « Facebook » de la liste des articles dit où en est
le renvoi (« En attente », « Réponse API invalide (HTTP …) », etc.).
`ECHO_PULL_INTERVAL_MINUTES` (défaut 2, 0 = jamais) règle la relecture.

## Profil limité par Facebook : pause automatique

Message « We limit how often you can post… » (ou sa traduction) au moment de
publier : l'extension Publication (≥ 1.7.0) le signale (`blocked: true`) et
s'arrête ; la plateforme le reconnaît aussi au texte de l'erreur. Le profil
est mis en **pause** `rateLimitPauseDays` jours (5 par défaut, Pilotage →
Règles & priorités) : il ne réserve plus rien, son lot est libéré, les envois
forcés vers lui reviennent à la file, ses posts propres sont ouverts aux autres
profils de son compte. Journal `PROFILE_RATE_LIMITED` ; « ▶ Lever la pause »
dans le menu ⋯ de sa ligne (`PROFILE_PAUSE_LIFTED`).

## Pilotage → Règles & priorités

- **Groupes** (`Group.priority`) : un profil qui cherche du travail commence par
  le groupe le plus prioritaire où il peut publier (après un envoi forcé et un
  groupe où personne ne publie en ce moment).
- **Articles** (`Article.priority`) : la priorité est appliquée à tous ses posts
  encore à publier, et héritée par ceux créés ensuite (une mise à jour de
  l'article ne l'écrase pas).

## Capture en mode « actualité » : notre propre article depuis une image

Dans l'extension Capture (≥ 1.5.0), « 📰 Créer notre article » : pas de site
source, l'image suffit (`mode: 'news'`). Le serveur :

1. relève les titres d'actualité du moment (`NEWS_FEEDS`, sinon BBC monde et
   économie + Google News ; 72 h au plus, gardés 30 min) — gardés sur la
   reprise (`sourceText`) ;
2. demande à un modèle **qui lit l'image** (OpenAI ou Gemini : `*_VISION`)
   la consigne « journaliste viral » : rattacher l'image à l'actualité
   internationale / économique / sociale tirée UNIQUEMENT de ces titres (aucun
   fait inventé), 3 titres accrocheurs (le 1er devient le titre), une amorce
   pour les réseaux, un article de 300–400 mots — en anglais par défaut ;
3. dépose l'article sur le site choisi ; au retour de WordPress, les posts
   portent l'amorce générée et ses mots-clés.

Journal : `INGEST_NEWS_READ`, `INGEST_NEWS_TITLES` (les 3 titres et
l'actualité retenue).

## Capture en mode « engagement » : image traduite, sans lien

Extension Capture (≥ 1.6.0), « 💬 Engagement » : une image, une **langue**.
Chaque groupe a une langue (Pilotage → Règles & priorités). Le serveur :

1. vérifie qu'il existe des groupes actifs de cette langue dans la catégorie
   du site (avant toute dépense d'IA) ;
2. lit le texte de l'image et le traduit (modèle qui voit l'image :
   OpenAI/Gemini) ;
3. s'il y a du texte, produit une **nouvelle image** avec le texte traduit,
   par l'IA d'image choisie (Pilotage → Règles & priorités) — sinon garde
   l'image d'origine (aucun coût) ;
4. écrit une description « engagement » dans la langue (DeepSeek d'abord) ;
5. crée un post **sans lien et sans commentaire** (`noComment`) vers ces
   groupes. L'image est servie publiquement sous un jeton :
   `<PUBLIC_URL>/media/g/<jeton>.png` (`PUBLIC_URL`, défaut
   https://post.pulserecipe.com).

IA d'image (clés et modèles dans l'environnement ; jamais affichés) :

| Choix | Clé | Modèle (défaut) | Adresse (défaut) |
|---|---|---|---|
| `openai` | `OPENAI_API_KEY` | `OPENAI_IMAGE_MODEL` (gpt-image-1-mini) | — |
| `qwen` | `DASHSCOPE_API_KEY` | `QWEN_IMAGE_MODEL` (qwen-image-edit) | `DASHSCOPE_BASE_URL` (https://dashscope-intl.aliyuncs.com) |
| `seedream` | `ARK_API_KEY` | `SEEDREAM_MODEL` (seedream-4-0-250828) | `ARK_BASE_URL` (https://ark.ap-southeast.bytepluses.com) |

`auto` prend le premier configuré (ordre `IMAGE_PROVIDERS`, défaut
openai,qwen,seedream) ; un fournisseur en panne fait passer au suivant.
L'extension Publication (≥ 1.8.0) ne pose pas de premier commentaire sur ces
posts.

## Articles → Visuels : deux parcours séparés

La rubrique Articles a deux onglets : **📰 Articles** (URL, WordPress,
commentaire et lien) et **🖼 Visuels** (`/articles/visuels`) — une image seule
(`Visual`), publiée avec sa description, **sans lien ni commentaire**.

- Un visuel vient d'une capture « 💬 Engagement » (extension Capture) ou d'un
  **import** (`POST /api/visuals` : image en base64, langue, catégorie ou
  groupes, description à la main ou par l'IA, traduction du texte de l'image
  en option). Le même service (`VisualsService`) pour les deux.
- Ses posts portent `visualId` et `noComment` ; un lot de publication ne
  mélange jamais posts d'articles et visuels (vérifié sur PostgreSQL).
- Traçabilité : étiquette 🖼 Visuel dans la file, filtre « type de contenu »
  dans l'audit des publiés (`kind=article|visual|manual`).
- Taille des envois : 15 Mo (image importée en base64).

## Règles du pilotage : plafonds, heures, quotas

- **Groupe** : `dailyCap` (au plus N posts par jour, publiés + en cours),
  `hoursStart`/`hoursEnd` (on n'y publie qu'entre ces heures, plage pouvant
  passer minuit). Pilotage → Règles & priorités.
- **Profil** : `dailyQuota` (au plus N publications par jour). Pilotage →
  Réglages du profil.
- Jour et heures : fuseau de l'objectif. À la réservation, un groupe fermé ou
  plein est sauté, le lot est raboté à ce qui reste ; sinon la réponse dit
  pourquoi (`quota`, `group_limits`).

## Audit des publications (Posts → Publiés)

`GET /api/posts/published` (et `published.csv`, même filtre) : période à la
minute (`from` inclus, `to` exclu, ISO), `profileId` (le profil qui a
publié), `groupId`, `categoryId`, `verify` (`ok`, `unverified`,
`republished`, `needs_action`), `link` (`placed`, `waiting`, `missing`,
`none`), `url` (`with`, `without`), `search`. Les totaux (par profil, par
groupe, par jour et par heure dans le fuseau de l'objectif, vérification,
lien, adresse) portent sur TOUT le filtre ; la liste est paginée (50).

## Duplication des contenus

Par défaut, un post part **une seule fois** dans chaque groupe. **Posts → 🔁
Duplication** (`/posts/duplication`) règle combien de fois il y repart et
l'écart entre deux publications (« 3 fois en une semaine », « tous les 2
jours · 4 fois »…). Un post peut avoir sa propre règle (« Modifier », ou
« 🔁 Duplication » sur une sélection de la bibliothèque) ; vide = le réglage
global.

Mécanique (`RepeatService`, toutes les 5 min, `REPEAT_CHECK_INTERVAL_MINUTES`) :
une cible `PUBLISHED` dont l'écart est écoulé (compté depuis sa dernière
publication) et qui n'a pas atteint son nombre repasse `AVAILABLE`
(`repeatRound + 1`), puis suit le parcours normal — réservation, commentaire,
lien, vérification. L'adresse de la publication précédente reste dans
l'historique (trace `REPEAT_QUEUED`, journal `POST_REPEAT_QUEUED`).

## Veille du navigateur entre deux lots (extension Publication ≥ 1.5.0)

Option « Fermer le navigateur entre deux lots » (options de l'extension, ou
**Pilotage → Réglages → 💤** pour la pousser à un profil). Quand la prochaine
publication est à plus de N minutes (15 par défaut, 5 au minimum), l'extension :

1. annonce au serveur « en veille jusqu'à HH:MM » (heure de reprise − 3 min)
   dans son battement, et exige l'accusé (`sleepUntil` dans la réponse) ;
2. demande à NSTBrowser (`DELETE localhost:8848/api/v2/browsers/<profil>`) de
   fermer son profil.

Le plan de l'agent local (`GET /api/control/launcher`) garde `shouldRun: false`
jusqu'à cette heure, puis l'agent (`python -m app.launcher`) rouvre le
navigateur ; l'extension reprend son état stocké (lot en cours compris). Sans
agent local, rien ne rouvre : l'option est donc désactivée par défaut. Jamais
pendant une publication, un commentaire ou la pose des liens.

## Extension Adhésion (≥ 1.5.0) : un onglet par groupe, fermé ensuite

Chaque groupe est traité dans un onglet fermé dès la fin, réussite ou échec.
Les onglets ouverts sont notés en stockage : si Chrome arrête le service worker
en route, le réveil suivant ferme l'onglet oublié et remet le groupe en
attente. Une page qui ne répond plus est abandonnée au bout de 60 s.

## Sécurité

Les routes sont déjà protégées par deux clés distinctes : `AdminAuthGuard`
(session admin) sur `/api/admin/*`, `/api/profiles`, `/api/groups` et
`/api/posts`, et `AutomationAuthGuard` (en-tête `X-API-Key`, comparaison à
temps constant) sur `/api/jobs/*` et `/api/logs`.

Renseigner `AUTOMATION_API_KEY` et `ADMIN_PASSWORD` dans `.env` (`AUTH_SECRET` n'est plus utilisé : les sessions sont en base).
Les secrets ne doivent jamais être enregistrés en base ou transmis dans les
logs.

## Reprise d’une publication Facebook

Une reprise part d’un post Facebook et de la page qui en porte le contenu.
L’API lit la page, en fait réécrire un article, le dépose sur WordPress, et le
retour du plugin fabrique le nouveau post — image d’origine, texte réécrit,
lien vers le nouvel article.

```bash
# 0. Ouvrir une session (cookie HttpOnly gardé dans cookies.txt). Les routes
#    /api/admin/… n'acceptent plus de jeton Bearer : une session, et
#    l'en-tête X-Requested-With pour ce qui modifie.
curl -c cookies.txt -X POST "$API_BASE/auth/login" -H 'Content-Type: application/json' \
  -H 'X-Requested-With: PostFlow' -d '{"username":"admin","password":"…"}'
AUTH=(-b cookies.txt -H 'X-Requested-With: PostFlow')

# 1. Enregistrer la reprise. `siteUrl` est facultatif : défaut WORDPRESS_SITE_URL.
curl -X POST "$API_BASE/admin/ingest" "${AUTH[@]}" \
  -H 'Content-Type: application/json' -d '{
    "facebookUrl": "https://www.facebook.com/exemple/posts/123",
    "sourceUrl": "https://exemple.com/article",
    "language": "fr"
  }'

# 2. La collecte. En temps normal l’extension s’en charge (voir plus bas) ;
#    à la main, la réponse attend la suite du traitement : compter une minute.
curl -X POST "$API_BASE/admin/ingest/$ID/scrape-result" "${AUTH[@]}" \
  -H 'Content-Type: application/json' \
  -d '{"caption": "Texte du post d’origine", "imageUrl": "https://.../image.jpg"}'

# 3. Suivre, et relancer ce qui a échoué.
curl "$API_BASE/admin/ingest/$ID" "${AUTH[@]}"
curl -X POST "$API_BASE/admin/ingest/$ID/retry" "${AUTH[@]}"
```

`profileIds` et `groupIds` restreignent la diffusion ; laissés vides, la
reprise s’adresse à tous les profils actifs et à leurs groupes.

### Un article source en plusieurs pages

Beaucoup de sites coupent leurs articles en « page suivante ». La plateforme
lit donc **toutes les pages** de l'article avant de le donner au modèle :

- elle suit les liens de pagination de l'article : `/article/2/`,
  `/article/page/2`, `?page=2`, `article-page-2.html`, les liens numérotés de
  WordPress (`.page-links`), et les libellés « Next page », « Page suivante »,
  « Página siguiente », « الصفحة التالية »… ;
- elle ne suit **jamais** « article suivant » / « Next post » : seule une page
  du même article compte ;
- au plus 20 pages et 60 000 caractères ; elle s'arrête sur une page déjà lue,
  une page identique (site qui renvoie toujours la page 1) ou une page
  illisible, en gardant ce qui a été lu ;
- le modèle reçoit jusqu'à 40 000 caractères de cet article (au lieu de 12 000).

Le journal `INGEST_SOURCE_READ` (domaine Captures) dit combien de pages ont été
lues, avec leurs adresses.

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
