/* Settings, with the same meaning they had in app/config.py + .env.
 *
 * One browser profile = one Facebook account = one Profile row in the job API.
 * That is what replaces NSTBrowser: the profile is the browser the extension is
 * installed in, so the only thing to configure is which API profile it is.
 */

import { PRESET } from './preset.js';

export const DEFAULTS = {
  // The data-fb-posting API. Ce n'est pas un secret, et la déclarer ici évite
  // de la retaper dans chaque navigateur : l'appairage la confirme ou la
  // corrige avec l'adresse par laquelle le navigateur vient d'arriver.
  apiBaseUrl: PRESET.apiBaseUrl || 'https://post.pulserecipe.com/api',
  // Vide, sauf dans un paquet préconfiguré (npm run pack:preset).
  apiKey: PRESET.apiKey || '',
  // La clé de l'API locale NSTBrowser : ce qui permet au navigateur de
  // découvrir quel profil il est, et de s'appairer seul.
  nstApiKey: PRESET.nstApiKey || '',
  // Au démarrage, détecter le profil NSTBrowser et s'appairer sans code.
  autoPair: true,
  // Must match Profile.externalId in the job API.
  profileExternalId: '',
  // Pin the batch to one group (Group.externalId). Empty = let the API choose.
  groupExternalId: '',

  // Write a first comment under each post; its text is replaced by the post's
  // URL right after. A plain "." rather than the whole description: the
  // comment is a placeholder, and repeating the post reads as spam.
  addFirstComment: true,
  // Empty = the description, as before.
  firstCommentText: '.',

  // Once the URL is typed into the comment, Facebook fetches the site to build
  // its preview card. Saving before that card is there looks like a bot
  // dropping a bare link: wait for it, at least the minimum, at most the max.
  linkPreviewMinSeconds: 5,
  linkPreviewWaitSeconds: 20,

  // The API stores each post's pacing in minutes. 1 turns it into seconds,
  // which is how a whole batch is tried out quickly.
  delayUnitSeconds: 60,
  // Between two posts of this profile, whatever the batch: a group seeing a
  // burst of near-identical posts is what makes Facebook refuse them.
  staggerSeconds: 120,
  // How long before coming back to a profile that still holds a job.
  busyRetrySeconds: 300,
  // How long to wait before claiming again when the pool was empty.
  idlePollSeconds: 300,
  // How many posts this run may publish. 0 = no ceiling.
  maxPostsPerRun: 0,

  // Per step, not per post: each step polls the page for this long.
  stepTimeoutSeconds: 50,
  // How long to wait for a Facebook page to load before giving up on it.
  navigationTimeoutSeconds: 60,

  // The extension never closes its tab (see CLAUDE.md); it reuses this one.
  reuseWorkTab: true,
  // Bring the working tab to the front before touching the page. Chrome only
  // lets text be inserted into a focused document, so leave this on.
  focusWorkTab: true,

  debug: false,

  /* ── Pilotage depuis l'admin ────────────────────────────────────────── */

  /** Obéir à post.pulserecipe.com : demander « est-ce mon tour ? » chaque
   * minute, démarrer et s'arrêter sur cet ordre. Décoché, l'extension ne
   * marche qu'avec les boutons du popup. */
  controlEnabled: true,
};

/** Les réglages que l'admin peut pousser.
 *
 * L'adresse de l'API, sa clé et l'identité du profil n'en font pas partie :
 * ce sont eux qui font qu'un navigateur est bien celui-là, et un serveur qui
 * pourrait les changer pourrait détourner le profil. `controlEnabled` non
 * plus -- un serveur qui coupe sa propre laisse ne peut plus la reprendre.
 */
export const PUSHABLE = [
  'addFirstComment',
  'firstCommentText',
  'linkPreviewMinSeconds',
  'linkPreviewWaitSeconds',
  'delayUnitSeconds',
  'staggerSeconds',
  'busyRetrySeconds',
  'idlePollSeconds',
  'maxPostsPerRun',
  'stepTimeoutSeconds',
  'navigationTimeoutSeconds',
  'groupExternalId',
  'focusWorkTab',
  'reuseWorkTab',
  'debug',
];

// A field left empty in the options page reads back as 0, and a zero-second
// step timeout would fail every post. Each number has a floor instead.
const MINIMUMS = {
  delayUnitSeconds: 1,
  staggerSeconds: 0,
  busyRetrySeconds: 30,
  idlePollSeconds: 30,
  maxPostsPerRun: 0,
  stepTimeoutSeconds: 10,
  navigationTimeoutSeconds: 10,
  linkPreviewMinSeconds: 0,
  linkPreviewWaitSeconds: 0,
};

const KEY = 'config';

export async function getConfig() {
  const stored = await chrome.storage.local.get(KEY);
  // Older installations may still carry `placeLinksAfterJob: true`. Never
  // expose that legacy value: the publishing workflow must stop after the job
  // is closed and must not rewrite the comment with an URL.
  const { placeLinksAfterJob: _legacyPlaceLinksAfterJob, ...saved } = stored[KEY] || {};
  const config = { ...DEFAULTS, ...saved };
  // Un champ laissé vide dans les options ne doit pas effacer le préréglage
  // du paquet : sans clé, plus d'appairage automatique.
  for (const key of ['apiBaseUrl', 'apiKey', 'nstApiKey']) {
    if (!config[key] && DEFAULTS[key]) config[key] = DEFAULTS[key];
  }
  return config;
}

export async function setConfig(patch) {
  const current = await getConfig();
  const next = { ...current, ...patch };
  for (const [key, floor] of Object.entries(MINIMUMS)) {
    const value = Number(next[key]);
    next[key] = Number.isFinite(value) ? Math.max(floor, value) : DEFAULTS[key];
  }
  await chrome.storage.local.set({ [KEY]: next });
  return next;
}

export function groupUrl(groupId) {
  return `https://www.facebook.com/groups/${groupId}`;
}

/* Facebook defaults a group feed to "Most relevant", which does not surface a
 * just-published post. This ordering is what verification must look at. */
export function groupFeedUrl(groupId) {
  return `https://www.facebook.com/groups/${groupId}/?sorting_setting=CHRONOLOGICAL`;
}

/* « Votre contenu publié » : les seuls posts du compte dans ce groupe. Là, le
 * post qu'on vient de publier ne se noie pas parmi ceux des autres membres. */
export function groupOwnPostsUrl(groupId) {
  return `https://www.facebook.com/groups/${groupId}/my_posted_content`;
}

/* Missing settings the run cannot start without. */
export function configProblems(config) {
  const problems = [];
  if (!config.apiBaseUrl) problems.push("l'adresse de l'API est vide");
  if (!config.apiKey) problems.push("la cle d'API (X-API-Key) est vide");
  if (!config.profileExternalId) problems.push("l'identifiant de profil (Profile.externalId) est vide");
  return problems;
}
