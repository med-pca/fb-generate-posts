// Configuration intégrée : rien à saisir à l'installation, comme pour
// l'extension d'adhésion aux groupes.
self.FCP_CONFIG = {
  apiBase: 'https://post.pulserecipe.com',
  // AUTOMATION_API_KEY du serveur, en-tête X-API-Key.
  apiKey: 'd2c62f6b64d43f2ffd2ad2bbbb9aacc8c61dacf1ab5042dc13df36875ff4c295',
  // Langue de l'article réécrit. « auto » garde celle de la page source :
  // une langue imposée la ferait traduire au passage.
  language: 'auto',
  // Pas de profil à viser : le post ira aux groupes de la catégorie du site,
  // et chaque profil le prendra dans le groupe où il publie.
  // Les sites de destination ne sont PAS ici : ils se déclarent dans la
  // plateforme, section Sites, et l'extension les y lit. Un site ajouté
  // apparaît dans la liste sans toucher à l'extension.
};
