/* Continuous publishing for one profile. Port of app/scheduler.py.
 *
 *     claim a batch -> publish a post -> confirm it -> wait its delay
 *     -> ... -> close the job -> wait -> claim again
 *
 * Written as a state machine rather than one long function, because a service
 * worker is stopped whenever it looks idle and a batch can span hours. Every
 * transition is persisted, so a worker that comes back mid-batch knows exactly
 * where it was -- and a post taken out of circulation is never republished: the
 * page is asked whether it went out.
 *
 * What NSTBrowser used to do has no equivalent here on purpose: the profile is
 * the browser this extension is installed in.
 */

import { getConfig, configProblems } from '../common/config.js';
import { composePostBody } from '../common/text.js';
import { info, warn, error } from '../common/log.js';
import { JobApi, ApiError, ClaimLostError } from './api.js';
import { fetchImage, ImageError } from './media.js';
import { publishPost, findPublished } from './publish.js';
import { placeLinks, placeLinkNow, ensureComment } from './links.js';
import { checkApprovals } from './approvals.js';
import { askControl, applyPushedSettings } from './control.js';
import * as tab from './tab.js';
import { SUSPENDED_KEY } from './tab.js';
import { sleepPlan, fallAsleep } from './sleep.js';

// Event types written to the API's activity log (same names as the Python).
const EVENT_PUBLISHED = 'WORKER_POST_PUBLISHED';
const EVENT_FAILED = 'WORKER_POST_FAILED';
const EVENT_PARTIAL = 'WORKER_POST_PARTIAL';
const EVENT_BROWSER = 'WORKER_BROWSER_ERROR';
const EVENT_EMPTY = 'WORKER_NO_POST';
const EMPTY_LOG_EVERY_MS = 30 * 60 * 1000;
const AFTER_FAILURE_MS = 15 * 1000;
const EVENT_CLAIM_LOST = 'WORKER_CLAIM_LOST';
const EVENT_BAD_GROUP = 'WORKER_GROUP_NOT_USABLE';
const EVENT_PENDING = 'WORKER_POST_PENDING_APPROVAL';
const EVENT_LINK_NOT_ADDED = 'WORKER_COMMENT_LINK_FAILED';
const EVENT_NO_COMMENT_ID = 'WORKER_COMMENT_ID_MISSING';

const STATE_KEY = 'run';
const HEARTBEAT = 'fbx-heartbeat';
const MAX_TRANSITIONS_PER_TICK = 40;

const EMPTY_STATE = {
  running: false,
  once: false,
  phase: 'claim',
  nextDueAt: 0,
  job: null,
  index: 0,
  inFlight: null,
  author: '',
  stats: { published: 0, failed: 0, empty: 0, links: 0 },
  lastMessage: '',
  startedAt: 0,
  stoppedAt: 0,
  /** Arrêt dû au plafond de posts, pas à un ordre. Sans cette mémoire, le
   * battement suivant relancerait la boucle et le plafond ne plafonnerait
   * rien : il vaut par ordre de marche, pas par minute. */
  stoppedByCeiling: false,
  /** Le dernier ordre reçu de l'admin, pour que le popup dise qui commande. */
  remote: null,
  /** La veille (voir sleep.js) : l'heure de réveil annoncée au serveur, le
   * moment où le navigateur s'est rouvert, et l'attente pour laquelle une
   * fermeture a échoué (pour ne pas réessayer en boucle). */
  sleepUntil: 0,
  awakeSince: 0,
  sleepRefusedFor: 0,
};

export async function getState() {
  const stored = await chrome.storage.local.get(STATE_KEY);
  return { ...EMPTY_STATE, ...(stored[STATE_KEY] || {}) };
}

async function setState(patch) {
  const next = { ...(await getState()), ...patch };
  await chrome.storage.local.set({ [STATE_KEY]: next });
  return next;
}

// -- control ---------------------------------------------------------------

export async function start({ once = false } = {}) {
  const config = await getConfig();
  const problems = configProblems(config);
  if (problems.length) {
    const message = `Configuration incomplete : ${problems.join(', ')}`;
    await error(message);
    return { ok: false, message };
  }
  const state = await getState();
  if (state.running) return { ok: true, message: 'Deja en cours' };

  // Un lot interrompu par un arrêt (ordre du Pilotage, fenêtre horaire,
  // navigateur relancé) entre deux posts est REPRIS, pas oublié : l'oublier
  // laissait le profil « occupé » par son propre lot, que la réservation
  // suivante libérait — le post restant repartait en file, et les liens du
  // lot n'étaient pas posés.
  const resumable =
    !state.inFlight && state.job && ['wait', 'publish', 'complete', 'link'].includes(state.phase);
  await setState({
    ...EMPTY_STATE,
    running: true,
    once,
    stoppedByCeiling: false,
    // A batch left in flight by a crash is picked up before anything new.
    phase: state.inFlight ? 'recover' : resumable ? state.phase : 'claim',
    job: state.inFlight || resumable ? state.job : null,
    nextDueAt: resumable ? state.nextDueAt : 0,
    author: state.author || '',
    awakeSince: state.awakeSince || 0,
    index: state.index,
    inFlight: state.inFlight,
    startedAt: Date.now(),
    lastMessage: once ? 'Un seul lot demande' : 'Demarrage',
  });
  await chrome.alarms.create(HEARTBEAT, { periodInMinutes: 1 });
  await info(once ? 'Demarrage (un seul lot)' : 'Demarrage du worker');
  tick();
  return { ok: true, message: 'Demarre' };
}

export async function stop(message = 'Arrete') {
  // Le battement n'est pas coupé : c'est lui qui redemandera à l'admin, et qui
  // rallumera la boucle quand l'ordre changera. Le couper ici rendrait l'arrêt
  // définitif jusqu'au prochain clic -- exactement ce que le pilotage à
  // distance est censé éviter.
  await setState({ running: false, stoppedAt: Date.now(), lastMessage: message });
  await info(`Arret : ${message}`);
  return { ok: true, message };
}

/* Obéir à l'admin. Appelé à chaque battement, que la boucle tourne ou non --
 * un profil à l'arrêt doit pouvoir être rallumé depuis post.pulserecipe.com
 * sans que personne ne touche à ce navigateur.
 *
 * Une API muette ne change rien : arrêter un profil parce que le réseau a
 * toussé coûterait des publications, et le pire que fasse un ordre en retard
 * est d'arriver au battement suivant. */
export async function supervise() {
  const config = await getConfig();
  if (!config.controlEnabled) return;
  if (configProblems(config).length) return;

  const before = await getState();
  let decision;
  try {
    decision = await askControl(config, before);
  } catch (err) {
    await setState({ remote: { ...(before.remote || {}), error: err.message, at: Date.now() } });
    await warn(`Pilotage injoignable : ${err.message}`);
    return;
  }
  if (!decision) return;

  await setState({
    remote: {
      run: Boolean(decision.run),
      reason: String(decision.reason || ''),
      mode: String(decision.mode || ''),
      window: String(decision.window || ''),
      at: Date.now(),
      error: '',
    },
  });
  await applyPushedSettings(decision.settings);

  const state = await getState();
  if (!decision.run) {
    // L'ordre est à l'arrêt : le prochain ordre de marche sera un ordre neuf,
    // et le plafond repartira de zéro.
    if (state.stoppedByCeiling) await setState({ stoppedByCeiling: false });
    if (state.running) await stop(`ordre de l'admin : ${decision.reason}`);
    return;
  }
  if (state.running) return;
  if (state.stoppedByCeiling) {
    // Le plafond vaut pour cet ordre de marche. Repasser par l'arrêt dans
    // l'admin est ce qui en donne un nouveau.
    return;
  }
  await info(`Ordre de l'admin : publier (${decision.reason})`);
  await start({ once: false });
}

/** Le navigateur vient de (re)démarrer : la veille est finie. */
export async function markAwake() {
  await setState({ awakeSince: Date.now(), sleepUntil: 0, sleepRefusedFor: 0 });
}

// -- the driver ------------------------------------------------------------

let busy = false;

export function tick() {
  if (busy) return;
  busy = true;
  drive()
    .catch(async (err) => {
      await error(`Boucle interrompue : ${err.message}`);
      await setState({ lastMessage: `Erreur : ${err.message}` });
    })
    .finally(() => { busy = false; });
}

async function drive() {
  const config = await getConfig();
  for (let n = 0; n < MAX_TRANSITIONS_PER_TICK; n += 1) {
    const state = await getState();
    if (!state.running) return;
    if (state.nextDueAt > Date.now()) {
      // Une longue attente : fermer le navigateur, l'agent local le rouvrira
      // à l'heure (option « Fermer le navigateur entre deux lots »).
      const plan = sleepPlan(config, state);
      if (plan && (await fallAsleep(config, state, setState, plan))) return;
      // The heartbeat comes back every minute; a shorter wait gets its own timer.
      const wait = state.nextDueAt - Date.now();
      if (wait < 60000) setTimeout(tick, wait + 500);
      return;
    }
    const api = new JobApi(config.apiBaseUrl, config.apiKey);
    // Une page de suspension a été vue : la plateforme arrête le profil et
    // confie son travail aux autres ; ici, on s'arrête net.
    const seen = (await chrome.storage.local.get(SUSPENDED_KEY))[SUSPENDED_KEY];
    if (seen) {
      try {
        await api.reportSuspension(config.profileExternalId, seen);
        await chrome.storage.local.remove(SUSPENDED_KEY);
      } catch (err) {
        await warn(`Suspension non signalee a la plateforme : ${err.message} (nouvel essai au prochain demarrage)`);
      }
      await setState({ job: null, index: 0, phase: 'claim', inFlight: null });
      await stop(seen.kind === 'disabled' ? 'Compte suspendu par Facebook : profil arrete (voir Profils)' : 'Facebook demande une verification du compte : profil arrete (voir Profils)');
      return;
    }
    switch (state.phase) {
      case 'recover': await recover(config, api, state); break;
      case 'claim': await doClaim(config, api, state); break;
      case 'publish': await doPublish(config, api, state); break;
      case 'wait': await setState({ phase: 'publish' }); break;
      case 'complete': await doComplete(config, api, state); break;
      case 'link': await doLink(config, api, state); break;
      default: await setState({ phase: 'claim' }); break;
    }
  }
  setTimeout(tick, 1000);
}

// -- phases ----------------------------------------------------------------

async function doClaim(config, api, state) {
  if (config.maxPostsPerRun > 0 && state.stats.published >= config.maxPostsPerRun) {
    await setState({ stoppedByCeiling: true });
    await stop(`Plafond atteint : ${state.stats.published} post(s) publie(s) sur ce run`);
    return;
  }
  if (state.once && (state.stats.published || state.stats.failed)) {
    await stop('Un seul lot demande, termine');
    return;
  }

  // Le lot précédent est fini : ses posts en attente de validation sont-ils
  // visibles maintenant ? Si oui, on finit leur travail avant d'en prendre d'autres.
  if (!config.groupExternalId) {
    try {
      await checkApprovals(config, api);
    } catch (err) {
      await warn(`Revérification des posts en attente interrompue : ${err.message}`);
    }
  }

  let claimed;
  try {
    await info(`Reservation d'un lot pour le profil ${config.profileExternalId}`);
    claimed = await api.claim(config.profileExternalId, config.groupExternalId);
  } catch (err) {
    if (err instanceof ClaimLostError) {
      await api.log(EVENT_CLAIM_LOST, err.message, { level: 'ERROR' });
      await stop(`Reservation perdue : ${err.message}`);
      return;
    }
    await error(`Reservation impossible : ${err.message}`);
    await setState({ nextDueAt: Date.now() + config.busyRetrySeconds * 1000, lastMessage: err.message });
    return;
  }

  if (claimed.kind === 'busy') {
    // On est ici pour réserver : on ne tient donc aucun lot. Un lot « en
    // cours » pour ce profil est un lot qu'on a oublié (extension
    // réinstallée ou relancée en plein lot). Personne ne le finira : on le
    // libère — ses posts pas commencés retournent en file — et on réserve
    // aussitôt. Attendre son expiration bloquait le profil pour rien.
    if (state.job?.jobId !== claimed.jobId) {
      try {
        const released = await api.release(claimed.jobId);
        await warn(`Lot oublie ${claimed.jobId} libere (${released.released} post(s) rendu(s) a la file)`);
        await setState({ nextDueAt: Date.now(), lastMessage: 'Lot oublie libere' });
        return;
      } catch (err) {
        await warn(`Liberation du lot ${claimed.jobId} impossible : ${err.message}`);
      }
    }
    await info(`Le profil tient encore le job ${claimed.jobId} ; retour dans ${Math.round(config.busyRetrySeconds / 60)} min`);
    await setState({ nextDueAt: Date.now() + config.busyRetrySeconds * 1000, lastMessage: claimed.message });
    return;
  }
  if (claimed.kind === 'empty') {
    await info(`Rien a publier (${claimed.message})`);
    // Le journal porte la raison donnée par l'API — sans elle, « aucun post »
    // ne disait pas quoi corriger. Une même raison n'est réécrite qu'au plus
    // toutes les 30 min, pour ne pas noyer le journal à chaque passage.
    const said = `${claimed.reason}|${claimed.message}`;
    const quiet = state.lastEmptySaid === said && Date.now() - (state.lastEmptyAt || 0) < EMPTY_LOG_EVERY_MS;
    if (!quiet) {
      await api.log(EVENT_EMPTY, `Rien à publier : ${claimed.message}`, {
        metadata: {
          profileExternalId: config.profileExternalId,
          reason: claimed.reason || null,
          diagnosis: claimed.diagnosis || null,
        },
      });
      await setState({ lastEmptySaid: said, lastEmptyAt: Date.now() });
    }
    await bumpStats({ empty: 1 });
    if (state.once) {
      await stop('Rien a publier');
      return;
    }
    await setState({ nextDueAt: Date.now() + config.idlePollSeconds * 1000, lastMessage: 'Rien a publier' });
    return;
  }

  let groupId;
  try {
    groupId = resolveGroupId(claimed);
  } catch (err) {
    // A misconfigured group is fixable in the admin, so the post must NOT be
    // marked failed: a FAILED target is never re-claimed, and the content would
    // be retired for good over a typo. The reservation is left to expire.
    await api.log(EVENT_BAD_GROUP, err.message, {
      level: 'ERROR',
      jobId: claimed.jobId,
      metadata: {
        profileExternalId: config.profileExternalId,
        groupExternalId: claimed.groupExternalId,
        groupUrl: claimed.groupUrl,
      },
    });
    await stop(err.message);
    return;
  }

  await info(
    `${claimed.posts.length} post(s) reserve(s) pour le groupe ${claimed.groupName || groupId} (job ${claimed.jobId})`,
  );
  // Un lot qui ne tient pas dans sa réservation perd ses posts restants ET le
  // lien de ceux déjà publiés, faute de clôture. C'est de l'arithmétique, donc
  // c'est visible d'avance : le dire dans l'état, pas seulement dans le
  // journal, sinon personne ne le lit avant les dégâts.
  const tooLong = await warnAboutClaimWindow(claimed, config);
  await setState({
    job: { ...claimed, groupId },
    index: 0,
    phase: 'publish',
    nextDueAt: 0,
    lastMessage: tooLong || `Lot de ${claimed.posts.length} post(s)`,
  });
}

async function doPublish(config, api, state) {
  // A post taken out of circulation, and a worker that came back: only the page
  // can say whether that post went out. Never the composer again.
  if (state.inFlight) {
    await setState({ phase: 'recover' });
    return;
  }
  const job = state.job;
  if (!job || state.index >= (job.posts || []).length) {
    await setState({ phase: 'complete', nextDueAt: 0 });
    return;
  }
  if (job.claimExpiresAt && Date.now() > job.claimExpiresAt) {
    // The remaining posts go back to the pool; the job is NOT closed, because
    // its unstarted posts were never ours to retire.
    const message = `Reservation expiree, ${job.posts.length - state.index} post(s) non demarre(s) retournent au pool`;
    await error(message);
    await setState({ job: null, index: 0, phase: 'claim', nextDueAt: Date.now() + config.busyRetrySeconds * 1000, lastMessage: message });
    return;
  }

  const post = job.posts[state.index];
  const ids = { postId: post.id, jobId: job.jobId, metadata: { profileExternalId: config.profileExternalId, groupId: job.groupId } };
  await info(`Post ${state.index + 1}/${job.posts.length} (id ${post.id})`);

  // The post is the description beside the image -- no title and no link. The
  // URL is released by the API only after the complete job is closed.
  const content = composePostBody(post.description);
  if (!content) {
    await failPost(api, job, post, config, "L'API a renvoye un post sans texte", ids);
    await nextPost(config, state, job, post, false);
    return;
  }
  // Un post « engagement » part sans commentaire, quel que soit le réglage.
  const firstComment = !config.addFirstComment || post.noComment
    ? ''
    : String(config.firstCommentText || '').trim() || composePostBody(post.commentText);

  let image = null;
  try {
    // Directement d'abord ; si le site refuse, par le relais de la plateforme.
    image = await fetchImage(post.imageUrl, undefined, (url) => api.media(url));
  } catch (err) {
    if (err instanceof ImageError) {
      await failPost(api, job, post, config, `image : ${err.message}`, ids, { requeue: true });
      await nextPost(config, state, job, post, false);
      return;
    }
    throw err;
  }

  let working;
  try {
    working = await tab.workTab(config);
  } catch (err) {
    await api.log(EVENT_BROWSER, err.message, { level: 'ERROR', ...ids });
    await stop(`Onglet indisponible : ${err.message}`);
    return;
  }

  // Out of circulation BEFORE the composer is touched: a crash mid-publish must
  // not hand this post to another worker. What was in flight is written down
  // first, so a restarted worker asks the page instead of publishing again.
  await setState({ inFlight: { postId: post.id, jobId: job.jobId, groupId: job.groupId, content, firstComment, willReceiveLink: post.willReceiveLink } });
  try {
    await api.markConsumed(job.jobId, post.id);
  } catch (err) {
    await setState({ inFlight: null });
    if (err instanceof ClaimLostError) {
      await api.log(EVENT_CLAIM_LOST, err.message, { level: 'ERROR', ...ids });
      await stop(`Reservation perdue : ${err.message}`);
      return;
    }
    await error(`L'API a refuse la sortie du post ${post.id} : ${err.message}`);
    await stop(`API : ${err.message}`);
    return;
  }

  let published;
  try {
    published = await publishPost(working.id, config, {
      groupId: job.groupId,
      content,
      firstComment,
      image,
      author: state.author,
      // Noté juste avant le clic « Publier » : après une interruption, on saura
      // si le post a pu partir.
      onSubmit: async () => {
        const now = await getState();
        if (now.inFlight) await setState({ inFlight: { ...now.inFlight, submitted: true } });
      },
    });
  } catch (err) {
    // publishPost turns page problems into results; anything left is a bug or a
    // closed tab. The post may be live, so it is never reported as failed.
    await error(`Erreur inattendue sur le post ${post.id} : ${err.message}`);
    published = { success: false, postPublished: true, message: `Erreur inattendue : ${err.message}`, postId: '', permalink: '', commentId: '' };
  }

  try {
    await confirm(api, job, post, published, config, ids);
  } catch (err) {
    await setState({ inFlight: null });
    if (err instanceof ClaimLostError) {
      await api.log(EVENT_CLAIM_LOST, err.message, { level: 'ERROR', ...ids });
      await stop(`Reservation perdue pendant la publication : ${err.message}`);
      return;
    }
    await error(`Confirmation impossible pour le post ${post.id} : ${err.message}`);
    await stop(`API : ${err.message}`);
    return;
  }

  // Limité par Facebook : failPost a déjà arrêté la boucle et rendu le lot.
  if (published.blocked) {
    await setState({ inFlight: null });
    return;
  }
  await setState({ inFlight: null, author: published.author || state.author, lastMessage: published.message });
  await linkRightAway(working.id, api, config, job, post, published, firstComment);
  await nextPost(config, await getState(), job, post);
}

/* Publish -> comment -> the comment takes its URL, then the next post. A
 * failure here never stops the batch: the post is live and recorded, and the
 * pass at the end of the job retries whatever is still waiting. */
async function linkRightAway(tabId, api, config, job, post, published, firstComment = '') {
  if (!published.commentId && firstComment && post.willReceiveLink && published.permalink && published.postPublished) {
    // L'id du premier commentaire n'a pas pu être lu (ou il n'a pas été posé) :
    // le retrouver ou le reposer, puis continuer comme d'habitude.
    const found = await ensureComment(tabId, api, { ...config, firstCommentText: firstComment }, { jobId: job.jobId, postId: post.id, commentExternalId: '' }, published.permalink)
      .catch((err) => ({ ok: false, reason: err.message }));
    if (!found.ok) {
      await warn(`Premier commentaire du post ${post.id} : ${found.reason} (nouvel essai a la cloture du job)`);
      return;
    }
    published.commentId = found.id;
    const saved = await api.markCommented(job.jobId, post.id, found.id).catch(() => null);
    published.linkUrl = saved && saved.url ? String(saved.url) : published.linkUrl;
  }
  if (!published.commentId) return;
  if (!published.linkUrl) {
    if (post.willReceiveLink) {
      await warn(`L'API n'a pas renvoye l'URL du post ${post.id} : son commentaire sera modifie a la cloture du job`);
    }
    return;
  }
  let tally;
  try {
    tally = await placeLinkNow(tabId, api, config, {
      jobId: job.jobId,
      postId: post.id,
      commentExternalId: published.commentId,
      url: published.linkUrl,
      externalPostUrl: published.permalink,
    });
  } catch (err) {
    await error(`Modification du commentaire interrompue : ${err.message} (nouvel essai a la cloture du job)`);
    return;
  }
  await bumpStats({ links: tally.placed });
  if (tally.failed) {
    await warn(`Commentaire du post ${post.id} non modifie : ${tally.errors.join(' ; ')} (nouvel essai a la cloture du job)`);
    await setState({ lastMessage: `Post publie ; commentaire non modifie : ${tally.errors.join(' ; ')}` });
  } else {
    await setState({ lastMessage: 'Post publie, premier commentaire modifie avec son URL' });
  }
}

/* A post that was taken out of circulation while the worker died: only the page
 * can say whether it went out, and reporting it failed would invite a second
 * publication of content that is already live. */
async function recover(config, api, state) {
  const flight = state.inFlight;
  const job = state.job;
  if (!flight || !job) {
    await setState({ inFlight: null, phase: 'claim', nextDueAt: 0 });
    return;
  }
  const post = (job.posts || []).find((p) => p.id === flight.postId) || { id: flight.postId, delayMinutes: 0, willReceiveLink: flight.willReceiveLink };
  const ids = { postId: post.id, jobId: job.jobId, metadata: { profileExternalId: config.profileExternalId, groupId: job.groupId } };
  await warn(`Reprise apres interruption du post ${flight.postId} : verification sur Facebook`);

  const working = await tab.workTab(config);
  const found = await findPublished(working.id, config, { groupId: flight.groupId, content: flight.content });
  if (found.unknown) {
    // The page could not be read at all. Leave the post consumed and stop: the
    // reservation will expire, which is the only safe outcome.
    await stop('Interruption non verifiable : verifie le groupe a la main avant de relancer');
    return;
  }
  if (found.found) {
    await warn(`Le post ${flight.postId} est en ligne : enregistre comme publie (commentaire a verifier a la main)`);
    await api.markPublished(job.jobId, post.id, found.permalink || '');
    await api.log(EVENT_PARTIAL, 'Publie mais interrompu avant la fin du parcours', { level: 'WARN', ...ids });
    await bumpStats({ published: 1 });
  } else {
    // Interrompu AVANT le clic « Publier » : rien n'est parti, il repart.
    // Après le clic, le post peut attendre la validation d'un admin sans être
    // visible : le remettre en file risquerait un doublon.
    await failPost(api, job, post, config, `Interrompu avant la publication (${found.reason})`, ids, { requeue: !flight.submitted });
  }
  await setState({ inFlight: null });
  await nextPost(config, await getState(), job, post, Boolean(found.found));
}

/* `published: false` : le post n'est pas parti (échec avant la publication).
 * Rien n'a été posté dans le groupe, donc rien à espacer : on passe au
 * suivant après une courte pause, au lieu d'attendre son délai complet —
 * qui pouvait dépasser la durée de la réservation et bloquer le profil. */
async function nextPost(config, state, job, post, published = true) {
  const index = state.index + 1;
  if (index < (job.posts || []).length) {
    const wait = published
      ? Math.max(0, post.delayMinutes * config.delayUnitSeconds * 1000)
      : AFTER_FAILURE_MS;
    const total = (job.posts || []).length;
    if (wait) await info(`Attente de ${Math.round(wait / 1000)}s avant le post ${index + 1}/${total}`);
    await setState({ index, phase: 'wait', nextDueAt: Date.now() + wait });
    return;
  }
  await setState({ index, phase: 'complete', nextDueAt: 0 });
}

async function doComplete(config, api, state) {
  const job = state.job;
  if (!job) {
    await setState({ phase: 'claim', nextDueAt: 0 });
    return;
  }
  let closed = false;
  try {
    await api.complete(job.jobId);
    closed = true;
    await info(`Job ${job.jobId} cloture`);
  } catch (err) {
    // A refusal here changes nothing that is already recorded.
    await warn(`Cloture du job ${job.jobId} impossible : ${err.message}`);
  }
  if (closed) {
    await setState({ phase: 'link', nextDueAt: 0 });
    return;
  }
  await restAfterBatch(config, state, job, 'Posts enregistres ; job non cloture, URL indisponibles');
}

async function doLink(config, api, state) {
  const job = state.job;
  if (!job) {
    await setState({ phase: 'claim', nextDueAt: 0 });
    return;
  }
  let tally = { pending: 0, placed: 0, failed: 0, errors: [] };
  try {
    const working = await tab.workTab(config);
    await info(`Recuperation des URL du job ${job.jobId}...`);
    tally = await placeLinks(working.id, api, config, { jobId: job.jobId });
  } catch (err) {
    await error(`Modification des commentaires interrompue : ${err.message}`);
    tally.errors.push(err.message);
    tally.failed += 1;
  }
  await bumpStats({ links: tally.placed });
  const message = tally.failed
    ? `Posts enregistres ; commentaires non modifies : ${tally.errors.join(' ; ')}`
    : `${tally.placed} commentaire(s) remplace(s) par leur URL`;
  await restAfterBatch(config, await getState(), job, message);
}

/* Between two batches: the pacing of the post just published, and never less
 * than the stagger -- a group seeing a burst of near-identical posts is what
 * makes Facebook refuse them. */
async function restAfterBatch(config, state, job, message) {
  const posts = job.posts || [];
  const last = posts[posts.length - 1];
  const paced = last ? last.delayMinutes * config.delayUnitSeconds : 0;
  const wait = Math.max(config.staggerSeconds, paced) * 1000;
  if (state.once) {
    await stop(message || 'Un seul lot demande, termine');
    return;
  }
  await info(`Lot termine. Prochaine reservation dans ${Math.round(wait / 1000)}s`);
  await setState({
    job: null,
    index: 0,
    phase: 'claim',
    nextDueAt: Date.now() + wait,
    lastMessage: message || 'Lot termine',
  });
}

// -- confirmations ---------------------------------------------------------

/* Tell the API what became of the post. Port of scheduler._confirm. */
async function confirm(api, job, post, published, config, ids) {
  if (published.success) {
    await api.markPublished(job.jobId, post.id, published.permalink);
    await recordComment(api, job, post, published, ids);
    await api.log(EVENT_PUBLISHED, `Published: ${published.permalink || post.id}`, { ...ids, facebookUrl: published.permalink || undefined });
    await info(`[OK] ${post.id} -> ${published.permalink || '(sans lien)'}`);
    await bumpStats({ published: 1 });
    return;
  }

  if (published.postPublished) {
    // On Facebook even though a later step failed, or sitting in the moderation
    // queue. Recording it as failed would invite a re-run that posts it twice.
    const message = String(published.message || '').toLowerCase();
    const pending = message.includes('validation') || message.includes('approval') || message.includes('moderateur');
    const linkMissing = message.includes('commentaire');
    // En attente de validation : la plateforme le garde en attente, et ce
    // profil reviendra voir après chacun de ses lots.
    await api.markPublished(job.jobId, post.id, published.permalink, { pendingApproval: pending });
    await recordComment(api, job, post, published, ids);
    await api.log(
      pending ? EVENT_PENDING : linkMissing ? EVENT_LINK_NOT_ADDED : EVENT_PARTIAL,
      published.message,
      { level: 'WARN', ...ids },
    );
    if (pending) await warn(`Post ${post.id} en attente d'un moderateur : ${published.message}`);
    else await error(`Post ${post.id} est en ligne mais incomplet : ${published.message}`);
    await bumpStats({ published: 1 });
    return;
  }

  // Ni succès ni « peut-être publié » : l'échec est arrivé avant le clic
  // « Publier ». Rien n'est sur Facebook, le post peut repartir.
  await failPost(api, job, post, config, published.message, ids, { requeue: true, blocked: Boolean(published.blocked) });
  if (published.blocked) {
    // Facebook limite ce compte : la plateforme l'a mis en pause et a rendu le
    // reste du lot. Insister aggraverait la sanction : on s'arrête ici.
    await setState({ job: null, index: 0, phase: 'claim' });
    await stop('Facebook limite ce compte : profil en pause (voir le Pilotage)');
  }
}

/* Tell the API which comment was written, so the link can reach it. Without
 * this identifier the comment cannot be found again. */
async function recordComment(api, job, post, published, ids) {
  if (!published.commentId) {
    if (post.willReceiveLink) {
      await warn(`Aucun id de commentaire pour le post ${post.id} : son lien ne pourra pas etre pose`);
      await api.log(EVENT_NO_COMMENT_ID, 'Comment written but its id could not be read', { level: 'WARN', ...ids });
    }
    return !post.willReceiveLink;
  }
  try {
    const saved = await api.markCommented(job.jobId, post.id, published.commentId);
    // The API answers with the post's URL, so the comment can take it right
    // away instead of waiting for the whole job to close.
    published.linkUrl = saved && saved.url ? String(saved.url) : '';
    await info(`Commentaire ${published.commentId} enregistre pour le post ${post.id}`);
    return true;
  } catch (err) {
    if (err instanceof ClaimLostError) throw err;
    await warn(`Commentaire non enregistre pour le post ${post.id} : ${err.message}`);
    return false;
  }
}

async function failPost(api, job, post, config, reason, ids, { requeue = false, blocked = false } = {}) {
  await error(`Post ${post.id} en echec : ${reason}${requeue ? ' (rien n’est parti : il repart dans la file)' : ''}`);
  await api.markFailed(job.jobId, post.id, reason, { requeue, blocked });
  await api.log(EVENT_FAILED, reason, { level: 'ERROR', ...ids });
  await bumpStats({ failed: 1 });
}

async function bumpStats(delta) {
  const state = await getState();
  const stats = { ...state.stats };
  for (const [key, value] of Object.entries(delta)) stats[key] = (stats[key] || 0) + value;
  await setState({ stats });
}

// -- helpers ---------------------------------------------------------------

/* The numeric Facebook group ID the composer needs. `Group.url` is free text in
 * the API and often carries a slug, while reading a post's own ID depends on a
 * numeric group in the link -- so `externalId` is the source of truth, and a
 * URL is only accepted when it ends in digits. Port of worker.resolve_group_id. */
export function resolveGroupId(job) {
  const externalId = String(job.groupExternalId || '').trim();
  if (/^\d+$/.test(externalId)) return externalId;
  const tail = String(job.groupUrl || '').trim().replace(/\/+$/, '').split('/').pop();
  if (/^\d+$/.test(tail)) return tail;
  throw new ApiError(
    `Le groupe "${job.groupName}" n'a pas d'ID Facebook numerique (externalId=${job.groupExternalId || 'vide'}, url=${job.groupUrl || 'vide'}). Corrige son externalId dans l'admin.`,
  );
}

/* Warn up front when the batch cannot possibly fit in the reservation.
 * Rend le message quand c'est le cas, pour que l'état le porte aussi. */
async function warnAboutClaimWindow(job, config) {
  if (!job.claimExpiresAt) return '';
  const left = job.claimExpiresAt - Date.now();
  const needed =
    job.posts.slice(0, -1).reduce((sum, p) => sum + p.delayMinutes, 0)
    * config.delayUnitSeconds
    * 1000;
  if (needed <= left) return '';
  const message =
    `Ce lot demande ~${Math.round(needed / 60000)} min d'attente mais la reservation `
    + `dure ${Math.round(left / 60000)} min : les posts restants repartiront au pool `
    + 'et le lien du premier ne sera pas pose. Monte CLAIM_TTL_MINUTES sur l’API, '
    + 'ou baisse les delais des posts.';
  await warn(message);
  return message;
}

export { HEARTBEAT };
