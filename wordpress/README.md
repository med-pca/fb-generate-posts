# WordPress → Data FB Posting

## Installation

1. Configurer une clé aléatoire dédiée dans l’environnement du serveur : `WORDPRESS_API_KEY`. Elle est différente de `AUTOMATION_API_KEY` et ne donne accès qu’à la réception WordPress.
2. Construire et redémarrer l’API avec cette version (`npm run build`, puis le mécanisme de déploiement habituel). Aucune migration supplémentaire ni dépendance n’est nécessaire.
3. Dans WordPress : **Extensions → Ajouter une extension → Téléverser**, sélectionner `data-fb-posting.zip`, installer et activer.
4. Dans **Réglages → Data FB Posting**, renseigner l’URL complète `https://VOTRE-API/api/wordpress/articles` et la même clé `WORDPRESS_API_KEY`.
5. Publier un nouvel article public, avec une image à la une si souhaité. La colonne **Facebook** dans la liste des articles indique « En attente », une erreur explicite ou « Transmis ».
6. Vérifier dans Data FB Posting l’article importé et les posts associés aux profils actifs. Les groupes actifs associés à chaque profil deviennent les destinataires.

Le site WordPress, ses liens d’article et d’image, ainsi que l’API doivent utiliser HTTPS. Le serveur API doit être accessible depuis l’hébergement WordPress. WordPress 5.6+ et PHP 7.4+ requis.

## Fonctionnement

- Première publication d’un article standard (`post`), immédiate ou programmée. Brouillons, pages, révisions, articles privés et protégés par mot de passe sont exclus.
- L’envoi est mis en file via WP-Cron pour ne pas bloquer l’éditeur. Il démarre lorsque WordPress exécute sa prochaine tâche cron. Pour les sites peu visités, configurer l’hébergeur pour appeler régulièrement `wp-cron.php`.
- Le titre, le contenu en texte brut (100 000 caractères maximum), l’extrait, le lien, l’image à la une et la date sont figés à la publication. Aucune synchronisation des modifications ultérieures, aucun import rétroactif des anciens articles.
- Un post initial par profil actif. Le descriptif reprend au maximum 280 caractères de l’extrait WordPress ou du contenu, avec « Lire la suite sur le site : lien en commentaire 👇 ». Cette version utilise un extrait automatique, sans appel IA ni coût de génération externe.
- Le lien reste dans le champ `url` du post : le flux existant de `fb-lyazidi` le place dans le commentaire. Sans image à la une, le mécanisme existant d’image par défaut du profil reste applicable.
- Identifiant d’article stable : URL du site et `wordpress:ID`. Les répétitions sont ignorées, y compris après une réponse réseau perdue. Import et création des posts sont transactionnels et protégés contre les réceptions simultanées.
- En cas d’échec, nouvelle tentative après 1, 2, 4, 8, 16, 32 minutes puis chaque heure. Après correction d’une configuration, attendre la prochaine tentative (ou lancer les événements WP-Cron dus).
- Un profil sans groupe actif reçoit un post sans destinataire. Sans profil actif, seul l’article est importé. Le réapprovisionnement existant continue de fonctionner et peut produire ses variantes habituelles ; un nouvel envoi WordPress ne relance pas la génération.
- Le statut « Transmis » signifie que l’API a reçu l’article, pas que Facebook l’a publié.

## Vérifications

```sh
npm run build
npx jest --runInBand --runTestsByPath src/wordpress/wordpress.service.spec.ts src/wordpress/wordpress.guard.spec.ts
php -l wordpress/data-fb-posting/data-fb-posting.php
php wordpress/tests/plugin-test.php
```

Les tests PHP utilisent un double de l’API WordPress ; une validation finale sur un vrai site WordPress reste nécessaire. La suite Jest historique contient un test `app.controller.spec.ts` « Hello World » déjà en échec avant cette modification (PrismaService non fourni).

Références WordPress : [hook après enregistrement et métadonnées](https://developer.wordpress.org/reference/hooks/wp_after_insert_post/), [planification et dépendance aux visites](https://developer.wordpress.org/reference/functions/wp_schedule_single_event/).
