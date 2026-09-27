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

`profileIds` dans `config.js` limite la diffusion. **Laissé vide, tous les
profils actifs reçoivent un post**, et l'automate les publiera dans leurs
groupes. Le renseigner pour n'en viser qu'un.

## Utilisation

Ouvrir **la publication elle-même** — un clic sur sa date — plutôt que de
rester dans le fil : la page ne contient alors qu'un post, et il n'y a pas
d'ambiguïté. Dans un fil, l'extension prend celui qui est au centre de
l'écran et le dit ; le texte relevé s'affiche, corrigible avant l'envoi.

Le bouton ne s'active qu'avec un texte d'au moins 15 caractères et une URL
source valide.

## Ce qui part, et ce qui change

| | |
| --- | --- |
| Texte du post | **inchangé**, tel qu'il est relevé |
| Image | **inchangée**, réhébergée sur le site WordPress |
| Article | **réécrit** à partir de l'URL source |
| Lien | celui du **nouvel** article, placé en commentaire |

La seule retouche du texte est faite côté serveur : l'URL qu'il contenait
éventuellement est retirée, car elle renverrait vers le site repris.

## Ce sur quoi l'extension ne s'appuie pas

Facebook renomme ses classes à chaque déploiement. Le texte est donc cherché
sur `data-ad-preview="message"` et ses équivalents, que Facebook garde depuis
des années, avec l'`og:description` en dernier recours. L'image est choisie
**sur sa taille à l'écran** : un avatar, une réaction ou une icône sont
petits, la pièce jointe ne l'est pas. Ça survit à un changement de balisage
qu'aucun sélecteur ne suivrait.

Les textes longs sont dépliés (« Voir plus ») avant lecture, sans quoi la fin
n'est tout simplement pas dans la page.

## Vérifications

```sh
node extension/fb-catch-post/tests/capture-test.js
```

Le test joue la lecture contre une page qui imite la structure de Facebook :
bon article choisi parmi les commentaires, photo retenue plutôt que l'avatar,
permalink nettoyé, « Voir plus » déplié, mur de connexion signalé. C'est un
double — **une vérification sur une vraie publication reste nécessaire**.

## Quand ça ne marche pas

| Message | Ce qu'il faut faire |
| --- | --- |
| « Ouvrez d'abord la publication Facebook » | L'onglet actif n'est pas sur facebook.com |
| « Aucun texte trouvé » | Ouvrir la publication elle-même, pas le fil |
| « Facebook n'a pas montré la publication » | Ce compte ne voit pas ce contenu |
| « Serveur injoignable » | `apiBase` dans `config.js`, ou l'API est arrêtée |
| « Refusé (HTTP 401) » | `apiKey` ne correspond pas à `AUTOMATION_API_KEY` |

Après l'envoi, l'avancement se suit sur `/api/admin/ingest/:id`. Une reprise
qui s'arrête le dit dans `lastError`.
