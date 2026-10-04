/* Obéir à l'admin : demander « est-ce mon tour ? », et rapporter où l'on en est.
 *
 * Le sens de l'échange n'est pas un choix de confort : l'API ne peut pas
 * appeler ce navigateur -- il n'a pas d'adresse -- donc c'est lui qui revient
 * demander, une fois par minute. Un aller-retour unique porte les deux moitiés :
 * l'état part, l'ordre revient. Deux appels séparés laisseraient l'admin voir
 * un profil sans savoir s'il a reçu l'ordre.
 */

import { detectNstProfile } from './nst.js';
import { getConfig, setConfig, configProblems, PUSHABLE } from '../common/config.js';
import { info, warn } from '../common/log.js';
import { JobApi } from './api.js';

/** L'état à rapporter, tel que l'admin l'affiche. */
function reportOf(state) {
  const version = chrome.runtime.getManifest().version;
  return {
    running: Boolean(state.running),
    phase: state.running ? state.phase : undefined,
    message: state.lastMessage || undefined,
    published: state.stats?.published || 0,
    failed: state.stats?.failed || 0,
    links: state.stats?.links || 0,
    agent: `extension ${version}`,
    // La veille : l'agent local ne rouvrira ce navigateur qu'à cette heure.
    sleepUntil: state.sleepUntil > Date.now() ? new Date(state.sleepUntil).toISOString() : undefined,
  };
}

/** Le compte Facebook connecté dans ce navigateur : son identifiant
 * numérique est dans le cookie `c_user`. La plateforme s'en sert pour que le
 * vérificateur reconnaisse NOS profils dans les groupes (accepter leur
 * adhésion, les pré-approuver) sans jamais se fier à un nom. */
export async function facebookUserId() {
  try {
    const cookie = await chrome.cookies.get({ url: 'https://www.facebook.com', name: 'c_user' });
    return cookie && /^\d{5,20}$/.test(cookie.value) ? cookie.value : '';
  } catch (_) {
    // Permission absente (ancienne installation) : on n'envoie rien.
    return '';
  }
}

/** Demander l'ordre en rapportant l'état. `null` quand l'API est muette : ne
 * rien changer vaut mieux qu'arrêter un profil parce que le réseau a toussé. */
export async function askControl(config, state) {
  const api = new JobApi(config.apiBaseUrl, config.apiKey);
  const report = reportOf(state);
  const fbId = await facebookUserId();
  if (fbId) {
    report.facebookUserId = fbId;
    if (state.author) report.facebookName = String(state.author).slice(0, 200);
  }
  return api.heartbeat(config.profileExternalId, report);
}

/** Les réglages venus de l'admin, écrits seulement s'ils changent quelque
 * chose : sinon chaque battement réécrirait le stockage pour rien. */
export async function applyPushedSettings(pushed) {
  if (!pushed || typeof pushed !== 'object') return null;
  const config = await getConfig();
  const patch = {};
  const ignored = [];
  for (const [key, value] of Object.entries(pushed)) {
    if (!PUSHABLE.includes(key)) {
      ignored.push(key);
      continue;
    }
    // Comparaison lâche volontaire : l'admin envoie du JSON, où un nombre
    // peut arriver en texte.
    if (String(config[key]) !== String(value)) patch[key] = value;
  }
  if (ignored.length) {
    await warn(`Réglages poussés ignorés (inconnus ou protégés) : ${ignored.join(', ')}`);
  }
  if (!Object.keys(patch).length) return null;
  const next = await setConfig(patch);
  await info(
    `Réglages reçus de l'admin : ${Object.entries(patch).map(([k, v]) => `${k}=${v}`).join(', ')}`,
  );
  return next;
}

/** Le pilotage est-il en état de fonctionner ? */
export async function controlUsable(config) {
  return config.controlEnabled && configProblems(config).length === 0;
}

/* Appairer ce navigateur : un code, et il sait qui il est.
 *
 * C'est le seul échange qui part sans clé -- le navigateur n'en a pas encore, et
 * le code est précisément ce qui la lui donne. En retour viennent l'adresse de
 * l'API (celle par laquelle la requête est arrivée, donc celle qui marche
 * depuis ici), la clé, et l'identifiant du profil : les trois champs qu'il
 * fallait saisir à la main dans chaque navigateur.
 */
/* L'appairage automatique : sans code. Le navigateur a déjà une clé (paquet
 * préconfiguré), découvre seul son profil NSTBrowser, et s'annonce à l'API.
 * Refait à chaque démarrage : un profil NSTBrowser cloné emporte les réglages
 * de l'extension, et doit se présenter sous son propre identifiant. */
export async function autoPair({ quiet = false } = {}) {
  const config = await getConfig();
  if (!config.autoPair) return { ok: false, skipped: 'desactive' };
  if (!config.apiKey) return { ok: false, skipped: 'pas de cle : appairage par code' };
  let detected;
  try {
    detected = await detectNstProfile(config.nstApiKey);
  } catch (err) {
    if (!quiet) await warn(`Appairage automatique impossible : ${err.message}`);
    return { ok: false, message: err.message };
  }
  const base = String(config.apiBaseUrl || '').replace(/\/+$/, '');
  let response;
  try {
    response = await fetch(`${base}/control/auto-pair`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-Key': config.apiKey },
      body: JSON.stringify({ profileExternalId: detected.profileId, name: detected.name || undefined }),
    });
  } catch (err) {
    if (!quiet) await warn(`Appairage automatique : serveur injoignable (${err.message})`);
    return { ok: false, message: err.message };
  }
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const message = (payload && [].concat(payload.message || []).join(', ')) || `HTTP ${response.status}`;
    await warn(`Appairage automatique refuse : ${message}`);
    return { ok: false, message };
  }
  const changed = config.profileExternalId !== detected.profileId;
  await setConfig({ profileExternalId: detected.profileId, controlEnabled: true });
  if (changed || !quiet) {
    await info(
      `Appaire automatiquement au profil « ${payload.profileName || detected.profileId} »` +
        (payload.created ? ' (cree dans la plateforme)' : ''),
    );
  }
  return { ok: true, ...payload };
}

export async function pair(code) {
  const config = await getConfig();
  const base = String(config.apiBaseUrl || '').replace(/\/+$/, '');
  if (!base) throw new Error("Aucune adresse d'API : renseigne-la dans les réglages avancés");

  let response;
  try {
    response = await fetch(`${base}/control/pair`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: String(code || '').trim().toUpperCase() }),
    });
  } catch (err) {
    throw new Error(`Serveur injoignable sur ${base} (${err.message})`);
  }

  const text = await response.text();
  let payload = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch (_) {
    payload = null;
  }
  if (!response.ok) {
    const message = payload && (payload.message || payload.error);
    throw new Error(
      Array.isArray(message) ? message.join(', ') : message || `Le serveur a répondu HTTP ${response.status}`,
    );
  }
  if (!payload || !payload.apiKey || !payload.profileExternalId) {
    throw new Error("Réponse d'appairage incomplète : le serveur n'a pas renvoyé de clé ni de profil");
  }

  const next = await setConfig({
    // L'adresse renvoyée l'emporte : le serveur sait sous quel nom il est
    // joignable, y compris derrière un proxy.
    apiBaseUrl: String(payload.apiBaseUrl || base).replace(/\/+$/, ''),
    apiKey: payload.apiKey,
    profileExternalId: payload.profileExternalId,
    controlEnabled: true,
  });
  await info(
    `Navigateur appairé au profil « ${payload.profileName || payload.profileExternalId} »`,
  );
  return { ...payload, config: next };
}
