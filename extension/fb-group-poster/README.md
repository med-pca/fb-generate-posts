# « Publication · PostFlow » (ex-FB Group Poster) — extension navigateur

Le même parcours que le worker Python (`app/`), mais dans le navigateur : plus de
Python à lancer, plus d'API locale NSTBrowser, plus de CDP.

```
reserver un lot -> pour chaque post :
    publier -> premier commentaire -> lire son ID -> l'API renvoie l'URL
    -> modifier ce commentaire avec l'URL -> attendre -> post suivant
-> cloturer le job -> rattraper les commentaires restes sans URL -> recommencer
```

Le lot réservé ne porte jamais l'URL : le post sort sans lien. C'est la réponse
à `commented` qui la renvoie, une fois le commentaire en ligne, et l'extension
modifie ce commentaire aussitôt, avant de passer au post suivant. Un échec à
cette étape n'arrête pas le lot : à la clôture, `/jobs/{jobId}/link-updates`
rend ce qui attend encore, et l'extension le retente.

Le premier commentaire est un simple « . » (réglage `firstCommentText`, vide =
la description) : c'est une place réservée pour l'URL, pas un texte à répéter.
Une fois l'URL tapée dans le commentaire, l'extension attend que Facebook ait
chargé l'aperçu du site (son image) avant d'enregistrer, puis reste le temps
que l'aperçu s'affiche dans le commentaire enregistré — au moins
`linkPreviewMinSeconds` (1 s), au plus `linkPreviewWaitSeconds` (3 s). Un site
sans aperçu n'est pas une erreur : le journal le signale et l'édition continue.

Il faut pour cela la version de l'API où `commented` renvoie `url` et où
`link-updated` est accepté avant la clôture. Avec une API plus ancienne, le
journal le dit (« L'API n'a pas renvoye l'URL ») et les liens sont posés à la
clôture, comme avant.

Cette modification passe par `chrome.debugger` (permission `debugger`) : Facebook
ignore les clics et l'Entrée simulés en JavaScript sur un commentaire, il faut
une saisie « de confiance », la même que le CDP du Python. Pendant la pose des
liens, Chrome affiche donc le bandeau « « Publication · PostFlow » (ex-FB Group Poster) a commencé à déboguer ce
navigateur » ; il disparaît à la fin du passage. Ne pas cliquer « Annuler » dans
ce bandeau : cela interrompt la modification en cours.

Le savoir-faire n'a pas été réécrit : les sélecteurs que
[`app/facebook/composer.py`](../app/facebook/composer.py) injectait dans la page
sont déjà du JavaScript, et ce sont eux qui tournent ici
([`src/content/helpers.js`](src/content/helpers.js)).

## Ce qui remplace quoi

| Python | Extension |
| --- | --- |
| `app/nstbrowser/client.py` (démarrer/arrêter un profil) | [`app/launcher.py`](../app/launcher.py), le seul Python restant : il ouvre les navigateurs sur ordre de l'admin |
| `app/browser/cdp.py` (websocket CDP) | [`src/background/tab.js`](src/background/tab.js) + [`src/content/interact.js`](src/content/interact.js) |
| `app/facebook/composer.py` (sélecteurs + étapes) | [`src/content/helpers.js`](src/content/helpers.js) + [`steps.js`](src/content/steps.js) |
| `app/facebook/publisher.py` (l'enchaînement) | [`src/background/publish.js`](src/background/publish.js) |
| `app/scheduler.py` / `app/worker.py` (la boucle) | [`src/background/orchestrator.js`](src/background/orchestrator.js) + [`control.js`](src/background/control.js) |
| `app/links.py` (pose des liens) | [`src/background/links.js`](src/background/links.js) |
| `app/jobs/client.py` (API data-fb-posting) | [`src/background/api.js`](src/background/api.js) |
| `app/web.py` (panneau sur `localhost:8765`) | le popup, et l'admin → **Pilotage** |
| `app/config.py` + `.env` | la page d'options |

## 1. Installer

### Dans NSTBrowser (le cas normal)

NSTBrowser installe une extension pour **tous les profils d'un groupe**, à partir
d'un `.zip`. C'est ce qui évite de la déposer profil par profil.

```bash
cd extension
npm run pack        # produit ../dist/fb-group-poster.zip
```

Puis, dans le client NSTBrowser :

1. Vérifier **Agent Connected** en haut à droite (sans cela, le bouton d'upload
   ne fait rien).
2. Aller dans la gestion des extensions → **Upload Extension**.
3. Choisir `dist/fb-group-poster.zip`. NSTBrowser lit le `manifest.json` et
   affiche le nom et la version — si rien ne s'affiche, c'est que le zip a été
   fait depuis le dossier parent : le `manifest.json` doit être **à la racine du
   zip**, ce que `npm run pack` garantit.
4. Aller dans **Group management** → créer ou ouvrir un groupe → **Add system
   plug-in** → cocher l'extension.
5. Rattacher les profils à ce groupe. L'extension est téléchargée et chargée à
   **chaque lancement** du profil.

Pour la mettre à jour : `npm run pack` puis ré-uploader le zip. Les profils
prennent la nouvelle version à leur prochain lancement.

Sources : [Extension | Nstbrowser](https://docs.nstbrowser.io/guide/advanced/extension.html),
[Group Management](https://docs.nstbrowser.io/guide/advanced/group.html).

### Dans un Chrome ordinaire (pour mettre au point)

1. Ouvrir `chrome://extensions`, activer **Mode développeur**.
2. **Charger l'extension non empaquetée** → choisir ce dossier `extension/`.

Chrome, Brave, Edge : tout Chromium l'accepte. Depuis Chrome 137, une extension
non empaquetée n'est chargée **que** si le mode développeur du profil est actif —
c'est la panne la plus fréquente à ce stade.

### Une fois posée : dire à chaque navigateur qui il est

Le zip est le même partout ; ce qui distingue un profil d'un autre, c'est le
**code d'appairage** collé dans son extension (section suivante). L'extension ne
peut pas le deviner : rien dans la page ne dit dans quel profil NSTBrowser elle
tourne.

Tout le reste — marche/arrêt, horaires, rythme — vient ensuite de l'admin, sans
rien toucher dans le navigateur.

## 2. Appairer — un code, rien d'autre

Dans l'admin : **Pilotage** → la ligne du profil → **Appairer**. Un code de huit
caractères s'affiche. Dans le navigateur de ce profil : icône de l'extension →
**Options** → coller le code → **Connecter**.

C'est tout. Le code porte l'identité du profil, donc il apprend au navigateur
les trois choses qu'il fallait saisir à la main :

| Ce que le code apporte | Avant |
| --- | --- |
| l'adresse de l'API | à retaper dans chaque navigateur |
| une clé d'automatisation | 64 caractères à recopier, et à faire circuler |
| lequel des profils il est | à choisir dans une liste, donc à confondre |

Le code vaut **15 minutes** et ne sert qu'**une fois** : un navigateur appairé
n'a plus besoin de lui, et un code qui traîne ne donne plus rien. Les tentatives
sont comptées par adresse, donc il ne se force pas. Émettre un nouveau code
annule le précédent ; le coller dans un autre navigateur rattache ce profil à
celui-là.

La clé remise est celle du **propriétaire** du profil quand il en a un : elle ne
voit que son périmètre et se révoque sans couper les autres comptes. À défaut,
c'est la clé globale.

Les **Réglages avancés** de la page d'options gardent les trois champs à la main,
pour un serveur de test ou si l'appairage n'est pas disponible. En usage normal,
on n'y touche pas.

## 3. Pilotage depuis post.pulserecipe.com

Par défaut, ce navigateur **obéit à l'admin**. Chaque minute il demande
« est-ce mon tour ? » et, dans le même aller-retour, rapporte où il en est :

```
extension ──POST /api/control/profile/{externalId}/heartbeat──> API
   état (en marche, étape, compteurs, dernier message)
                                  <── ordre (publier / arrêt), raison, réglages
```

Le sens n'est pas un choix de confort : un navigateur n'a pas d'adresse
joignable depuis un serveur, donc c'est lui qui revient demander. Conséquence
utile : un ordre donné dans l'admin est pris en compte en **moins d'une
minute**, et une API injoignable ne change rien — l'extension continue ce
qu'elle faisait plutôt que de s'arrêter sur un incident réseau.

Dans l'admin (**Pilotage**) chaque profil a :

| Réglage | Effet |
| --- | --- |
| **Arrêté** | l'extension s'arrête après l'étape en cours |
| **Auto** | elle publie dans sa fenêtre horaire, au fuseau du profil |
| **Marche forcée** | elle publie tout de suite, fenêtre ignorée |
| Fenêtre + jours | ex. 09:00–18:00, lundi-vendredi, `Europe/Paris` |
| Réglages poussés | JSON envoyé à l'extension (rythme, groupe imposé, plafond…) |
| **Publication autorisée** | le coupe-circuit global, au-dessus de tout |

Ce que l'admin ne peut **jamais** pousser : l'adresse de l'API, sa clé et
l'identifiant de profil. Ce sont eux qui font que ce navigateur est bien
celui-là ; un serveur qui pourrait les changer pourrait détourner le profil.
L'extension refuse ces clés et l'écrit dans son journal.

Un plafond (`maxPostsPerRun`) vaut **par ordre de marche**, pas par minute :
la boucle s'arrête à ce nombre de posts et y reste. Repasser le profil par
**Arrêté** dans l'admin est ce qui donne un ordre neuf, et remet le compteur à
zéro. Sans cette règle, le battement suivant relancerait la boucle et le
plafond ne plafonnerait rien.

Pour couper le pilotage sur un navigateur donné : décocher « Obéir à
post.pulserecipe.com » dans ses options. Il ne répond alors plus qu'aux boutons
du popup.

## 4. Piloter à la main

Le popup reste le panneau de contrôle, utile pour mettre au point et pour
comprendre ce qui se passe :

- **Démarrer** — la boucle tourne jusqu'à l'arrêt : réserver, publier, commenter,
  clôturer, poser les liens, attendre, recommencer.
- **Un seul lot** — une réservation traitée puis arrêt (le premier essai à faire).
  Un lot peut contenir plusieurs posts : pour n'en publier qu'un, régler l'API sur
  un post par job.
- **Arrêter** — s'arrête après l'étape en cours ; une attente entre deux posts est
  interrompue aussitôt.
- **Poser les liens** — l'action manuelle de `python -m app.links` : tous les
  commentaires de ce profil qui attendent encore leur lien, quel que soit le job.
  Volontairement manuelle : la file peut contenir de vieilles entrées.
- **Ouvrir l'onglet** — remet l'onglet de travail au premier plan.
- **Demander à l'admin** — force le battement sans attendre la minute.

La ligne **Admin** du popup dit qui commande et pourquoi (« arrêt — hors de la
fenêtre 09:00–18:00 »). Sans elle, un profil arrêté par l'admin ressemble à un
profil qu'on aurait oublié de démarrer.

Un ordre de l'admin reprend la main au battement suivant : démarrer à la main un
profil que l'admin a mis à l'arrêt le ré-arrête dans la minute. C'est voulu — un
seul endroit décide.

Le journal du popup est celui du run ; les mêmes événements partent dans le
journal d'activité de l'API (`WORKER_POST_PUBLISHED`, `WORKER_CLAIM_LOST`,
`WORKER_COMMENT_ID_MISSING`, …), exactement comme côté Python.

## 5. Ce qui protège contre la double publication

Les règles du Python sont reprises telles quelles :

- Un post sort du pool (`consumed`) **avant** que le composeur soit touché.
- Un post en ligne dont seul le commentaire a échoué est confirmé `published`,
  jamais `failed` : le signaler en échec inviterait à le republier.
- Un **409** de l'API (réservation reprise) arrête la boucle sur place.
- Un groupe sans ID numérique arrête le profil **sans** marquer le post en échec :
  un post `FAILED` n'est jamais re-réservé, et ce serait perdre le contenu pour
  une faute de frappe corrigeable dans l'admin.
- Une réservation expirée laisse les posts non démarrés au pool, et le job n'est
  pas clôturé.

Et une protection que le Python n'avait pas besoin d'avoir : Chrome arrête un
service worker dès qu'il paraît inactif. Chaque transition est donc écrite dans
le stockage, et un worker qui revient avec un post « en vol » **ne republie
pas** : il va lire le fil du groupe pour savoir si ce post est sorti, puis
confirme `published` ou `failed` en conséquence.

## 6. Les deux contraintes propres au navigateur

**L'onglet de travail reste au premier plan pendant la saisie.** Chrome n'insère
du texte que dans un document qui a le focus. L'extension met donc son onglet
devant avant de remplir le composeur. Garder le navigateur ouvert (il peut être
derrière une autre fenêtre, mais pas minimisé).

**L'onglet n'est jamais fermé.** C'est la consigne du [CLAUDE.md](../CLAUDE.md) du
projet : l'extension réutilise le même onglet d'un post à l'autre et laisse la
fermeture à l'opérateur. Si l'onglet est fermé à la main, le post suivant en
ouvre un autre.

Effet de bord utile : les clics de l'extension ne sont pas des gestes
utilisateur, donc Facebook n'a pas le droit d'afficher « Quitter le site ? » —
la boîte de dialogue qui bloquait les navigations côté CDP ne peut pas apparaître
tant que personne ne clique dans l'onglet à la main.

## 7. Tests

```bash
cd extension
npm test          # node --test tests/  (aucune dependance)
```

Ce qui est couvert : le client de l'API contre un vrai serveur HTTP (formes de
réservation, 409, jointure des liens en attente), la composition du texte, les
bornes de la configuration, la résolution de l'ID de groupe, les préfixes de
recherche dans la page, et la cohérence du manifeste (fichiers cités, content
scripts sans `import`, pas de script en ligne).

Et deux tests dans un vrai Chrome, à part parce qu'ils demandent Chrome et le
paquet python `websockets` :

```bash
python3 tests/smoke_chrome.py       # l'extension démarre-t-elle ?
python3 tests/dom_comment_edit.py   # sait-elle modifier un commentaire ?
```

Le second ouvre [une page qui imite Facebook](tests/fixtures/facebook-comment.html)
et lui demande de poser un lien dans un commentaire. Elle reproduit les pièges
qui cassaient cette étape : le bouton « … » d'un commentaire est masqué par du
CSS `:hover` pur, et le menu comme l'Entrée ignorent les événements dont
`isTrusted` est faux. Le test vérifie que les événements simulés échouent, puis
rejoue la séquence de `links.js` (survol, « … », Modifier, texte, Entrée) en
saisie CDP, comme `chrome.debugger` le fait dans l'extension.

Il charge l'extension dans un profil temporaire sans fenêtre (rien de ton
navigateur n'est touché), puis vérifie que le manifeste est accepté, que le
service worker démarre sans exception, que le popup s'affiche avec les valeurs
venues du worker, et qu'une configuration incomplète est refusée et nommée.

Ce qui n'est couvert par aucun des deux : les sélecteurs Facebook. Ils ne se
vérifient que sur la page réelle — comme côté Python, où c'est le rôle de
`KEEP_TAB_OPEN`.

## 8. En cas de problème

`chrome://extensions` → **Service worker** ouvre la console du worker : tout le
journal y passe aussi.

| Symptôme | Cause / correction |
| --- | --- |
| « Navigateur pas encore appairé » | Admin → **Pilotage** → **Appairer**, puis coller le code dans les Options. |
| « Code inconnu ou déjà utilisé » | Le code a servi, ou un nouveau l'a annulé. En émettre un autre. |
| « Code expiré » | Il vaut 15 minutes. En émettre un autre. |
| « Serveur injoignable sur … » | L'adresse par défaut est `https://post.pulserecipe.com/api` ; pour un autre serveur, la corriger dans les Réglages avancés. |
| « API injoignable » | L'API ne tourne pas, ou le domaine n'est pas autorisé → **Autoriser l'accès**. |
| « L'API a refusé la clé » | Mauvaise clé (`AUTOMATION_API_KEY` côté API). |
| « Le composeur ne s'est pas ouvert » | Session Facebook expirée, ou checkpoint/captcha sur le compte : ouvrir l'onglet et regarder. |
| « le composeur contient …, pas le contenu exact » | Facebook a restauré un brouillon. L'extension refuse de publier autre chose que le texte attendu ; relancer. |
| « Post soumis mais introuvable dans le fil » | Le groupe modère peut-être les posts, ou le fil n'était pas rafraîchi. |
| « en attente de validation par un modérateur » | Le post est parti ; il est enregistré `published` pour ne pas être republié. |
| « ID du commentaire illisible » | Le commentaire est en ligne mais son lien ne pourra pas être posé automatiquement : à finir à la main. |
| « the options button has no box » | Corrigé : l'extension clique désormais le bouton « … » masqué. Si le message revient, régénère le zip (`npm run pack`) et ré-uploade-le dans NSTBrowser. |
| « Saisie de confiance indisponible » | La permission `debugger` manque : régénérer le zip (`npm run pack`), le ré-uploader, relancer le profil. Sans elle, la modification du commentaire échoue. |
| « could not edit comment … » | Le commentaire n'a pas pu être modifié. Le lien reste en attente côté API : **Poser les liens** dans le popup le retente. |
| « le commentaire est encore dans le champ » | Facebook a ignoré l'Enter. Le post est en ligne (enregistré `published`) ; ajouter le commentaire à la main. |
| Le texte n'arrive pas dans le composeur | L'onglet n'avait pas le focus (fenêtre minimisée), ou l'option « premier plan » est décochée. |
| Le popup dit « arrêt — arrêté depuis l’admin » | Normal : c’est l’admin qui commande. Passer le profil en Auto ou Marche forcée dans **Pilotage**. |
| Le popup dit « injoignable » sur la ligne Admin | L’API ne répond pas depuis ce navigateur : adresse, clé, ou domaine non autorisé (**Autoriser l’accès**). |
| Rien ne se passe après **Démarrer** | Regarder le journal : « rien à publier » signifie que l'API n'a pas de stock pour ce profil. |

## Arborescence

```text
manifest.json                 permissions, content scripts, service worker
src/common/config.js          les reglages (ex app/config.py + .env)
src/common/text.js            description -> corps du post (ex facebook/content.py)
src/common/log.js             le journal que le popup affiche
src/background/api.js         API data-fb-posting (claim / consumed / published / ...)
src/background/media.js       telechargement de l'image -> base64 pour le composeur
src/background/tab.js         onglet de travail, navigation, appel des etapes
src/background/publish.js     l'enchainement d'un post et ses navigations
src/background/links.js       pose du lien dans le commentaire enregistre
src/background/control.js     appairage, battement, ordre, reglages pousses
src/background/orchestrator.js la boucle, en machine a etats persistee
src/background/service_worker.js  messages du popup, heartbeat, reprise
src/content/helpers.js        ou sont les choses sur la page (les selecteurs)
src/content/interact.js       cliquer, survoler, saisir, envoyer (ex Input.* de CDP)
src/content/steps.js          une etape = tout ce qui tient sur une page
src/content/main.js           le fil entre le worker et la page
src/popup/                    le panneau de controle (ex app/web.py)
src/options/                  la page de reglages
tests/                        node --test, sans dependance
tests/fixtures/               une page qui imite Facebook, pour les selecteurs
```
