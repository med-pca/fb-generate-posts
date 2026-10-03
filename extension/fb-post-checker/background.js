/* Modérateur · PostFlow — deux missions SÉPARÉES, chacune avec son état,
 * ses compteurs du jour et son historique :
 *
 *   - « posts »   : rouvrir les posts publiés, vérifier le lien, supprimer
 *                   ceux qui n'en ont pas ; la plateforme republie ;
 *   - « members » : nos profils dans les groupes — contrôles demandés par
 *                   l'admin, adhésions à accepter, pré-approbations.
 *
 * Chacune se lance seule (bouton, demande de l'admin) ou automatiquement
 * selon son interrupteur. Jamais deux en même temps : elles se suivent.
 */
importScripts('config.js');

const ALARM = 'fpc-round';
/** Chaque minute : relire ses réglages sur la plateforme (suspendu, taille
 * de lot, fréquence, adhésions) et lancer un passage demandé par l'admin. */
const CONTROL = 'fpc-control';
const LOG_SIZE = 60;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** La mission en cours : ses journaux et son état vont dans sa rubrique. */
let currentCat = 'posts';
const today = () => new Date().toISOString().slice(0, 10);

async function settings() {
  const stored = await chrome.storage.local.get(['apiBase', 'apiKey', 'profileExternalId', 'enabled', 'members', 'posts', 'server']);
  const cfg = {
    ...self.FPC_CONFIG,
    ...Object.fromEntries(Object.entries(stored).filter(([, v]) => v !== undefined && v !== '')),
  };
  // Les réglages de la plateforme (rubrique Modérateurs) priment.
  const server = stored.server;
  if (server) {
    cfg.batchSize = server.batchSize ?? cfg.batchSize;
    cfg.everyMinutes = server.everyMinutes ?? cfg.everyMinutes;
    if (server.members === false) cfg.members = false;
    cfg.paused = Boolean(server.paused);
  }
  return cfg;
}

/** Une ligne d'historique, dans la rubrique de la mission (`posts`,
 * `members`, ou `system`). `count` incrémente le compteur du jour. */
async function log(level, message, extra = {}) {
  const cat = extra.cat || currentCat;
  const key = `logs_${cat}`;
  const stored = await chrome.storage.local.get([key, `stats_${cat}`]);
  const logs = stored[key] || [];
  logs.unshift({ at: new Date().toISOString(), level, message, ...extra });
  const patch = { [key]: logs.slice(0, LOG_SIZE) };
  if (extra.count) {
    let stats = stored[`stats_${cat}`];
    if (!stats || stats.day !== today()) stats = { day: today(), counts: {} };
    for (const c of [].concat(extra.count)) stats.counts[c] = (stats.counts[c] || 0) + 1;
    patch[`stats_${cat}`] = stats;
  }
  await chrome.storage.local.set(patch);
}

/** L'état d'une mission (ou `system` : configuration, suspension, réseau). */
async function setStatus(catOrPatch, maybePatch) {
  const cat = typeof catOrPatch === 'string' ? catOrPatch : currentCat;
  const patch = typeof catOrPatch === 'string' ? maybePatch : catOrPatch;
  const key = `status_${cat}`;
  const { [key]: status = {} } = await chrome.storage.local.get(key);
  await chrome.storage.local.set({ [key]: { ...status, ...patch } });
}

/** L'adresse de l'API : la plateforme sert ses routes sous /api. On accepte
 * « https://post.pulserecipe.com » comme « …/api ». */
function apiRoot(base) {
  const root = String(base || '').trim().replace(/\/+$/, '');
  return /\/api$/.test(root) ? root : `${root}/api`;
}

async function api(cfg, path, body) {
  const res = await fetch(`${apiRoot(cfg.apiBase)}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': cfg.apiKey },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = Array.isArray(data.message) ? data.message.join(', ') : data.message;
    throw new Error(msg || `HTTP ${res.status}`);
  }
  return data;
}

/** Ouvrir l'URL et attendre la fin du chargement. */
async function open(tabId, url) {
  await chrome.tabs.update(tabId, { url });
  await new Promise((resolve) => {
    const timer = setTimeout(done, 30_000);
    function done() {
      clearTimeout(timer);
      chrome.tabs.onUpdated.removeListener(listen);
      resolve();
    }
    function listen(id, info) {
      if (id === tabId && info.status === 'complete') done();
    }
    chrome.tabs.onUpdated.addListener(listen);
  });
}

async function inPage(tabId, func, args = []) {
  await chrome.scripting.executeScript({ target: { tabId }, files: ['check.js', 'members.js'] });
  const [result] = await chrome.scripting.executeScript({ target: { tabId }, func, args });
  return result?.result;
}

/** Contrôler une publication ; supprimer si elle est en ligne sans lien. */
async function checkOne(cfg, tabId, task) {
  const settleMs = cfg.settleSeconds * 1000;
  // Publié sans adresse : on la cherche dans le groupe, puis on la rapporte
  // pour qu'elle soit gardée sur la plateforme.
  let foundUrl;
  if (!task.postUrl) {
    if (!task.group.url) return { outcome: 'unreachable', detail: 'ni adresse du post, ni adresse du groupe' };
    await open(tabId, task.group.url);
    const located = await inPage(tabId, (t, ms) => self.FPC.locate(t, { settleMs: ms }), [task, settleMs]);
    if (!located?.found) return { outcome: 'unreachable', detail: located?.detail || 'groupe illisible' };
    foundUrl = located.url;
    task = { ...task, postUrl: foundUrl };
    await log('ok', `${task.group.name} · adresse retrouvée : ${foundUrl}`, { postUrl: foundUrl, title: task.postTitle });
  }
  const verdict = await checkPost(cfg, tabId, task, settleMs);
  return foundUrl ? { ...verdict, postUrl: foundUrl } : verdict;
}

async function checkPost(cfg, tabId, task, settleMs) {
  await open(tabId, task.postUrl);
  const seen = await inPage(tabId, (t, ms) => self.FPC.inspect(t, { settleMs: ms }), [task, settleMs]);
  if (!seen) return { outcome: 'unreachable', detail: 'page illisible' };
  if (seen.outcome !== 'missing_link') return seen;

  const removal = await inPage(tabId, () => self.FPC.remove());
  if (!removal?.deleted) {
    return { ...seen, deleted: false, detail: `${seen.detail} — ${removal?.detail || 'suppression impossible'}` };
  }
  // On ne croit pas le clic : on rouvre le post et on regarde qu'il est parti.
  await open(tabId, task.postUrl);
  const after = await inPage(tabId, (t, ms) => self.FPC.inspect(t, { settleMs: ms }), [task, settleMs]);
  const gone = after && (after.outcome === 'missing_post' || after.outcome === 'unreachable');
  return {
    ...seen,
    deleted: Boolean(gone),
    detail: gone ? `${seen.detail} — supprimé` : `${seen.detail} — suppression non confirmée`,
  };
}

/* ── Nos profils dans les groupes : adhésion, pré-approbation ─────────── */

const groupBase = (url) => String(url || '').split(/[?#]/)[0].replace(/\/+$/, '');

/** Une tâche pour UN de nos profils, désigné par son identifiant Facebook. */
async function memberOne(cfg, tabId, task) {
  const base = groupBase(task.group.url);
  if (!base) return { outcome: 'unreachable', detail: 'adresse du groupe inconnue' };
  const settleMs = cfg.settleSeconds * 1000;
  const member = task.member;
  if (task.kind === 'approve') {
    await open(tabId, `${base}/member-requests`);
    return inPage(tabId, (m, ms) => self.FPM.approve(m, { settleMs: ms }), [member, settleMs]);
  }
  // Pré-approuver : d'abord depuis sa page de membre, sinon depuis ses
  // publications en attente.
  await open(tabId, `${base}/user/${member.facebookUserId}/`);
  await sleep(settleMs);
  const fromPage = await inPage(tabId, (m) => self.FPM.preapproveFromMemberPage(m), [member]);
  if (fromPage && (fromPage.outcome === 'done' || fromPage.outcome === 'already')) return fromPage;
  await open(tabId, `${base}/pending_posts`);
  await sleep(settleMs);
  const fromPending = await inPage(tabId, (m) => self.FPM.preapproveFromPending(m), [member]);
  if (fromPending && (fromPending.outcome === 'done' || fromPending.outcome === 'already')) return fromPending;
  // Les deux chemins ont échoué : on garde le constat le plus parlant.
  const worst = fromPage?.outcome === 'no_permission' && fromPending?.outcome === 'no_permission' ? 'no_permission' : 'not_found';
  return { outcome: worst, detail: [fromPage?.detail, fromPending?.detail].filter(Boolean).join(' ; ') };
}

async function memberRound(cfg, tabId, reason) {
  let claim;
  try {
    claim = await api(cfg, '/verify/members/claim', { profileExternalId: cfg.profileExternalId, limit: cfg.batchSize });
  } catch (err) {
    await log('error', `Adhésions : réservation refusée : ${err.message}`);
    return 0;
  }
  let done = 0;
  for (const task of claim.tasks || []) {
    const { enabled } = await chrome.storage.local.get('enabled');
    if (reason === 'auto' && enabled === false) break;
    const what = task.kind === 'approve' ? 'Adhésion' : 'Pré-approbation';
    await setStatus({ state: 'busy', message: `${what} · ${task.member.name} · ${task.group.name}`, at: new Date().toISOString() });
    let verdict;
    try {
      verdict = (await memberOne(cfg, tabId, task)) || { outcome: 'unreachable', detail: 'page illisible' };
    } catch (err) {
      verdict = { outcome: 'unreachable', detail: `erreur : ${err.message}` };
    }
    try {
      const answer = await api(cfg, `/verify/members/${task.taskId}/result`, {
        profileExternalId: cfg.profileExternalId,
        kind: task.kind,
        outcome: verdict.outcome,
        // Toujours l'identifiant REÇU : la plateforme vérifie que c'est bien
        // celui de ce profil.
        facebookUserId: task.member.facebookUserId,
        detail: verdict.detail,
      });
      const ok = verdict.outcome === 'done' || verdict.outcome === 'already';
      await log(ok ? 'ok' : answer.result === 'gave_up' ? 'error' : 'warn', `${what} · ${task.member.name} · ${task.group.name} · ${verdict.detail || verdict.outcome}`, {
        result: ok ? 'member_done' : answer.result,
        count: ok ? (task.kind === 'approve' ? 'approved' : 'preapproved') : 'failed',
      });
    } catch (err) {
      await log('error', `${what} : rapport refusé (${task.group.name}) : ${err.message}`, { count: 'failed' });
    }
    done += 1;
    const [min, max] = cfg.pauseSeconds;
    await sleep((min + Math.random() * (max - min)) * 1000);
  }
  return done;
}

/* ── Contrôle de la pré-approbation (demandé par l'admin) ───────────── */

/** Pour chacun : ouvrir sa page de membre, lire si c'est déjà fait ou pas.
 * En mode « fix », pré-approuver ce qui manque ; en mode « check », rien
 * n'est cliqué. Chaque constat part à la plateforme, qui le journalise. */
async function auditRound(cfg, tabId, reason) {
  let claim;
  try {
    claim = await api(cfg, '/verify/members/audit/claim', { profileExternalId: cfg.profileExternalId, limit: cfg.batchSize });
  } catch (err) {
    await log('error', `Contrôle : réservation refusée : ${err.message}`);
    return 0;
  }
  let done = 0;
  for (const task of claim.tasks || []) {
    const base = groupBase(task.group.url);
    await setStatus({ state: 'busy', message: `Contrôle · ${task.member.name} · ${task.group.name}`, at: new Date().toISOString() });
    let verdict;
    try {
      if (!base) throw new Error('adresse du groupe inconnue');
      await open(tabId, `${base}/user/${task.member.facebookUserId}/`);
      await sleep(cfg.settleSeconds * 1000);
      verdict = (await inPage(tabId, (m) => self.FPM.auditPreapproval(m), [task.member])) || { outcome: 'unreachable', detail: 'page illisible' };
      if (task.mode === 'fix' && verdict.outcome === 'not_done') {
        const fixed = await inPage(tabId, (m) => self.FPM.preapproveFromMemberPage(m), [task.member]);
        verdict = fixed?.outcome === 'done'
          ? { outcome: 'fixed', detail: `${verdict.detail} → pré-approuvé` }
          : { outcome: 'not_done', detail: `${verdict.detail} → correction impossible : ${fixed?.detail || 'page illisible'}` };
      }
    } catch (err) {
      verdict = { outcome: 'unreachable', detail: `erreur : ${err.message}` };
    }
    try {
      await api(cfg, `/verify/members/audit/${task.taskId}/result`, {
        profileExternalId: cfg.profileExternalId,
        outcome: verdict.outcome,
        facebookUserId: task.member.facebookUserId,
        detail: verdict.detail,
      });
      const LABEL = { already: 'déjà fait', not_done: 'PAS fait', fixed: 'corrigé', no_permission: 'pas l’option', not_found: 'option introuvable', unreachable: 'illisible' };
      await log(
        verdict.outcome === 'already' || verdict.outcome === 'fixed' ? 'ok' : verdict.outcome === 'not_done' ? 'warn' : 'error',
        `Contrôle · ${task.member.name} · ${task.group.name} · ${LABEL[verdict.outcome] || verdict.outcome} — ${verdict.detail || ''}`,
        { result: 'audit', count: `audit_${verdict.outcome}` },
      );
    } catch (err) {
      await log('error', `Contrôle : rapport refusé (${task.group.name}) : ${err.message}`);
    }
    done += 1;
    const [min, max] = cfg.pauseSeconds;
    await sleep((min + Math.random() * (max - min)) * 1000);
  }
  return done;
}

/** Vérifier les posts publiés. */
async function postsRound(cfg, tabId, reason) {
  let claim;
  try {
    claim = await api(cfg, '/verify/claim', { profileExternalId: cfg.profileExternalId, limit: cfg.batchSize });
  } catch (err) {
    await log('error', `Réservation refusée : ${err.message}`);
    await setStatus({ state: 'error', message: err.message, at: new Date().toISOString() });
    return 0;
  }
  const tasks = claim.tasks || [];
  let done = 0;
  for (const task of tasks) {
    const { enabled } = await chrome.storage.local.get('enabled');
    if (reason === 'auto' && enabled === false) break;
    await setStatus({ state: 'busy', message: `${done + 1}/${tasks.length} · ${task.group.name}`, at: new Date().toISOString() });
    let verdict;
    try {
      verdict = await checkOne(cfg, tabId, task);
    } catch (err) {
      verdict = { outcome: 'unreachable', detail: `erreur : ${err.message}` };
    }
    try {
      const answer = await api(cfg, `/verify/${task.targetId}/result`, {
        profileExternalId: cfg.profileExternalId,
        outcome: verdict.outcome,
        detail: verdict.detail,
        deleted: verdict.deleted,
        postUrl: verdict.postUrl,
      });
      await log(
        verdict.outcome === 'ok' ? 'ok' : answer.result === 'needs_action' ? 'error' : 'warn',
        `${task.group.name} · ${verdict.detail}`,
        {
          result: answer.result,
          postUrl: verdict.postUrl || task.postUrl,
          title: task.postTitle,
          count: [verdict.outcome, ...(verdict.deleted ? ['deleted'] : []), ...(answer.result === 'requeued' ? ['requeued'] : [])],
        },
      );
    } catch (err) {
      await log('error', `Rapport refusé (${task.group.name}) : ${err.message}`, { count: 'failed' });
    }
    done += 1;
    if (done < tasks.length) {
      const [min, max] = cfg.pauseSeconds;
      await sleep((min + Math.random() * (max - min)) * 1000);
    }
  }
  return done;
}

/** Les missions se suivent, jamais ensemble : une seule file. */
let round = Promise.resolve();
const queued = new Set();
let running = null;

function runRound(kind, reason) {
  if (queued.has(kind)) return round;
  queued.add(kind);
  round = round.then(() => {
    queued.delete(kind);
    running = kind;
    return doRound(kind, reason).catch(async (err) => {
      await log('error', `Erreur inattendue : ${err.message}`, { cat: kind });
    });
  }).finally(() => (running = null));
  return round;
}

async function doRound(kind, reason) {
  currentCat = kind;
  const cfg = await settings();
  if (!cfg.apiKey || !cfg.profileExternalId) {
    await setStatus('system', { state: 'config', message: 'Saisissez la clé d’API et l’identifiant du profil', at: new Date().toISOString() });
    return;
  }
  if (cfg.paused) {
    await setStatus('system', { state: 'config', message: 'Suspendu par l’administrateur (rubrique Modérateurs)', at: new Date().toISOString() });
    return;
  }
  if (kind === 'members' && cfg.members === false && reason === 'auto') return;
  if (kind === 'posts' && cfg.posts === false && reason === 'auto') return;
  await setStatus({ state: 'busy', message: `En cours (${reason})…`, at: new Date().toISOString() });
  const tab = await chrome.tabs.create({ url: 'about:blank', active: true });
  let done = 0;
  try {
    if (kind === 'posts') {
      done = await postsRound(cfg, tab.id, reason);
    } else {
      // Les contrôles demandés par l'admin passent avant le reste.
      done += await auditRound(cfg, tab.id, reason);
      done += await memberRound(cfg, tab.id, reason);
    }
  } finally {
    chrome.tabs.remove(tab.id).catch(() => {});
  }
  await setStatus({
    state: 'idle',
    message: done
      ? kind === 'posts'
        ? `${done} post(s) vérifié(s)`
        : `${done} tâche(s) faite(s) (contrôles, adhésions, pré-approbations)`
      : 'Rien à faire pour l’instant',
    at: new Date().toISOString(),
  });
}

async function schedule() {
  const cfg = await settings();
  await chrome.alarms.clear(ALARM);
  if (cfg.enabled) chrome.alarms.create(ALARM, { periodInMinutes: cfg.everyMinutes, delayInMinutes: 0.1 });
  chrome.alarms.create(CONTROL, { periodInMinutes: 1, delayInMinutes: 0.05 });
}

/** Relire ses réglages ; lancer le passage demandé par l'admin. */
async function poll() {
  const cfg = await settings();
  if (!cfg.apiKey || !cfg.profileExternalId) return;
  let server;
  try {
    server = await api(cfg, '/verify/control', {
      profileExternalId: cfg.profileExternalId,
      agent: `checker ${chrome.runtime.getManifest().version}`,
    });
  } catch (err) {
    await setStatus('system', { state: 'error', message: `Plateforme : ${err.message}`, at: new Date().toISOString() });
    return;
  }
  await setStatus('system', { state: server.paused ? 'config' : 'ok', message: server.paused ? 'Suspendu par l’administrateur (rubrique Modérateurs)' : 'Connecté à la plateforme', at: new Date().toISOString() });
  const { server: before, lastRunRequest, lastMembersRunRequest } = await chrome.storage.local.get(['server', 'lastRunRequest', 'lastMembersRunRequest']);
  await chrome.storage.local.set({ server });
  if (before?.everyMinutes !== server.everyMinutes) await schedule();
  if (server.paused) return;
  // Première relecture : une ancienne demande ne relance rien.
  if (!before) {
    await chrome.storage.local.set({ lastRunRequest: server.runRequestedAt || null, lastMembersRunRequest: server.membersRunRequestedAt || null });
    return;
  }
  if (server.runRequestedAt && server.runRequestedAt !== lastRunRequest) {
    await chrome.storage.local.set({ lastRunRequest: server.runRequestedAt });
    await log('ok', 'Vérification des posts demandée par l’administrateur', { cat: 'posts' });
    runRound('posts', 'demande de l’admin');
  }
  if (server.membersRunRequestedAt && server.membersRunRequestedAt !== lastMembersRunRequest) {
    await chrome.storage.local.set({ lastMembersRunRequest: server.membersRunRequestedAt });
    await log('ok', 'Tâches « nos profils » demandées par l’administrateur', { cat: 'members' });
    runRound('members', 'demande de l’admin');
  }
}

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === ALARM) {
    const cfg = await settings();
    if (cfg.posts !== false) runRound('posts', 'auto');
    if (cfg.members !== false) runRound('members', 'auto');
  }
  if (alarm.name === CONTROL) poll();
});
chrome.runtime.onInstalled.addListener(schedule);
chrome.runtime.onStartup.addListener(schedule);
chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
  if (msg?.type === 'schedule') schedule().then(() => reply({ ok: true }));
  else if (msg?.type === 'run-now') {
    runRound(msg.kind === 'members' ? 'members' : 'posts', 'manuel');
    reply({ ok: true });
  } else return false;
  return true;
});
