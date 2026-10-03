# « Modérateur · PostFlow » (ex-FB Post Checker)

Extension du **profil vérificateur**. Elle rouvre les posts publiés par les
automates et dit à la plateforme ce qu'elle voit :

| Sur la page | Ce que fait l'extension | Ce que fait la plateforme |
|---|---|---|
| Post en ligne, avec le lien de l'article | rien | ✓ Vérifié |
| « Ce contenu n'est pas disponible » | rien | remet le post dans la file : il sera republié |
| Post en ligne **sans** le lien | **supprime le post**, puis vérifie qu'il est parti | le republie |
| … et la suppression échoue | rien | ⚠ À traiter (republier ferait un doublon) |
| En attente de validation | rien | revient dans 2 h |
| Page illisible, profil déconnecté, post non reconnu | rien | revient dans 30 min ; ⚠ À traiter après 5 essais |

**Post publié sans adresse** (l'extension de publication ne l'a pas retrouvé) :
le vérificateur ouvre le groupe, cherche le post par son texte et son auteur,
récupère son lien et l'envoie à la plateforme, qui le garde. Puis il le
vérifie comme les autres. Chaque adresse trouvée apparaît dans « Derniers
contrôles ».

Par prudence, « introuvable » ne se conclut que sur le message explicite de
Facebook : une page mal lue ne fait jamais republier un post peut-être en ligne.

## Adhésion et pré-approbation de nos profils

Dans les groupes où il est **administrateur ou modérateur**, le vérificateur
s'occupe aussi des profils de la plateforme :

1. **accepter leur demande d'adhésion** (page « Demandes d'adhésion » du groupe) ;
2. une fois membres, les **pré-approuver** : leurs posts paraissent sans
   validation. Il passe par la page du membre dans le groupe (menu de gestion
   → « Pré-approuver »), sinon par ses publications en attente (menu « … »
   du post ; s'il n'y trouve pas l'option, il approuve au moins le post en
   attente, qui est le nôtre).

**Sécurité : uniquement nos profils.**
- La plateforme ne donne que des profils à elle, désignés par leur
  **identifiant Facebook numérique** (remonté par l'extension de publication
  ≥ 1.3.0 depuis le cookie `c_user`, ou saisi dans le Pilotage).
- L'extension ne clique que sur une ligne qui porte **exactement** cet
  identifiant ; jamais sur un nom (un homonyme est ignoré). Une ligne qui
  mêle plusieurs personnes n'est pas touchée.
- Le serveur refuse tout rapport dont l'identifiant n'est pas celui du profil
  (`MEMBER_MISMATCH`).

Si l'option n'est pas trouvée (vérificateur pas modérateur, libellé inconnu),
la tâche est réessayée plus tard, puis abandonnée après 6 essais ; le
Pilotage montre la raison (avec les entrées de menu vues) et propose
« Relancer ». La case « Accepter l'adhésion de nos profils… » de la fenêtre
active ou coupe cette partie.

## Piloté depuis la plateforme

Chaque minute, l'extension relit ses réglages dans la rubrique
**Modérateurs** (`POST /verify/control`) : suspendu ou non, publications par
passage, fréquence, adhésions oui/non. Ils priment sur ceux de la fenêtre. Un
« ▶ Lancer un passage » de l'administrateur part dans la minute. La
plateforme voit ainsi le modérateur « en ligne ».

## Installation

1. Dans le Pilotage, sur la ligne du profil : **Vérificateur**. Ce profil doit
   être **administrateur** (ou modérateur) des groupes, sinon il ne peut pas
   supprimer les posts des autres.
2. Dans le navigateur NSTBrowser de ce profil : `chrome://extensions` → mode
   développeur → **Charger l'extension non empaquetée** → ce dossier (ou
   décompresser `fb-post-checker.zip`).
3. Ouvrir l'extension → **Réglages** : clé d'API (X-API-Key) et identifiant
   NSTBrowser du profil (affiché sous son nom dans le Pilotage) → Enregistrer.
4. **Activer** : un passage toutes les 10 minutes, 5 posts par passage, 20 à
   45 s entre deux posts. **Vérifier maintenant** lance un passage tout de suite.

Elle ne démarre jamais seule : tant qu'elle n'est pas activée, elle ne fait rien.

Un post n'est vérifié qu'au moins 30 minutes après sa publication
(`VERIFY_AFTER_MINUTES` côté serveur), le temps que son commentaire reçoive l'URL.
Un même post n'est republié que 2 fois dans un groupe ; au-delà, il passe en
« À traiter ».

## Tests

    node extension/fb-post-checker/tests/check-test.js
