// Configuration intégrée à l'extension : rien n'est saisi dans le popup.
// Vide dans le dépôt : la plateforme (rubrique Extensions) remplit la clé
// d'API et la clé NSTBrowser du compte au moment du téléchargement.
// Le profil n'est pas ici : il est détecté dans Nstbrowser à chaque lancement.
self.FGJ_CONFIG = {
  apiBase: "https://post.pulserecipe.com",
  apiKey: "", // AUTOMATION_API_KEY du serveur (en-tête X-API-Key)
  nstApiKey: "", // Nstbrowser → Paramètres → API Key
  // false : rien ne se lance seul. Facebook considère des adhésions en rafale
  // dès l'ouverture du profil comme du spam ; on ouvre le popup et on clique
  // « Démarrer » quand on le décide.
  autoStart: false,
};
