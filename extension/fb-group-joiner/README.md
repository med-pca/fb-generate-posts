# « Adhésion aux groupes · PostFlow » (ex-FB Group Joiner)

Extension Chrome (Manifest V3) qui récupère une liste de groupes Facebook depuis une API et les rejoint un par un.

## Installation

1. Remplir [config.js](config.js) (voir ci-dessous) puis lancer `./build.sh`
2. Installer `dist/fb-group-joiner.zip` dans Nstbrowser, ou dans un profil lancé :
   `chrome://extensions` → **Mode développeur** → **Charger l'extension non empaquetée** → ce dossier

## Configuration

Tout est dans [config.js](config.js), à remplir une fois avant de construire le paquet :

| Clé         | Valeur                                                    |
|-------------|-----------------------------------------------------------|
| `apiBase`   | `https://post.pulserecipe.com`                            |
| `apiKey`    | `AUTOMATION_API_KEY` du serveur (en-tête `X-API-Key`)     |
| `nstApiKey` | Clé de l'API locale Nstbrowser (Paramètres → API Key)     |
| `autoStart` | `false` (par défaut) : **manuel**, rien ne se lance seul. `true` : rejoindre les groupes dès le lancement du profil — déconseillé, Facebook y voit du spam |

Puis `./build.sh` produit `dist/fb-group-joiner.zip`, à installer dans Nstbrowser.

**Manuel par défaut** : au lancement d'un profil, l'extension ne fait rien. On ouvre son popup :
elle détecte l'ID du profil, charge ses groupes non rejoints (`NOT_JOINED` ou `FAILED`) et les
demandes à vérifier, puis on clique **Démarrer**. Le popup ne demande rien :
il affiche le profil détecté, la liste et les boutons Recharger / Démarrer / Stop.

### Nstbrowser

Le `profileExternalId` du profil dans l'API doit être **l'ID du profil Nstbrowser**.

L'extension retrouve seule le profil dans lequel elle tourne : elle ouvre un bref onglet
`whoami.html` portant un jeton, interroge l'API locale (`http://localhost:8848/api/v2/browsers`)
puis la liste des onglets de chaque navigateur lancé (`http://127.0.0.1:{remoteDebuggingPort}/json/list`) ;
celui qui contient le jeton donne l'ID du profil. La détection est refaite avant chaque chargement
et chaque démarrage (un profil cloné emporte les réglages de l'extension).

Routes utilisées :

```http
GET  /api/join/profiles/{profileExternalId}/groups
POST /api/join/profiles/{profileExternalId}/groups/{groupId}/join-status   { "joinStatus": "JOINED" }
```

Après chaque groupe, le résultat est renvoyé à l'API :

| Extension       | `joinStatus` API |
|-----------------|------------------|
| Rejoint / Déjà membre | `JOINED`   |
| Demande envoyée | `REQUESTED`      |
| Questions       | `QUESTIONS`      |
| Erreur          | `FAILED`         |

## Vérification des demandes en attente

Une demande d'adhésion acceptée **plus tard** par l'administrateur du groupe
ne se voit que sur la page du groupe. Avant la version 1.2.0, l'extension ne
la revoyait jamais : le profil restait « Demande envoyée » dans la
plateforme, ne pouvait pas publier dans le groupe, et la file affichait
« aucun profil ».

Désormais, à chaque chargement, l'extension reprend aussi les groupes
`REQUESTED` et `QUESTIONS` non vérifiés depuis **6 h**, et les **regarde
seulement** — elle ne clique jamais, ce qui annulerait la demande :

| Sur la page du groupe | Remonté à l'API |
| --- | --- |
| « Membre » / « Joined » / « عضو » | `JOINED` : le profil peut publier |
| « Annuler la demande » / « إلغاء الطلب » | `REQUESTED` (inchangé, rien dans les journaux) |
| « Rejoindre » est revenu | `NOT_JOINED` : la demande a été refusée, elle sera renvoyée |

Ces vérifications ne comptent pas dans la limite d'adhésions par session.
Les libellés de Facebook en arabe sont reconnus.

Après une mise à jour : `./build.sh`, puis réinstaller `dist/fb-group-joiner.zip`.

## Fonctionnement

- Chaque groupe est ouvert dans un onglet en arrière-plan, puis l'extension clique sur « Rejoindre le groupe » et ferme l'onglet.
- Un délai aléatoire (entre min et max) est appliqué entre deux groupes, avec une limite par session.
- Les groupes qui posent des questions d'adhésion sont marqués **Questions** et doivent être complétés à la main.
- Vous devez être connecté à Facebook dans le navigateur.

## Statuts

| Statut          | Signification                                  |
|-----------------|------------------------------------------------|
| En attente      | Pas encore traité                              |
| Rejoint         | Groupe public rejoint                          |
| Demande envoyée | Groupe privé, en attente de validation         |
| Déjà membre     | Rien à faire                                   |
| Questions       | Questions d'adhésion à remplir manuellement    |
| Erreur          | Bouton introuvable, page non chargée, etc.     |

## Attention

Facebook limite les adhésions automatisées ou trop rapides : le compte peut recevoir des blocages temporaires ou des restrictions. Gardez des délais généreux (≥ 60 s) et un nombre de groupes par session raisonnable.
