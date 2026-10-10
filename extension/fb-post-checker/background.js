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

/* ── Rythme humain ──────────────────────────────────────────────────────
 * Un compte modérateur a été désactivé par Facebook : il agissait toutes les
 * 10 minutes pile, 24 h/24, sans jamais lire. Désormais :
 *   - il ne travaille qu'à ses heures (réglées sur la plateforme) ;
 *   - il ne dépasse pas N actions par heure ni par jour ;
 *   - ses passages tombent à intervalles irréguliers, avec de longues pauses ;
 *   - sur chaque page, il prend le temps de lire et fait défiler ;
 *   - avant une action sensible (supprimer, accepter, pré-approuver), il marque
 *     un temps. */
const rand = (min, max) => min + Math.random() * (max - min);
const between = (pair) => (Array.isArray(pair) ? rand(pair[0], pair[1]) : Number(pair) || 0);

/** L'heure et la date dans le fuseau du modérateur. */
function clockIn(timezone) {
  try {
    const parts = Object.fromEntries(
      new Intl.DateTimeFormat('en-GB', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false })
        .formatToParts(new Date())
        .map((p) => [p.type, p.value]),
    );
    const hour = Number(parts.hour) % 24;
    return { minutes: hour * 60 + Number(parts.minute), day: `${parts.year}-${parts.month}-${parts.day}`, hour: `${parts.year}-${parts.month}-${parts.day}T${hour}` };
  } catch {
    const d = new Date();
    return { minutes: d.getHours() * 60 + d.getMinutes(), day: d.toISOString().slice(0, 10), hour: d.toISOString().slice(0, 13) };
  }
}
const hhmm = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

/** Est-ce l'heure de travailler ? (une plage qui passe minuit est permise) */
function atWork(cfg) {
  const start = Number(cfg.windowStart), end = Number(cfg.windowEnd);
  if (!Number.isFinite(start) || !Number.isFinite(end) || start === end) return true;
  const now = clockIn(cfg.timezone).minutes;
  return start < end ? now >= start && now < end : now >= start || now < end;
}

/** Ce qu'il reste à faire cette heure-ci et aujourd'hui. */
async function budget(cfg) {
  const { day, hour } = clockIn(cfg.timezone);
  let { pace } = await chrome.storage.local.get('pace');
  if (!pace || pace.day !== day) pace = { day, hour, dayCount: 0, hourCount: 0 };
  if (pace.hour !== hour) pace = { ...pace, hour, hourCount: 0 };
  await chrome.storage.local.set({ pace });
  return {
    left: Math.max(0, Math.min(cfg.dailyLimit - pace.dayCount, cfg.hourlyLimit - pace.hourCount)),
    reason: pace.dayCount >= cfg.dailyLimit ? `quota du jour atteint (${cfg.dailyLimit} actions)` : `quota de l’heure atteint (${cfg.hourlyLimit} actions)`,
  };
}
async function spend() {
  const { pace } = await chrome.storage.local.get('pace');
  if (pace) await chrome.storage.local.set({ pace: { ...pace, dayCount: pace.dayCount + 1, hourCount: pace.hourCount + 1 } });
}

/** La pause entre deux actions ; une fois sur dix, bien plus longue. */
async function humanPause(cfg) {
  const long = Math.random() < 0.1;
  await sleep((long ? rand(180, 420) : between(cfg.pauseSeconds)) * 1000);
}

/** Lire la page comme quelqu'un : attendre qu'elle s'affiche, faire défiler
 * un peu, revenir. Rien n'est cliqué. */
async function readLikeHuman(tabId, cfg) {
  await sleep(between(cfg.settleSeconds) * 1000);
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      func: async () => {
        const wait = (ms) => new Promise((r) => setTimeout(r, ms));
        const steps = 2 + Math.floor(Math.random() * 3);
        for (let i = 0; i < steps; i += 1) {
          window.scrollBy({ top: 200 + Math.random() * 500, behavior: 'smooth' });
          await wait(700 + Math.random() * 1600);
        }
        window.scrollTo({ top: Math.random() * 200, behavior: 'smooth' });
        await wait(600 + Math.random() * 900);
      },
    });
  } catch {
    /* page sans script (erreur, connexion) : on lit sans défiler */
  }
}

/** Le temps qu'on met avant un geste qui compte. */
const beforeAction = () => sleep(rand(2000, 5000));

/* ── De vrais gestes (chrome.debugger) ──────────────────────────────────
 * La page (human.js) dit où viser ; ici, la souris y va en courbe, à vitesse
 * variable, appuie puis relâche ; le texte se tape lettre par lettre, avec
 * des hésitations. Des événements « de confiance », comme une main. */
const attached = new Set();
const pointer = new Map();
const cdp = (tabId, method, params = {}) => chrome.debugger.sendCommand({ tabId }, method, params);

async function attach(tabId) {
  if (attached.has(tabId)) return;
  await chrome.debugger.attach({ tabId }, '1.3');
  attached.add(tabId);
}
async function releaseInput(tabId) {
  pointer.delete(tabId);
  if (!attached.has(tabId)) return;
  attached.delete(tabId);
  await chrome.debugger.detach({ tabId }).catch(() => null);
}
chrome.debugger?.onDetach?.addListener((source) => { attached.delete(source.tabId); pointer.delete(source.tabId); });

/** Un trajet de souris : une courbe de Bézier, quelques à-coups, plus lent
 * à l'arrivée. */
async function moveTo(tabId, x, y) {
  const from = pointer.get(tabId) || { x: x + rand(-300, 300), y: y + rand(-200, 200) };
  const ctrl = { x: (from.x + x) / 2 + rand(-120, 120), y: (from.y + y) / 2 + rand(-90, 90) };
  const steps = 14 + Math.floor(Math.random() * 18);
  for (let i = 1; i <= steps; i += 1) {
    const t = i / steps;
    const ease = 1 - (1 - t) * (1 - t);
    const px = (1 - ease) * (1 - ease) * from.x + 2 * (1 - ease) * ease * ctrl.x + ease * ease * x;
    const py = (1 - ease) * (1 - ease) * from.y + 2 * (1 - ease) * ease * ctrl.y + ease * ease * y;
    await cdp(tabId, 'Input.dispatchMouseEvent', { type: 'mouseMoved', x: px, y: py });
    await sleep(rand(6, 22));
  }
  pointer.set(tabId, { x, y });
}

const KEYS = { Enter: { code: 'Enter', windowsVirtualKeyCode: 13, text: '\r' }, Escape: { code: 'Escape', windowsVirtualKeyCode: 27 }, Tab: { code: 'Tab', windowsVirtualKeyCode: 9 } };

async function humanInput(tabId, msg) {
  if (!tabId) return { ok: false, reason: 'pas d’onglet' };
  await attach(tabId);
  if (msg.action === 'move' || msg.action === 'click') {
    await moveTo(tabId, msg.x, msg.y);
    if (msg.action === 'click') {
      await sleep(rand(60, 220));
      await cdp(tabId, 'Input.dispatchMouseEvent', { type: 'mousePressed', x: msg.x, y: msg.y, button: 'left', clickCount: 1 });
      await sleep(rand(55, 140));
      await cdp(tabId, 'Input.dispatchMouseEvent', { type: 'mouseReleased', x: msg.x, y: msg.y, button: 'left', clickCount: 1 });
    }
    return { ok: true };
  }
  if (msg.action === 'type') {
    for (const ch of String(msg.text || '')) {
      await cdp(tabId, 'Input.insertText', { text: ch });
      await sleep(Math.random() < 0.06 ? rand(350, 900) : rand(70, 210));
    }
    return { ok: true };
  }
  if (msg.action === 'key') {
    const k = KEYS[msg.key];
    if (!k) return { ok: false, reason: `touche inconnue : ${msg.key}` };
    await cdp(tabId, 'Input.dispatchKeyEvent', { type: 'keyDown', key: msg.key, ...k });
    await sleep(rand(40, 110));
    await cdp(tabId, 'Input.dispatchKeyEvent', { type: 'keyUp', key: msg.key, code: k.code, windowsVirtualKeyCode: k.windowsVirtualKeyCode });
    return { ok: true };
  }
  return { ok: false, reason: 'geste inconnu' };
}

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
    for (const k of ['windowStart', 'windowEnd', 'timezone', 'hourlyLimit', 'dailyLimit']) {
      if (server[k] !== undefined && server[k] !== null) cfg[k] = server[k];
    }
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
  await chrome.scripting.executeScript({ target: { tabId }, files: ['human.js', 'check.js', 'members.js'] });
  const [result] = await chrome.scripting.executeScript({ target: { tabId }, func, args });
  return result?.result;
}

/** Contrôler une publication ; supprimer si elle est en ligne sans lien. */
async function checkOne(cfg, tabId, task) {
  const settleMs = between(cfg.settleSeconds) * 1000;
  // Publié sans adresse : on la cherche dans le groupe, puis on la rapporte
  // pour qu'elle soit gardée sur la plateforme.
  let foundUrl;
  if (!task.postUrl) {
    if (!task.group.url) return { outcome: 'unreachable', detail: 'ni adresse du post, ni adresse du groupe' };
    let located = null;
    // D'abord la page « ses publications dans ce groupe » : seulement les
    // posts de NOTRE profil, quelques-uns au plus. Le fil du groupe, où
    // d'autres membres publient sans arrêt, ne sert qu'en dernier recours.
    if (task.authorFacebookId && groupBase(task.group.url)) {
      await open(tabId, `${groupBase(task.group.url)}/user/${encodeURIComponent(task.authorFacebookId)}/`);
      located = await inPage(tabId, (t, ms) => self.FPC.locate({ ...t, author: '' }, { settleMs: ms, scrolls: 4 }), [task, settleMs]);
    }
    if (!located?.found) {
      await open(tabId, task.group.url);
      located = await inPage(tabId, (t, ms) => self.FPC.locate(t, { settleMs: ms }), [task, settleMs]);
    }
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
  await readLikeHuman(tabId, cfg);
  const seen = await inPage(tabId, (t, ms) => self.FPC.inspect(t, { settleMs: ms }), [task, 0]);
  if (!seen) return { outcome: 'unreachable', detail: 'page illisible' };
  if (seen.outcome !== 'missing_link') return seen;

  await beforeAction();
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

/** Encore une action permise ? Sinon on s'arrête là, et on dit pourquoi. */
async function mayAct(cfg) {
  const { left, reason } = await budget(cfg);
  if (left > 0) return true;
  await setStatus({ state: 'idle', message: `Pause : ${reason} — reprise plus tard`, at: new Date().toISOString() });
  await log('warn', `Pause : ${reason}`);
  return false;
}

/** Combien d'actions ce passage : au hasard entre 1 et le réglage, jamais
 * plus que ce que l'heure et la journée permettent encore. */
async function batchFor(cfg) {
  const { left } = await budget(cfg);
  return Math.max(1, Math.min(left || 1, 1 + Math.floor(Math.random() * Math.max(1, cfg.batchSize))));
}

/* ── Nos profils dans les groupes : adhésion, pré-approbation ─────────── */

const groupBase = (url) => String(url || '').split(/[?#]/)[0].replace(/\/+$/, '');

/** Une tâche pour UN de nos profils, désigné par son identifiant Facebook. */
async function memberOne(cfg, tabId, task) {
  const base = groupBase(task.group.url);
  if (!base) return { outcome: 'unreachable', detail: 'adresse du groupe inconnue' };
  const member = task.member;
  if (task.kind === 'approve') {
    await open(tabId, `${base}/member-requests`);
    await readLikeHuman(tabId, cfg);
    await beforeAction();
    return inPage(tabId, (m, ms) => self.FPM.approve(m, { settleMs: ms }), [member, 0]);
  }
  // Pré-approuver : UNIQUEMENT dans la liste des membres du groupe
  // (<groupe>/people) — menu « … » de sa ligne. Pas de détour par sa page de
  // profil ni par les publications en attente : ce n'est pas là que ça se fait.
  await open(tabId, `${base}/people`);
  await readLikeHuman(tabId, cfg);
  await beforeAction();
  return (await inPage(tabId, (m) => self.FPM.preapproveFromPeople(m), [member])) || { outcome: 'unreachable', detail: 'page des membres illisible' };
}

async function memberRound(cfg, tabId, reason) {
  let claim;
  try {
    claim = await api(cfg, '/verify/members/claim', { profileExternalId: cfg.profileExternalId, limit: await batchFor(cfg) });
  } catch (err) {
    await log('error', `Adhésions : réservation refusée : ${err.message}`);
    return 0;
  }
  let done = 0;
  for (const task of claim.tasks || []) {
    const { enabled } = await chrome.storage.local.get('enabled');
    if (reason === 'auto' && enabled === false) break;
    if (!(await mayAct(cfg))) break;
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
    await spend();
    await humanPause(cfg);
  }
  return done;
}

/* ── Nos profils suspendus : les retirer de nos groupes ───────────────
 * Demandé par un administrateur, pour un compte que Facebook a suspendu
 * (« Nous avons suspendu votre compte ») — jamais une limite de publication.
 * Retiré sur Facebook ; la plateforme le délie de son côté. */
async function removalRound(cfg, tabId) {
  let claim;
  try {
    claim = await api(cfg, '/verify/removals/claim', { profileExternalId: cfg.profileExternalId, limit: await batchFor(cfg) });
  } catch (err) {
    // Plateforme pas encore à jour : la mission n'existe pas encore.
    if (!/404/.test(String(err.message))) await log('error', `Retraits : réservation refusée : ${err.message}`);
    return 0;
  }
  let done = 0;
  for (const task of claim.tasks || []) {
    if (!(await mayAct(cfg))) break;
    const base = groupBase(task.group.url);
    await setStatus({ state: 'busy', message: `Retrait · ${task.member.name} · ${task.group.name}`, at: new Date().toISOString() });
    let verdict;
    try {
      if (!base) throw new Error('adresse du groupe inconnue');
      await open(tabId, `${base}/people`);
      await readLikeHuman(tabId, cfg);
      await beforeAction();
      verdict = (await inPage(tabId, (m) => self.FPM.removeFromPeople(m), [task.member])) || { outcome: 'unreachable', detail: 'page des membres illisible' };
    } catch (err) {
      verdict = { outcome: 'unreachable', detail: `erreur : ${err.message}` };
    }
    try {
      await api(cfg, `/verify/removals/${task.taskId}/result`, {
        profileExternalId: cfg.profileExternalId,
        outcome: verdict.outcome,
        facebookUserId: task.member.facebookUserId,
        detail: verdict.detail,
      });
      const ok = ['done', 'already', 'not_found'].includes(verdict.outcome);
      await log(ok ? 'ok' : 'warn', `Retrait · ${task.member.name} · ${task.group.name} · ${verdict.detail || verdict.outcome}`, { count: ok ? 'removed' : 'failed' });
    } catch (err) {
      await log('error', `Retrait : rapport refusé (${task.group.name}) : ${err.message}`, { count: 'failed' });
    }
    done += 1;
    await spend();
    await humanPause(cfg);
  }
  return done;
}

/* ── Nos posts en attente de validation : les valider ─────────────────
 * Le modérateur est administrateur du groupe : il valide lui-même le post ;
 * l'extension Publication le voit ensuite et pose le « . » puis l'URL. */
async function postApprovalRound(cfg, tabId) {
  let claim;
  try {
    claim = await api(cfg, '/verify/post-approvals/claim', { profileExternalId: cfg.profileExternalId, limit: await batchFor(cfg) });
  } catch (err) {
    if (!/404/.test(String(err.message))) await log('error', `Validations : réservation refusée : ${err.message}`);
    return 0;
  }
  let done = 0;
  for (const task of claim.tasks || []) {
    if (!(await mayAct(cfg))) break;
    const base = groupBase(task.group.url);
    await setStatus({ state: 'busy', message: `Validation d’un de nos posts · ${task.group.name}`, at: new Date().toISOString() });
    let verdict;
    try {
      if (!base) throw new Error('adresse du groupe inconnue');
      await open(tabId, `${base}/pending_posts`);
      await readLikeHuman(tabId, cfg);
      await beforeAction();
      verdict = (await inPage(tabId, (t) => self.FPM.approvePendingPost(t), [task])) || { outcome: 'unreachable', detail: 'page illisible' };
    } catch (err) {
      verdict = { outcome: 'unreachable', detail: `erreur : ${err.message}` };
    }
    try {
      await api(cfg, `/verify/post-approvals/${task.taskId}/result`, { profileExternalId: cfg.profileExternalId, outcome: verdict.outcome, detail: verdict.detail });
      const ok = verdict.outcome === 'done' || verdict.outcome === 'already';
      await log(ok ? 'ok' : 'warn', `Validation · ${task.group.name} · ${verdict.detail || verdict.outcome}`, { count: ok ? 'approved_post' : 'failed' });
    } catch (err) {
      await log('error', `Validation : rapport refusé (${task.group.name}) : ${err.message}`, { count: 'failed' });
    }
    done += 1;
    await spend();
    await humanPause(cfg);
  }
  return done;
}

/** Un moment sans action : ouvrir le fil d'actualité ou ses groupes, lire,
 * défiler. Une personne ne se connecte pas seulement pour agir. */
async function browseNeutral(tabId, cfg) {
  const where = ['https://www.facebook.com/', 'https://www.facebook.com/groups/feed/', 'https://www.facebook.com/notifications'];
  await open(tabId, where[Math.floor(Math.random() * where.length)]);
  const reads = 1 + Math.floor(Math.random() * 3);
  for (let i = 0; i < reads; i += 1) await readLikeHuman(tabId, cfg);
}

/* ── Contrôle de la pré-approbation (demandé par l'admin) ───────────── */

/** Pour chacun : ouvrir sa page de membre, lire si c'est déjà fait ou pas.
 * En mode « fix », pré-approuver ce qui manque ; en mode « check », rien
 * n'est cliqué. Chaque constat part à la plateforme, qui le journalise. */
async function auditRound(cfg, tabId, reason) {
  let claim;
  try {
    claim = await api(cfg, '/verify/members/audit/claim', { profileExternalId: cfg.profileExternalId, limit: await batchFor(cfg) });
  } catch (err) {
    await log('error', `Contrôle : réservation refusée : ${err.message}`);
    return 0;
  }
  let done = 0;
  for (const task of claim.tasks || []) {
    if (!(await mayAct(cfg))) break;
    const base = groupBase(task.group.url);
    await setStatus({ state: 'busy', message: `Contrôle · ${task.member.name} · ${task.group.name}`, at: new Date().toISOString() });
    let verdict;
    try {
      if (!base) throw new Error('adresse du groupe inconnue');
      // Le contrôle se fait sur <groupe>/people : la ligne du membre dit
      // « pré-approuvé pour publier » quand c'est fait.
      await open(tabId, `${base}/people`);
      await readLikeHuman(tabId, cfg);
      verdict = (await inPage(tabId, (m) => self.FPM.auditFromPeople(m), [task.member])) || { outcome: 'unreachable', detail: 'page illisible' };
      if (task.mode === 'fix' && verdict.outcome === 'not_done') {
        const fixed = await inPage(tabId, (m) => self.FPM.preapproveFromPeople(m), [task.member]);
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
    await spend();
    await humanPause(cfg);
  }
  return done;
}

/** Vérifier les posts publiés. */
async function postsRound(cfg, tabId, reason) {
  let claim;
  try {
    claim = await api(cfg, '/verify/claim', { profileExternalId: cfg.profileExternalId, limit: await batchFor(cfg) });
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
    if (!(await mayAct(cfg))) break;
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
    await spend();
    if (done < tasks.length) await humanPause(cfg);
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
  if (reason === 'auto' && !atWork(cfg)) {
    await setStatus({ state: 'idle', message: `Hors des heures de travail (${hhmm(cfg.windowStart)}–${hhmm(cfg.windowEnd)}, ${cfg.timezone})`, at: new Date().toISOString() });
    return;
  }
  if ((await budget(cfg)).left <= 0) {
    await setStatus({ state: 'idle', message: `Pause : ${(await budget(cfg)).reason}`, at: new Date().toISOString() });
    return;
  }
  if (kind === 'members' && cfg.members === false && reason === 'auto') return;
  if (kind === 'posts' && cfg.posts === false && reason === 'auto') return;
  await setStatus({ state: 'busy', message: `En cours (${reason})…`, at: new Date().toISOString() });
  const tab = await chrome.tabs.create({ url: 'about:blank', active: true });
  let done = 0;
  try {
    // Une fois sur deux, on commence par lire sans rien faire.
    if (Math.random() < 0.5) await browseNeutral(tab.id, cfg).catch(() => null);
    if (kind === 'posts') {
      done = await postsRound(cfg, tab.id, reason);
    } else {
      // Les contrôles demandés par l'admin passent avant le reste ; les autres
      // missions viennent dans un ordre différent à chaque passage.
      done += await auditRound(cfg, tab.id, reason);
      const missions = [
        () => memberRound(cfg, tab.id, reason),
        () => removalRound(cfg, tab.id),
        () => postApprovalRound(cfg, tab.id),
      ].sort(() => Math.random() - 0.5);
      for (const mission of missions) {
        done += await mission();
        if (Math.random() < 0.25) await browseNeutral(tab.id, cfg).catch(() => null);
      }
    }
  } finally {
    await releaseInput(tab.id);
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

/** Le prochain passage : jamais à intervalle fixe. Entre 70 % et 150 % du
 * réglage, et une fois sur six une longue pause (45 à 120 min). */
async function nextRound(cfg, first = false) {
  await chrome.alarms.clear(ALARM);
  if (!cfg.enabled) return;
  const minutes = first
    ? rand(1, 5)
    : Math.random() < 1 / 6
      ? rand(45, 120)
      : cfg.everyMinutes * rand(0.7, 1.5);
  chrome.alarms.create(ALARM, { delayInMinutes: minutes });
}

async function schedule() {
  const cfg = await settings();
  await nextRound(cfg, true);
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
    // Le suivant est tiré tout de suite : même si ce passage échoue, le
    // modérateur reviendra — à une heure imprévisible.
    await nextRound(cfg);
    // Une chose à la fois, comme quelqu'un : une seule mission par passage,
    // tirée au hasard quand les deux sont actives.
    const kinds = [cfg.posts !== false && 'posts', cfg.members !== false && 'members'].filter(Boolean);
    if (kinds.length) runRound(kinds[Math.random() < 0.6 ? 0 : kinds.length - 1], 'auto');
  }
  if (alarm.name === CONTROL) poll();
});
chrome.runtime.onInstalled.addListener(schedule);
chrome.runtime.onStartup.addListener(schedule);
chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  if (msg?.type === 'pf-input') {
    humanInput(sender.tab?.id, msg).then(reply, (err) => reply({ ok: false, reason: err.message }));
    return true;
  }
  if (msg?.type === 'schedule') schedule().then(() => reply({ ok: true }));
  else if (msg?.type === 'run-now') {
    runRound(msg.kind === 'members' ? 'members' : 'posts', 'manuel');
    reply({ ok: true });
  } else return false;
  return true;
});
