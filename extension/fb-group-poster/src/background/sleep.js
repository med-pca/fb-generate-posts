/* La veille : fermer tout le navigateur entre deux lots, et le rouvrir à
 * l'heure de la publication suivante.
 *
 * Un navigateur NSTBrowser ouvert tient sa mémoire même quand l'extension ne
 * fait qu'attendre (pause entre deux lots, « rien à publier »). Quand l'attente
 * est longue, on le ferme -- mais une extension ne peut pas rouvrir son propre
 * navigateur une fois fermé. C'est l'agent local (`python -m app.launcher`) qui
 * le fait : il ouvre les profils dont le plan dit `shouldRun`, et le serveur
 * tient ce plan à « non » jusqu'à l'heure de réveil qu'on lui a donnée.
 *
 * D'où l'ordre, qui ne se discute pas :
 *   1. dire au serveur « je dors jusqu'à HH:MM », et EXIGER son accusé ;
 *   2. seulement ensuite, demander à NSTBrowser de fermer ce profil.
 * Sans accusé, on ne ferme pas : l'agent rouvrirait aussitôt, ou jamais.
 *
 * Rien n'est perdu à la fermeture : l'état de la boucle est en stockage, et la
 * reprise après réveil est celle de n'importe quel redémarrage.
 */

import { info, warn } from '../common/log.js';
import { askControl } from './control.js';
import { JobApi } from './api.js';

const NST_API = 'http://localhost:8848/api/v2';
/** Rouvrir un peu avant l'heure : le temps que l'agent passe (il interroge le
 * serveur toutes les minutes environ) et que le navigateur démarre. */
export const WAKE_MARGIN_MS = 3 * 60_000;
/** Un navigateur qui vient de s'ouvrir reste éveillé un moment : s'il a été
 * ouvert à la main, c'est pour qu'on le regarde. */
export const AWAKE_GRACE_MS = 5 * 60_000;
/** En dessous, fermer puis rouvrir coûte plus qu'attendre. */
export const MIN_SLEEP_MINUTES = 5;

const SLEEPY_PHASES = ['claim', 'wait'];

/** Faut-il dormir maintenant ? `null` = non ; sinon l'heure de réveil. Pur :
 * tout ce qui décide est dans la config et l'état. */
export function sleepPlan(config, state, now = Date.now()) {
  if (!config.closeWhenIdle || !config.controlEnabled) return null;
  if (!config.nstApiKey || !config.profileExternalId) return null;
  if (!state.running || state.once || state.inFlight) return null;
  // Entre deux lots, ou entre deux posts d'un lot (le lot est en stockage) ;
  // jamais pendant une publication, un commentaire ou la pose des liens.
  if (!SLEEPY_PHASES.includes(state.phase)) return null;
  if (state.awakeSince && now - state.awakeSince < AWAKE_GRACE_MS) return null;
  // Déjà endormi : la fermeture est demandée, on attend qu'elle se fasse.
  if (state.sleepUntil && state.sleepUntil > now) return null;
  // Une fermeture déjà refusée pour cette attente : ne pas insister.
  if (state.sleepRefusedFor && state.sleepRefusedFor === state.nextDueAt) return null;
  const minutes = Math.max(MIN_SLEEP_MINUTES, Number(config.closeIfWaitMinutes) || 0);
  if (!state.nextDueAt || state.nextDueAt - now < minutes * 60_000) return null;
  return { wakeAt: state.nextDueAt - WAKE_MARGIN_MS };
}

const hhmm = (ms) => new Date(ms).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

/** S'endormir : accusé du serveur d'abord, fermeture ensuite. Rend `true` si
 * la fermeture est demandée (le navigateur va disparaître). */
export async function fallAsleep(config, state, setState, plan, fetchImpl = fetch) {
  const until = new Date(plan.wakeAt).toISOString();
  const message = `En veille jusqu'à ${hhmm(plan.wakeAt)} (navigateur fermé pour libérer la mémoire)`;
  const refuse = async (why) => {
    await setState({ sleepUntil: 0, sleepRefusedFor: state.nextDueAt, lastMessage: state.lastMessage });
    // Effacer la veille côté serveur, au cas où elle aurait été notée.
    await askControl(config, { ...state, sleepUntil: 0 }).catch(() => null);
    await warn(`Veille annulée : ${why}. Le navigateur reste ouvert.`);
    return false;
  };

  const sleeping = await setState({ sleepUntil: plan.wakeAt, lastMessage: message });
  let answer;
  try {
    answer = await askControl(config, sleeping);
  } catch (err) {
    return refuse(`serveur injoignable (${err.message})`);
  }
  if (!answer || !answer.sleepUntil) return refuse('le serveur n’a pas noté l’heure de réveil (plateforme à mettre à jour ?)');
  if (answer.run === false) {
    // L'admin a arrêté ce profil entre-temps : pas de réveil à programmer.
    return refuse('le profil est à l’arrêt');
  }

  await info(message);
  await new JobApi(config.apiBaseUrl, config.apiKey)
    .log('WORKER_BROWSER_SLEEP', message, { metadata: { sleepUntil: until } })
    .catch(() => null);

  try {
    const res = await fetchImpl(`${NST_API}/browsers/${encodeURIComponent(config.profileExternalId)}`, {
      method: 'DELETE',
      headers: { 'x-api-key': config.nstApiKey },
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok || body.err) return refuse(`NSTBrowser refuse de fermer le profil (${body.msg || res.status})`);
  } catch (err) {
    return refuse(`API locale NSTBrowser injoignable (${err.message})`);
  }
  return true;
}
