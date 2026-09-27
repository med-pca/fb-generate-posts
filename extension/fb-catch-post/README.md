# FB Catch Post

Vous êtes devant une publication Facebook qui marche. Un clic, vous collez
l'adresse d'un article à réécrire, et le serveur s'occupe du reste : il
réécrit l'article, le publie sur WordPress, et prépare le même post — même
image, même texte — avec la nouvelle adresse.

```
[publication Facebook ouverte]  →  clic sur l'extension
        ↓ elle lit l'image et le texte de la page
[popup] vous vérifiez le texte, vous collez l'URL de l'article source
        ↓ POST /api/jobs/scrape/capture
serveur : lit la source → réécrit → dépose sur WordPress
        → renvoi du plugin → nouveau post prêt à publier
```

## Installation

1. Ouvrir `config.js` et remplacer `apiKey` par la valeur de
   `AUTOMATION_API_KEY` du serveur — la même que l'extension d'adhésion aux
   groupes. Ajuster `apiBase` si l'API n'est pas sur `post.pulserecipe.com`.
2. Chrome (ou Nstbrowser) → `chrome://extensions` → **Mode développeur** →
   **Charger l'extension non empaquetée** → choisir ce dossier.
3. Épingler l'extension pour l'avoir sous la main.

Le **site de destination** n’est pas dans `config.js` : les sites se
déclarent dans la plateforme, section **Sites**, et l’extension y lit la
liste. Le popup en fait un menu déroulant, et retient votre dernier choix.
Un site ajouté là-bas apparaît ici sans rien réinstaller.

`profileIds` dans `config.js` limite la diffusion. **Laissé vide, tous les
profils actifs reçoivent un post**, et l'automate les publiera dans leurs
groupes. Le renseigner pour n'en viser qu'un.

## Utilisation

Cliquer sur l'extension depuis l'onglet Facebook. **Elle ne devine pas** la
publication que vous visez : elle liste ce qu'elle trouve, avec un aperçu de
chacune, et vous choisissez.

Deux structures très différentes, toutes deux prises en charge :

| Vous êtes sur… | Ce que le popup propose |
| --- | --- |
| un fil ou une permalink de post | les publications de la page ; une seule → prise directement |
| une **page photo** (`/photo/?fbid=…`) | les textes de la page — choisissez la légende |

La page photo est celle qu'on obtient en cliquant sur l'image d'un post.
Facebook n'y marque pas la légende : impossible de la reconnaître à coup
sûr, donc le popup liste les textes et vous désignez le bon. L'image, elle,
est la grande photo de la visionneuse.

Le texte relevé s'affiche ensuite, corrigible avant l'envoi. Le bouton ne
s'active qu'avec un texte d'au moins 15 caractères et une URL source valide.

Une version précédente s'appuyait sur `role="article"` et prenait la
publication la plus proche du centre de l'écran. Beaucoup de pages Facebook
ne posent pas cet attribut : elle retombait alors sur la page entière et
rendait le **premier** texte trouvé, donc le mauvais post. L'ancrage se fait
désormais sur le texte de la publication, d'où on remonte jusqu'au
conteneur qui porte son lien ou sa grande image.

## Ce qui part, et ce qui change

| | |
| --- | --- |
| Texte du post | **inchangé**, tel qu'il est relevé |
| Image | **inchangée**, réhébergée sur le site WordPress |
| Article | **réécrit** à partir de l'URL source, dans la langue de celle-ci |
| Lien | celui du **nouvel** article, placé en commentaire |

La seule retouche du texte est faite côté serveur : l'URL qu'il contenait
éventuellement est retirée, car elle renverrait vers le site repris.

`language: 'auto'` dans `config.js` garde la langue de la page source. Une
langue imposée ferait traduire l'article au passage. Et la réécriture suit
la source pas à pas — mêmes informations, même ordre, mots neufs : ce n'est
pas un nouvel article sur le même thème.

## Ce sur quoi l'extension ne s'appuie pas

Facebook renomme ses classes à chaque déploiement. Le texte est donc cherché
sur `data-ad-preview="message"` et ses équivalents, que Facebook garde depuis
des années, avec l'`og:description` en dernier recours. L'image est choisie
**sur sa taille à l'écran** : un avatar, une réaction ou une icône sont
petits, la pièce jointe ne l'est pas. Ça survit à un changement de balisage
qu'aucun sélecteur ne suivrait.

Les textes longs sont dépliés (« Voir plus ») avant lecture, sans quoi la fin
n'est tout simplement pas dans la page — et uniquement dans la publication
choisie, pour ne pas toucher aux autres.

## Vérifications

```sh
node extension/fb-catch-post/tests/capture-test.js
```

Le test joue l'énumération et la lecture contre une page à deux publications
imitant la structure de Facebook : chacune rend **son** texte et **son**
image, les commentaires ne sont jamais listés, la photo est retenue plutôt
que l'avatar, « Voir plus » n'est déplié que dans la publication choisie, le
mur de connexion est signalé. C'est un double — **une vérification sur une
vraie publication reste nécessaire**.

## Quand ça ne marche pas

| Message | Ce qu'il faut faire |
| --- | --- |
| « Ouvrez d'abord la publication Facebook » | L'onglet actif n'est pas sur facebook.com |
| « Aucune publication lisible » | Le détail affiché dit ce que la page contenait ; faire défiler jusqu'à la publication puis rouvrir |
| « Facebook n'a pas montré la publication » | Ce compte ne voit pas ce contenu |
| « Serveur injoignable » | `apiBase` dans `config.js`, ou l'API est arrêtée |
| « Refusé (HTTP 401) » | `apiKey` ne correspond pas à `AUTOMATION_API_KEY` |
| « aucun site déclaré » | Ajouter le site dans la plateforme, section Sites |
| « Site inconnu » | Le site choisi n'est plus déclaré ou a été désactivé |

Après l'envoi, le popup affiche l'identifiant de la reprise. L'avancement se
lit sur `GET /api/admin/ingest/<id>` (session admin) : `lastError` dit ce qui
bloque, et `status` où on en est.

**`AWAITING_ECHO` n'est pas une erreur** : l'article est publié sur
WordPress, mais le site ne l'a pas encore renvoyé à l'API — c'est WP-Cron,
qui ne tourne que lorsqu'une page du site est visitée. Tant que ce renvoi
n'est pas arrivé, aucun post Facebook n'est fabriqué. Sur un site peu
visité, faire appeler `wp-cron.php` régulièrement par l'hébergeur.
