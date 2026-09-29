/**
 * Le popup, en deux temps :
 *
 *   1. « Cliquer sur la publication » met la page en mode sélection et se
 *      ferme (cliquer dans la page le fermerait de toute façon). Le clic sur
 *      un post le capture — texte déplié, image, lien — dans le stockage.
 *   2. Rouvert, le popup montre la capture : on vérifie le texte, on choisit
 *      un site PRÊT (extension WordPress connectée, catégorie choisie), on
 *      colle l'article à réécrire, et le tout part en un appel.
 *
 * La liste des posts de la page reste disponible en secours.
 */
const config = self.FCP_CONFIG;
const $ = (id) => document.getElementById(id);
const els = {
  empty: $('empty'),
  pick: $('pick'),
  list: $('list'),
  picker: $('picker'),
  posts: $('posts'),
  capture: $('capture'),
  preview: $('preview'),
  noImage: $('no-image'),
  capturedAt: $('captured-at'),
  fbLink: $('fb-link'),
  caption: $('caption'),
  repick: $('repick'),
  site: $('site'),
  siteNote: $('site-note'),
  source: $('source'),
  send: $('send'),
  status: $('status'),
  done: $('done'),
};
/** La capture faite dans la page, relue à chaque ouverture. */
const CAPTURE_KEY = 'fcp.capture';
/** Le dernier site choisi, retenu d'une fois sur l'autre. */
const LAST_SITE = 'fcp.lastSite';
let tabId = null;
let chosen = null;
let sites = [];
let lastSeen = {};

const say = (message, kind = '') => {
  els.status.textContent = message;
  els.status.className = kind;
};

/** Le bouton n'est actif qu'avec tout ce qu'il faut : la publication lue,
 * un site prêt, et l'article à réécrire. */
function refresh() {
  const site = sites.find((item) => item.siteUrl === els.site.value);
  els.send.disabled = !(
    chosen &&
    site?.ready &&
    els.caption.value.trim().length >= 15 &&
    /^https:\/\/\S+\.\S+/.test(els.source.value.trim())
  );
}

async function inject(options) {
  const [{ result }] = await chrome.scripting.executeScript({
    target: { tabId },
    ...options,
  });
  return result;
}

const ago = (time) => {
  const minutes = Math.round((Date.now() - time) / 60000);
  if (minutes < 1) return 'capturée à l’instant';
  if (minutes < 60) return `capturée il y a ${minutes} min`;
  return `capturée il y a ${Math.round(minutes / 60)} h`;
};

/* ── 1. La publication ─────────────────────────────────────────────── */

/** Affiche une publication lue — capturée au clic ou choisie dans la liste. */
function showCapture(post) {
  chosen = post;
  els.empty.classList.add('hidden');
  els.picker.classList.add('hidden');
  els.capture.classList.remove('hidden');
  els.caption.value = post.caption;
  if (post.imageUrl) {
    els.preview.src = post.imageUrl;
    els.noImage.classList.add('hidden');
  } else {
    els.preview.removeAttribute('src');
    els.noImage.classList.remove('hidden');
  }
  els.capturedAt.textContent = post.capturedAt ? ago(post.capturedAt) : 'lue à l’instant';
  els.fbLink.href = post.facebookUrl || post.pageUrl || '#';
  say(
    post.imageUrl
      ? 'Texte et image relevés — vérifiez, puis choisissez le site.'
      : 'Texte relevé, sans image. Recommencez en cliquant sur la photo du post.',
    post.imageUrl ? '' : 'error',
  );
  refresh();
}

async function activeFacebookTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !/^https:\/\/([a-z0-9-]+\.)*facebook\.com\//i.test(tab.url || '')) {
    say("Ouvrez d'abord l'onglet Facebook contenant la publication.", 'error');
    return null;
  }
  tabId = tab.id;
  return tab;
}

/** Met la page en mode sélection, puis ferme le popup : la capture se
 * retrouvera ici à la réouverture. */
async function startPicking() {
  if (!(await activeFacebookTab())) return;
  try {
    await inject({ files: ['capture.js'] });
    await inject({ files: ['picker.js'] });
  } catch (error) {
    say('Sélection impossible : ' + error.message, 'error');
    return;
  }
  await chrome.storage.local.remove(CAPTURE_KEY);
  window.close();
}

/* ── Secours : la liste des publications de la page ────────────────── */

async function startList() {
  if (!(await activeFacebookTab())) return;
  let found;
  try {
    found = await inject({ files: ['capture.js'] });
  } catch (error) {
    say('Lecture impossible : ' + error.message, 'error');
    return;
  }
  if (!found || found.blocked) {
    say("Facebook n'a pas montré la page à ce compte.", 'error');
    return;
  }
  lastSeen = found.seen || {};
  const usable = (found.posts || []).filter((post) => post.preview.length >= 15);
  if (!usable.length) {
    const seen = found.seen || {};
    say(
      'Aucune publication lisible sur cette page.\n' +
        `Vu : ${seen.messages ?? '?'} message(s), ${seen.articles ?? '?'} article(s), ` +
        `${seen.texts ?? '?'} bloc(s) de texte, ${seen.images ?? '?'} image(s).\n` +
        'Faites défiler jusqu’à la publication, puis réessayez.',
      'error',
    );
    return;
  }
  els.empty.classList.add('hidden');
  els.picker.classList.remove('hidden');
  els.posts.innerHTML = '';
  for (const post of usable) {
    const item = document.createElement('li');
    item.setAttribute('role', 'option');
    item.dataset.index = String(post.index);
    const line = document.createElement('b');
    line.textContent = post.preview;
    const note = document.createElement('span');
    note.textContent =
      (post.hasImage ? 'avec image' : 'sans image') + (post.onScreen ? ' · à l’écran' : '');
    item.append(line, note);
    item.addEventListener('click', () => void choose(post.index));
    els.posts.append(item);
  }
  say(
    found.kind === 'text'
      ? `Page photo : ${usable.length} textes trouvés — choisissez la légende.`
      : `${usable.length} publications sur la page — choisissez la vôtre.`,
  );
}

async function choose(index) {
  for (const item of els.posts.children) {
    item.setAttribute('aria-selected', String(item.dataset.index === String(index)));
  }
  say('Lecture…');
  let post;
  try {
    post = await inject({ func: (i) => window.__fcpCatch.read(i), args: [index] });
  } catch (error) {
    say('Lecture impossible : ' + error.message, 'error');
    return;
  }
  if (!post || post.error) {
    say(post?.error || 'Publication illisible.', 'error');
    return;
  }
  if (!post.caption || post.caption.length < 15) {
    say("Cette publication n'a pas de texte exploitable.", 'error');
    return;
  }
  const kept = { ...post, capturedAt: Date.now() };
  await chrome.storage.local.set({ [CAPTURE_KEY]: kept });
  showCapture(kept);
  if (!post.imageUrl && lastSeen.biggest?.length) {
    say(`Texte relevé, aucune image retenue.\nPlus grandes vues :\n${lastSeen.biggest.join('\n')}`, 'error');
  }
}

/* ── 2. Le site ────────────────────────────────────────────────────── */

/** Les destinations viennent de la plateforme. Seules celles qui sont
 * prêtes — extension WordPress connectée, catégorie choisie — se
 * sélectionnent ; les autres restent visibles avec leur raison, pour savoir
 * quoi corriger dans la page Sites. */
async function loadSites() {
  try {
    const response = await fetch(`${config.apiBase}/api/jobs/sites`, {
      headers: { 'X-API-Key': config.apiKey },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    ({ sites } = await response.json());
    // Une API pas encore mise à jour ne dit pas si un site est prêt : on le
    // laisse choisir, comme avant.
    sites = sites.map((site) => ({ ...site, ready: site.ready ?? true }));
  } catch (error) {
    els.site.innerHTML = '';
    els.site.append(new Option('— sites indisponibles —', ''));
    say('Sites introuvables : ' + error.message, 'error');
    return;
  }
  els.site.innerHTML = '';
  if (!sites.length) {
    els.site.append(new Option('— aucun site déclaré —', ''));
    els.siteNote.textContent = 'Déclarez un site dans la plateforme, section Sites.';
    els.siteNote.className = 'hint warn';
    return;
  }
  const ready = sites.filter((site) => site.ready);
  els.site.append(new Option(ready.length ? 'Choisir un site' : '— aucun site prêt —', ''));
  els.site.options[0].disabled = true;
  for (const site of [...ready, ...sites.filter((item) => !item.ready)]) {
    const label = site.ready
      ? `✓ ${site.name}${site.category ? ` · ${site.category}` : ''}`
      : `${site.name} — ${site.reason}`;
    const option = new Option(label, site.siteUrl);
    option.disabled = !site.ready;
    els.site.append(option);
  }
  const { [LAST_SITE]: last } = await chrome.storage.local.get(LAST_SITE);
  const remembered = ready.find((site) => site.siteUrl === last);
  els.site.value = remembered ? remembered.siteUrl : ready.length === 1 ? ready[0].siteUrl : '';
  if (!els.site.value) els.site.selectedIndex = 0;
  describeSite();
}

function describeSite() {
  const site = sites.find((item) => item.siteUrl === els.site.value);
  const blocked = sites.filter((item) => !item.ready).length;
  if (site?.ready) {
    els.siteNote.textContent =
      `Extension connectée · les posts iront aux groupes « ${site.category} ».`;
    els.siteNote.className = 'hint ok';
  } else if (!sites.some((item) => item.ready)) {
    els.siteNote.textContent =
      'Aucun site prêt : dans la plateforme, page Sites, installez l’extension ' +
      'WordPress 1.3.0, donnez une catégorie, puis cliquez « Vérifier ».';
    els.siteNote.className = 'hint warn';
  } else {
    els.siteNote.textContent = blocked
      ? `${blocked} site(s) grisé(s) : leur raison est indiquée dans la liste.`
      : '';
    els.siteNote.className = 'hint';
  }
  refresh();
}

/* ── Envoi ─────────────────────────────────────────────────────────── */

async function send() {
  els.send.disabled = true;
  say('Envoi…');
  await chrome.storage.local.set({ [LAST_SITE]: els.site.value });
  const body = {
    facebookUrl: chosen.facebookUrl || chosen.pageUrl,
    siteUrl: els.site.value,
    sourceUrl: els.source.value.trim(),
    caption: els.caption.value.trim(),
    language: config.language || 'auto',
  };
  if (chosen.imageUrl) body.imageUrl = chosen.imageUrl;

  let response;
  try {
    response = await fetch(`${config.apiBase}/api/jobs/scrape/capture`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-Key': config.apiKey },
      body: JSON.stringify(body),
    });
  } catch (error) {
    say('Serveur injoignable : ' + error.message, 'error');
    els.send.disabled = false;
    return;
  }
  const text = await response.text();
  if (!response.ok) {
    let detail = text.slice(0, 200);
    try {
      detail = [].concat(JSON.parse(text).message || detail).join('\n');
    } catch { /* la réponse n'est pas du JSON : montrer le texte brut */ }
    say(`Refusé (HTTP ${response.status})\n${detail}`, 'error');
    els.send.disabled = false;
    return;
  }
  // Envoyée : la capture a servi, la prochaine ouverture repart de zéro.
  await chrome.storage.local.remove(CAPTURE_KEY);
  chrome.action.setBadgeText({ text: '' });
  const { ingestId } = JSON.parse(text);
  say('Envoyé. La réécriture et la publication suivent côté serveur.', 'ok');
  els.done.classList.remove('hidden');
  els.done.innerHTML =
    'Reprise <code></code><br>Le post Facebook apparaîtra une fois que WordPress ' +
    'aura renvoyé l’article au serveur (WP-Cron), pour les groupes de la catégorie du site.';
  els.done.querySelector('code').textContent = ingestId;
}

/* ── Démarrage ─────────────────────────────────────────────────────── */

async function start() {
  chrome.action.setBadgeText({ text: '' });
  const { [CAPTURE_KEY]: captured } = await chrome.storage.local.get(CAPTURE_KEY);
  if (captured?.caption) showCapture(captured);
}

els.pick.addEventListener('click', () => void startPicking());
els.repick.addEventListener('click', () => void startPicking());
els.list.addEventListener('click', () => void startList());
els.site.addEventListener('change', describeSite);
els.source.addEventListener('input', refresh);
els.caption.addEventListener('input', refresh);
els.send.addEventListener('click', () => void send());
void loadSites();
void start();
