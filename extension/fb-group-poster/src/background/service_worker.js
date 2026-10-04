/* Wiring: the popup's buttons, the heartbeat that keeps the loop turning, and
 * the resume that runs whenever Chrome wakes this worker up again.
 *
 * A service worker is stopped as soon as it looks idle, so nothing important
 * lives in memory here: the run's state is in storage, and every wake-up simply
 * asks the orchestrator what is due.
 */

import { getConfig, setConfig, configProblems, DEFAULTS } from '../common/config.js';
import { readLogs, clearLogs, info } from '../common/log.js';
import { JobApi } from './api.js';
import { pair, autoPair } from './control.js';
import { placeLinks } from './links.js';
import * as run from './orchestrator.js';
import * as tab from './tab.js';

const handlers = {
  async status() {
    const [state, config] = await Promise.all([run.getState(), getConfig()]);
    return { ok: true, state, config, problems: configProblems(config), defaults: DEFAULTS };
  },

  start: () => run.start({ once: false }),
  startOnce: () => run.start({ once: true }),
  stop: () => run.stop('Arret demande'),
  async logs() {
    return { ok: true, logs: await readLogs() };
  },

  async clearLogs() {
    await clearLogs();
    return { ok: true };
  },

  async saveConfig({ patch }) {
    const config = await setConfig(patch || {});
    return { ok: true, config, problems: configProblems(config) };
  },

  /* Profiles the API is willing to hand posts to -- the list the options page
   * offers, so the externalId is picked rather than typed. */
  async profiles() {
    const config = await getConfig();
    if (!config.apiKey || !config.apiBaseUrl) return { ok: false, message: "Adresse ou cle d'API manquante" };
    try {
      const api = new JobApi(config.apiBaseUrl, config.apiKey);
      const profiles = await api.listProfiles();
      if (profiles === null) return { ok: false, message: "L'API n'expose pas la liste des profils" };
      return { ok: true, profiles };
    } catch (err) {
      return { ok: false, message: err.message };
    }
  },

  async testApi() {
    const config = await getConfig();
    const problems = configProblems(config);
    if (problems.length) return { ok: false, message: `Configuration incomplete : ${problems.join(', ')}` };
    try {
      const api = new JobApi(config.apiBaseUrl, config.apiKey);
      const profiles = await api.listProfiles();
      const known = profiles && profiles.some((p) => p.externalId === config.profileExternalId);
      if (profiles === null) return { ok: true, message: 'API joignable (pas de liste de profils exposee)' };
      return {
        ok: true,
        message: known
          ? `API joignable, profil ${config.profileExternalId} reconnu (${profiles.length} profil(s))`
          : `API joignable mais le profil ${config.profileExternalId} n'est pas dans sa liste`,
      };
    } catch (err) {
      return { ok: false, message: err.message };
    }
  },

  /* L'appairage sans code : détecter le profil NSTBrowser et s'annoncer. */
  async autoPair() {
    const result = await autoPair();
    if (result.ok) await run.supervise().catch(() => null);
    return result.ok
      ? { ok: true, message: `Appaire au profil « ${result.profileName || result.profileExternalId} »`, ...result }
      : { ok: false, message: result.message || result.skipped || 'Appairage automatique impossible' };
  },

  /* L'appairage : un code, et ce navigateur sait qui il est. */
  async pair({ code }) {
    try {
      const paired = await pair(code);
      await run.supervise().catch(() => null);
      const state = await run.getState();
      const remote = state.remote || {};
      return {
        ok: true,
        profileName: paired.profileName,
        profileExternalId: paired.profileExternalId,
        message: `Appairé au profil « ${paired.profileName || paired.profileExternalId} »`
          + (remote.reason ? ` — ordre actuel : ${remote.run ? 'publier' : 'arrêt'} (${remote.reason})` : ''),
      };
    } catch (err) {
      return { ok: false, message: err.message };
    }
  },

  /* Le bouton « Demander maintenant » : pour ne pas attendre la minute. */
  async sync() {
    const config = await getConfig();
    if (!config.controlEnabled) return { ok: false, message: 'Pilotage à distance désactivé' };
    const problems = configProblems(config);
    if (problems.length) return { ok: false, message: `Configuration incomplete : ${problems.join(', ')}` };
    await run.supervise();
    const state = await run.getState();
    const remote = state.remote || {};
    return {
      ok: !remote.error,
      message: remote.error
        ? `Pilotage injoignable : ${remote.error}`
        : remote.run
          ? `Ordre : publier (${remote.reason})`
          : `Ordre : arrêt (${remote.reason})`,
    };
  },

  /* « Poser les liens » : tous les commentaires de ce profil qui attendent
   * encore leur URL, quel que soit le job -- de quoi rattraper un lot dont la
   * modification a échoué. Refusé pendant la boucle : les deux se
   * disputeraient l'onglet. */
  async placeLinks() {
    const config = await getConfig();
    const problems = configProblems(config);
    if (problems.length) return { ok: false, message: `Configuration incomplete : ${problems.join(', ')}` };
    const state = await run.getState();
    if (state.running) return { ok: false, message: 'La boucle tourne : l’arrêter avant de poser les liens à la main' };
    const api = new JobApi(config.apiBaseUrl, config.apiKey);
    const working = await tab.workTab(config);
    const tally = await placeLinks(working.id, api, config);
    return {
      ok: tally.failed === 0,
      message: tally.failed
        ? `${tally.placed}/${tally.pending} lien(s) posé(s) ; échecs : ${tally.errors.join(' ; ')}`
        : `${tally.placed}/${tally.pending} lien(s) posé(s)`,
    };
  },

  async openTab() {
    const config = await getConfig();
    const working = await tab.workTab(config);
    await tab.focus(working.id);
    return { ok: true, tabId: working.id };
  },
};

chrome.runtime.onMessage.addListener((message, _sender, respond) => {
  const handler = message && handlers[message.type];
  if (!handler) return false;
  Promise.resolve()
    .then(() => handler(message))
    .then((answer) => respond(answer || { ok: true }))
    .catch((err) => respond({ ok: false, message: err && err.message ? err.message : String(err) }))
    .catch(() => { /* the popup closed before the answer */ });
  return true;
});

/* Un seul battement porte les deux choses : demander son ordre à l'admin, puis
 * faire avancer la boucle. Il tourne même à l'arrêt, sans quoi un profil éteint
 * ne pourrait plus être rallumé à distance. */
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== run.HEARTBEAT) return;
  await run.supervise().catch(() => null);
  run.tick();
});

/* The operator closed the working tab: forget it, so the next post opens a new
 * one instead of failing on a tab that is gone. */
chrome.tabs.onRemoved.addListener(async (tabId) => {
  const stored = await chrome.storage.local.get('workTabId');
  if (stored.workTabId === tabId) await tab.forgetTab();
});

// Au lancement du profil (et à l'installation) : s'appairer seul quand le
// paquet porte une clé, puis reprendre. Sans clé, l'appairage par code reste
// là, dans les options.
chrome.runtime.onStartup.addListener(async () => {
  // Un démarrage met fin à la veille : le prochain battement le dira au serveur.
  await run.markAwake().catch(() => null);
  await autoPair({ quiet: true }).catch(() => null);
  resume('Chrome a redemarre');
});
chrome.runtime.onInstalled.addListener(async (details) => {
  const paired = await autoPair({ quiet: details.reason !== 'install' }).catch(() => null);
  if (details.reason === 'install' && !(paired && paired.ok)) {
    info('Extension installee : colle un code d’appairage dans les options');
  }
  resume(details.reason === 'install' ? 'Extension installee' : 'Extension rechargee');
});

/* Every wake-up of this worker lands here, not just the two events above. */
async function resume(why) {
  const config = await getConfig();
  const state = await run.getState();
  // Le battement existe dès que le pilotage est utilisable, même si la boucle
  // est à l'arrêt : c'est par lui que l'admin la rallume.
  if (!state.running && !config.controlEnabled) return;
  await chrome.alarms.create(run.HEARTBEAT, { periodInMinutes: 1 });
  if (state.running) await info(`Reprise de la boucle (${why})`);
  await run.supervise().catch(() => null);
  run.tick();
}

resume('reveil du service worker');
