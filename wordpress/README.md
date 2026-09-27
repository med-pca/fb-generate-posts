# WordPress → Data FB Posting

## Installation

1. Configurer une clé aléatoire dédiée dans l’environnement du serveur : `WORDPRESS_API_KEY`. Elle est différente de `AUTOMATION_API_KEY` et ne donne accès qu’à la réception WordPress.
2. Construire et redémarrer l’API avec cette version (`npm run build`, puis le mécanisme de déploiement habituel). Aucune migration supplémentaire ni dépendance n’est nécessaire.
3. Dans WordPress : **Extensions → Ajouter une extension → Téléverser**, sélectionner `data-fb-posting.zip`, installer et activer.
4. Dans **Réglages → Data FB Posting**, renseigner l’URL complète `https://VOTRE-API/api/wordpress/articles` et la même clé `WORDPRESS_API_KEY`.
5. Publier un nouvel article public, avec une image à la une si souhaité. La colonne **Facebook** dans la liste des articles indique « En attente », « Mise à jour en attente », une erreur explicite ou « Transmis ».
6. Vérifier dans Data FB Posting l’article importé et les posts associés aux profils actifs. Les groupes actifs associés à chaque profil deviennent les destinataires.
7. Modifier ensuite l’article (titre, contenu, extrait, image à la une, lien ou date) : après le passage de WP-Cron, l’article et les posts pas encore publiés reprennent la nouvelle version.

Mise à jour depuis une version antérieure : remplacer l’extension par le nouveau ZIP. Les articles déjà transmis sont repris automatiquement à leur première modification, sans renvoi inutile. La 1.2.0 n’ajoute aucun réglage : la route entrante utilise la clé déjà enregistrée.

Le site WordPress, ses liens d’article et d’image, ainsi que l’API doivent utiliser HTTPS. Le serveur API doit être accessible depuis l’hébergement WordPress. WordPress 5.6+ et PHP 7.4+ requis.

## Réception des articles réécrits (1.2.0)

La 1.2.0 ouvre une route entrante, `POST /wp-json/dfb/v1/articles`, par laquelle l’API dépose les articles qu’elle a fait réécrire à partir d’une publication Facebook. Elle est protégée par la **même clé** que les envois sortants, comparée en temps constant ; sans clé enregistrée, la route reste fermée.

- Corps attendu : `title`, `contentHtml` (obligatoires), puis `slug`, `excerpt`, `ingestRef`, et `image` (`{data, mimeType, filename}`, base64, 10 Mo maximum, JPEG/PNG/WebP/GIF). Le corps passe par `wp_kses_post`, le titre et l’extrait par `sanitize_text_field`.
- **Publication en deux temps** : l’article est d’abord créé en brouillon, le temps de poser la référence de reprise et l’image à la une, puis mis en ligne. C’est la mise en ligne qui déclenche l’envoi vers l’API, et il doit porter ces deux éléments — les poser après aurait produit un premier envoi incomplet.
- Réponse : `{postId, permalink, imageWarning}`. `imageWarning` non nul signifie que l’article est publié mais sans image : ce n’est pas un échec.
- Le renvoi vers l’API porte alors `ingestRef`, qui rattache l’article à sa reprise. **Ce champ n’est ajouté qu’aux articles qui en ont un** : l’ajouter partout changerait l’empreinte de tous les articles déjà suivis et provoquerait un renvoi du catalogue entier à la première sauvegarde.
- Seuls des articles standards (`post`) sont créés, avec l’auteur par défaut de `wp_insert_post`.
- **Coupures de page** : l’API dépose un corps déjà découpé sur `<!--nextpage-->`, ce qui fait lire l’article en plusieurs pages. Le filtrage s’applique page par page, puis recolle : passer le corps entier à `wp_kses_post` reviendrait à parier sur son traitement des commentaires (depuis la 1.3.0).
- Les données sont passées **échappées** à `wp_insert_post`, qui leur applique `wp_unslash`. Sans cela, tout antislash du contenu disparaît : un `\n` écrit en toutes lettres par le modèle ressortait en « n » isolé au milieu de l’article (corrigé en 1.2.3).
- **Sites dont l’API REST est fermée** (réponse `rest_login_required`) : beaucoup d’extensions de sécurité verrouillent l’API REST pour les visiteurs non connectés, et ce verrou s’applique *avant* le `permission_callback` de chaque route. Depuis la 1.2.1, l’extension rouvre **sa seule route**, et seulement quand la clé présentée est déjà la bonne ; tout le reste de l’API REST demeure fermé. Rien à configurer.

## Fonctionnement

- Première publication d’un article standard (`post`), immédiate ou programmée. Brouillons, pages, révisions, articles privés et protégés par mot de passe sont exclus.
- L’envoi est mis en file via WP-Cron pour ne pas bloquer l’éditeur. Il démarre lorsque WordPress exécute sa prochaine tâche cron. Pour les sites peu visités, configurer l’hébergeur pour appeler régulièrement `wp-cron.php`.
- Le titre, le contenu en texte brut (100 000 caractères maximum), l’extrait, le lien, l’image à la une et la date sont les seuls champs suivis : eux seuls déclenchent un envoi. Modifier les catégories, les étiquettes ou les réglages SEO ne change rien. Aucun import rétroactif des anciens articles : un article publié avant l’installation n’entre dans le suivi qu’en repassant par une mise en ligne.
- Synchronisation : chaque modification enregistrée repart vers l’API, qui réaligne la fiche de l’article puis le titre, le descriptif et l’image des posts déjà créés. Une modification enregistrée pendant un envoi est retransmise juste après ; une réception identique à ce qui est déjà en base ne touche rien.
- Ce que la synchronisation ne réécrit jamais : un post réservé par un job en cours (l’automate est en train de le publier avec son texte actuel), un post dont toutes les cibles sont déjà consommées ou publiées (c’est l’archive de ce qui est parti sur Facebook), et un post archivé. Le profil, le délai, les groupes destinataires et l’avancement des publications restent intacts. Ce qui a déjà été publié sur Facebook n’est pas modifié : seules les publications à venir reprennent la nouvelle version.
- La réponse de l’API indique `updated` (la fiche a changé), `synchronized` (posts réalignés) et `skipped` (posts laissés tels quels).
- Un post initial par profil actif. Le descriptif reprend au maximum 280 caractères de l’extrait WordPress ou du contenu, suivis de « 📖 Read more on our website 👉 Link in the comments 👇 ». Cette version utilise un extrait automatique, sans appel IA ni coût de génération externe.
- Le lien reste dans le champ `url` du post : le flux existant de `fb-lyazidi` le place dans le commentaire. Sans image à la une, le mécanisme existant d’image par défaut du profil reste applicable.
- Identifiant d’article stable : URL du site et `wordpress:ID`. Les répétitions sont ignorées, y compris après une réponse réseau perdue. Import et création des posts sont transactionnels et protégés contre les réceptions simultanées.
- En cas d’échec, nouvelle tentative après 1, 2, 4, 8, 16, 32 minutes puis chaque heure. Après correction d’une configuration, attendre la prochaine tentative (ou lancer les événements WP-Cron dus).
- Un profil sans groupe actif reçoit un post sans destinataire. Sans profil actif, seul l’article est importé. Le réapprovisionnement existant continue de fonctionner et peut produire ses variantes habituelles ; un nouvel envoi WordPress ne relance pas la génération.
- Le statut « Transmis » signifie que l’API a reçu l’article, pas que Facebook l’a publié.

## Diagnostiquer un refus

Le verrou REST d'un site rend toujours la même réponse, quelle qu'en soit la
raison. Depuis la 1.2.4, l'extension répond à sa place sur ses propres
routes, en nommant la cause et la version qui a répondu :

```sh
curl -X POST "https://VOTRE-SITE/wp-json/dfb/v1/articles" \
  -H "x-api-key: VOTRE_CLE" -H 'Content-Type: application/json' -d '{}'
```

| Code rendu | Ce que ça veut dire |
| --- | --- |
| `dfb_incomplete` | Tout va bien : la clé passe, il manquait juste le contenu |
| `dfb_bad_key` | L'extension tourne, mais la clé enregistrée est différente |
| `dfb_no_key` | Aucune clé dans Réglages > Data FB Posting |
| `dfb_no_header` | L'appelant n'envoie pas d'en-tête `x-api-key` |
| `rest_login_required` | **L'extension n'a pas eu la parole** : désactivée, ou un filtre du site passe après elle |

Les quatre premiers portent la version dans `data.version` : c'est la preuve
de quel code a répondu.

## Vérifications

```sh
npm run build
npx jest --runInBand --runTestsByPath src/wordpress/wordpress.service.spec.ts src/wordpress/wordpress.guard.spec.ts src/ingest/wordpress-writer.service.spec.ts
php -l wordpress/data-fb-posting/data-fb-posting.php
php wordpress/tests/plugin-test.php
```

Les tests PHP utilisent un double de l’API WordPress ; une validation finale sur un vrai site WordPress reste nécessaire. La suite Jest historique contient un test `app.controller.spec.ts` « Hello World » déjà en échec avant cette modification (PrismaService non fourni).

Références WordPress : [hook après enregistrement et métadonnées](https://developer.wordpress.org/reference/hooks/wp_after_insert_post/), [planification et dépendance aux visites](https://developer.wordpress.org/reference/functions/wp_schedule_single_event/).
