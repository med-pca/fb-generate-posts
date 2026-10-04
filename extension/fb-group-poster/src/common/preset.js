/* Préréglage du paquet. Vide dans le dépôt : `npm run pack:preset` en écrit
 * une copie remplie (adresse de l'API, clé, clé NSTBrowser) dans le paquet
 * seulement — jamais dans ce fichier, ni dans git.
 *
 * Rempli, il permet d'installer la même extension dans tous les profils
 * NSTBrowser : chacun détecte son profil et s'appaire seul au démarrage.
 */
export const PRESET = {
  apiBaseUrl: '',
  apiKey: '',
  nstApiKey: '',
};
