/* FB Post Checker — le tour du vérificateur.
 *
 * Toutes les N minutes (si activé) : demander à la plateforme un lot de
 * publications à contrôler, ouvrir chacune dans un onglet, lire la page,
 * supprimer celles qui sont en ligne SANS le lien, et rapporter. C'est la
 * plateforme qui décide ensuite : vérifié, republié, ou à traiter.
 */
importScripts('config.js');

const ALARM = 'fpc-round';
const LOG_SIZE = 60;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function settings() {
  const stored = await chrome.storage.local.get(['apiBase', 'apiKey', 'profileExternalId', 'enabled', 'members']);
  return {
    ...self.FPC_CONFIG,
    ...Object.fromEntries(Object.entries(stored).filter(([, v]) => v !== undefined && v !== '')),
  };
}

async function log(level, message, extra = {}) {
  const { logs = [] } = await chrome.storage.local.get('logs');
  logs.unshift({ at: new Date().toISOString(), level, message, ...extra });
  await chrome.storage.local.set({ logs: logs.slice(0, LOG_SIZE) });
}

async function setStatus(patch) {
  const { status = {} } = await chrome.storage.local.get('status');
  await chrome.storage.local.set({ status: { ...status, ...patch } });
}

async function api(cfg, path, body) {
  const res = await fetch(`${cfg.apiBase.replace(/\/+$/, '')}${path}`, {
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
      });
    } catch (err) {
      await log('error', `${what} : rapport refusé (${task.group.name}) : ${err.message}`);
    }
    done += 1;
    const [min, max] = cfg.pauseSeconds;
    await sleep((min + Math.random() * (max - min)) * 1000);
  }
  return done;
}

let round = null;

/** Un passage. Jamais deux en même temps. */
function runRound(reason) {
  if (!round) round = doRound(reason).finally(() => (round = null));
  return round;
}

async function doRound(reason) {
  const cfg = await settings();
  if (!cfg.apiKey || !cfg.profileExternalId) {
    await setStatus({ state: 'config', message: 'Saisissez la clé d’API et l’identifiant du profil', at: new Date().toISOString() });
    return;
  }
  await setStatus({ state: 'busy', message: `Passage (${reason})…`, at: new Date().toISOString() });
  let claim;
  try {
    claim = await api(cfg, '/verify/claim', { profileExternalId: cfg.profileExternalId, limit: cfg.batchSize });
  } catch (err) {
    await log('error', `Réservation refusée : ${err.message}`);
    await setStatus({ state: 'error', message: err.message, at: new Date().toISOString() });
    return;
  }
  const tasks = claim.tasks || [];
  const tab = await chrome.tabs.create({ url: 'about:blank', active: true });
  let done = 0;
  let members = 0;
  try {
    for (const task of tasks) {
      const { enabled } = await chrome.storage.local.get('enabled');
      if (reason === 'auto' && enabled === false) break;
      await setStatus({ state: 'busy', message: `${done + 1}/${tasks.length} · ${task.group.name}`, at: new Date().toISOString() });
      let verdict;
      try {
        verdict = await checkOne(cfg, tab.id, task);
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
          { result: answer.result, postUrl: verdict.postUrl || task.postUrl, title: task.postTitle },
        );
      } catch (err) {
        await log('error', `Rapport refusé (${task.group.name}) : ${err.message}`);
      }
      done += 1;
      if (done < tasks.length) {
        const [min, max] = cfg.pauseSeconds;
        await sleep((min + Math.random() * (max - min)) * 1000);
      }
    }
    if (cfg.members !== false) members = await memberRound(cfg, tab.id, reason);
  } finally {
    chrome.tabs.remove(tab.id).catch(() => {});
  }
  await setStatus({
    state: 'idle',
    message: done || members ? `${done} publication(s) vérifiée(s), ${members} adhésion(s)/pré-approbation(s)` : 'Rien à faire pour l’instant',
    at: new Date().toISOString(),
  });
}

async function schedule() {
  const cfg = await settings();
  await chrome.alarms.clear(ALARM);
  if (cfg.enabled) chrome.alarms.create(ALARM, { periodInMinutes: cfg.everyMinutes, delayInMinutes: 0.1 });
}

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM) runRound('auto');
});
chrome.runtime.onInstalled.addListener(schedule);
chrome.runtime.onStartup.addListener(schedule);
chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
  if (msg?.type === 'schedule') schedule().then(() => reply({ ok: true }));
  else if (msg?.type === 'run-now') {
    runRound('manuel');
    reply({ ok: true });
  } else return false;
  return true;
});
