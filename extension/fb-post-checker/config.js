// Réglages par défaut. La clé d'API et l'identifiant du profil se saisissent
// dans la fenêtre de l'extension (ils restent dans ce navigateur) : rien de
// secret dans ce fichier, qui est suivi par git.
self.FPC_CONFIG = {
  apiBase: 'https://post.pulserecipe.com',
  apiKey: '',
  // Identifiant NSTBrowser du profil vérificateur (colonne Profil du Pilotage).
  profileExternalId: '',
  // Publications demandées à chaque passage, et passage toutes les N minutes.
  batchSize: 5,
  everyMinutes: 10,
  // Pause entre deux posts : un humain ne contrôle pas 5 posts à la seconde.
  pauseSeconds: [20, 45],
  // Laisser à Facebook le temps d'afficher le post et ses commentaires.
  settleSeconds: 7,
  // Accepter l'adhésion de NOS profils et les pré-approuver dans les groupes
  // dont ce profil est admin/modérateur. Désactivable dans la fenêtre.
  members: true,
};
