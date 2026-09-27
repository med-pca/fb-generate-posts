/**
 * Le popup : liste les publications de l'onglet, vous en choisissez une,
 * vous collez l'article à réécrire, et le tout part en un appel.
 *
 * Rien n'est deviné et rien n'est envoyé sans que le texte exact ait été
 * affiché : une version précédente choisissait la publication la plus
 * proche du centre de l'écran, et se trompait de post.
 */
const config = self.FCP_CONFIG;
const els = {
  picker: document.getElementById('picker'),
  site: document.getElementById('site'),
  posts: document.getElementById('posts'),
  capture: document.getElementById('capture'),
  preview: document.getElementById('preview'),
  caption: document.getElementById('caption'),
  source: document.getElementById('source'),
  send: document.getElementById('send'),
  status: document.getElementById('status'),
  done: document.getElementById('done'),
};
let tabId = null;
let chosen = null;
let lastSeen = {};
/** Le dernier site choisi, retenu d'une fois sur l'autre. */
const LAST_SITE = 'fcp.lastSite';

const say = (message, kind = '') => {
  els.status.textContent = message;
  els.status.className = kind;
};

/** Le bouton n'est actif qu'avec les deux moitiés : la publication lue, et
 * l'article à réécrire. */
function refresh() {
  els.send.disabled = !(
    chosen &&
    els.site.value &&
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

/** Les destinations viennent de la plateforme, pas de la configuration de
 * l'extension : un site ajouté là-bas apparaît ici sans rien réinstaller. */
async function loadSites() {
  let sites = [];
  try {
    const response = await fetch(`${config.apiBase}/api/jobs/sites`, {
      headers: { 'X-API-Key': config.apiKey },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    ({ sites } = await response.json());
  } catch (error) {
    els.site.innerHTML = '';
    els.site.append(new Option('— sites indisponibles —', ''));
    say('Sites introuvables : ' + error.message, 'error');
    return;
  }
  els.site.innerHTML = '';
  if (!sites.length) {
    els.site.append(new Option('— aucun site déclaré —', ''));
    say('Déclarez un site dans la plateforme, section Sites.', 'error');
    return;
  }
  for (const site of sites) els.site.append(new Option(site.name, site.siteUrl));
  const { [LAST_SITE]: last } = await chrome.storage.local.get(LAST_SITE);
  if (last && sites.some((site) => site.siteUrl === last)) els.site.value = last;
  refresh();
}

async function start() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !/^https:\/\/([a-z0-9-]+\.)*facebook\.com\//i.test(tab.url || '')) {
    say("Ouvrez d'abord l'onglet Facebook contenant la publication.", 'error');
    return;
  }
  tabId = tab.id;

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
  // Sur une page photo, toujours montrer la liste : un seul bloc retenu ne
  // veut pas dire que c'est la légende.
  const autoPick = found.kind === 'post' && usable.length === 1;
  if (!usable.length) {
    // Le détail évite d'avoir à ouvrir la console : il dit si la page n'a
    // rien montré du tout, ou si c'est la lecture qui échoue.
    const seen = found.seen || {};
    say(
      'Aucune publication lisible sur cette page.\n' +
        `Vu : ${seen.messages ?? '?'} message(s), ${seen.articles ?? '?'} article(s), ` +
        `${seen.texts ?? '?'} bloc(s) de texte, ${seen.images ?? '?'} image(s).\n` +
        'Faites défiler jusqu’à la publication, puis rouvrez l’extension.',
      'error',
    );
    return;
  }

  // Une seule publication — une permalink — ne demande aucun choix.
  if (autoPick) {
    await choose(usable[0].index);
    return;
  }
  els.picker.classList.remove('hidden');
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
  // Sur une page photo, ce ne sont pas des publications mais les textes de
  // la page : le dire évite de chercher un post dans la liste.
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
  chosen = post;
  els.caption.value = post.caption;
  if (post.imageUrl) els.preview.src = post.imageUrl;
  else els.preview.removeAttribute('src');
  els.capture.classList.remove('hidden');
  if (post.imageUrl) {
    say('Texte et image relevés — vérifiez.');
  } else {
    // Sans ce détail, « aucune image » ne dit pas si la page n'en a pas ou
    // si elles ont toutes été écartées comme trop petites.
    const biggest = (lastSeen.biggest || []).join('\n');
    say(
      'Texte relevé, aucune image retenue.' +
        (biggest ? `\nPlus grandes vues :\n${biggest}` : ''),
      biggest ? 'error' : '',
    );
  }
  refresh();
}

async function send() {
  els.send.disabled = true;
  say('Envoi…');
  await chrome.storage.local.set({ [LAST_SITE]: els.site.value });
  const body = {
    facebookUrl: chosen.facebookUrl,
    siteUrl: els.site.value,
    sourceUrl: els.source.value.trim(),
    caption: els.caption.value.trim(),
    language: config.language || 'fr',
  };
  if (chosen.imageUrl) body.imageUrl = chosen.imageUrl;
  if (config.profileIds?.length) body.profileIds = config.profileIds;

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
  // Le serveur rend la main tout de suite : réécriture, dépôt WordPress et
  // fabrication du post suivent, en une minute environ.
  const { ingestId } = JSON.parse(text);
  say('Envoyé. La réécriture et la publication suivent côté serveur.', 'ok');
  els.done.classList.remove('hidden');
  els.done.innerHTML =
    'Reprise <code></code><br>Le post Facebook n’apparaîtra qu’une fois ' +
    'que WordPress aura renvoyé l’article au serveur (WP-Cron).';
  els.done.querySelector('code').textContent = ingestId;
}

els.site.addEventListener('change', refresh);
els.source.addEventListener('input', refresh);
els.caption.addEventListener('input', refresh);
els.send.addEventListener('click', () => void send());
void loadSites();
void start();
