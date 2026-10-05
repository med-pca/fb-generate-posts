// Réglages par défaut. La clé d'API et l'identifiant du profil se saisissent
// dans la fenêtre de l'extension (ils restent dans ce navigateur) : rien de
// secret dans ce fichier, qui est suivi par git.
self.FPC_CONFIG = {
  apiBase: 'https://post.pulserecipe.com',
  apiKey: '',
  // Identifiant NSTBrowser du profil vérificateur (colonne Profil du Pilotage).
  profileExternalId: '',
  // Rythme HUMAIN : Facebook a désactivé un compte modérateur qui agissait
  // toutes les 10 minutes, 24 h/24. Les réglages de la plateforme (rubrique
  // Modérateurs) priment sur ceux-ci.
  // Au plus N actions par passage (le nombre réel varie à chaque passage), et
  // un passage environ toutes les N minutes (jamais à intervalle fixe).
  batchSize: 3,
  everyMinutes: 25,
  // Heures de travail (minutes depuis minuit, fuseau ci-dessous) et plafonds.
  windowStart: 540, // 09:00
  windowEnd: 1320, // 22:00
  timezone: 'Europe/Paris',
  hourlyLimit: 12,
  dailyLimit: 60,
  // Pause entre deux actions (secondes, tirée au hasard) ; de temps en temps
  // une pause bien plus longue, comme quelqu'un qui fait autre chose.
  pauseSeconds: [45, 150],
  // Laisser à Facebook le temps d'afficher la page (secondes, au hasard).
  settleSeconds: [5, 10],
  // Accepter l'adhésion de NOS profils et les pré-approuver dans les groupes
  // dont ce profil est admin/modérateur. Désactivable dans la fenêtre.
  members: true,
};
