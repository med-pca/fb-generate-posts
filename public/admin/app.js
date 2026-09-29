const API = '/api',
  state = {
    profiles: [],
    groups: [],
    articles: [],
    posts: [],
    settings: null,
    sites: [],
    categories: [],
    profileOptions: [],
    articleOptions: [],
    groupOptions: [],
    page: { profiles: 1, groups: 1, articles: 1, posts: 1, logs: 1 },
    meta: {},
    logs: [],
    logsSummary: null,
    runners: null,
    logFilters: {
      hours: 24,
      level: '',
      eventType: '',
      profileId: '',
      search: '',
      onlyIncidents: false,
    },
    // Les filtres sont appliqués par l'API : la sélection « tout » doit porter
    // sur le même ensemble que celui que la suppression en masse vise.
    postFilters: { profileId: '', articleId: '', groupId: '' },
    // La file de publication : ses filtres et combien on en montre.
    queue: { tab: 'queue', categoryId: '', groupId: '', limit: 10, publishedLimit: 20, data: null },
    selection: new Set(),
  };
let accessToken = localStorage.getItem('postflow_token') || '';
const $ = (s, r = document) => r.querySelector(s),
  $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (v = '') =>
  String(v).replace(
    /[&<>'"]/g,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[
        c
      ],
  );
const initials = (n) =>
  n
    .split(/\s+/)
    .map((x) => x[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
async function api(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';
  if (accessToken && path !== '/auth/login')
    headers.Authorization = `Bearer ${accessToken}`;
  const r = await fetch(API + path, {
    ...options,
    headers,
  });
  if (!r.ok) {
    const b = await r.json().catch(() => ({}));
    if (r.status === 401 && path !== '/auth/login') {
      accessToken = '';
      localStorage.removeItem('postflow_token');
      showLogin();
    }
    throw new Error(
      Array.isArray(b.message)
        ? b.message.join(', ')
        : b.message || `Erreur ${r.status}`,
    );
  }
  return r.json();
}
function notice(message, type = 'success') {
  const n = $('#notice');
  n.textContent = message;
  n.className = `show ${type}`;
  clearTimeout(notice.timer);
  notice.timer = setTimeout(() => (n.className = ''), 3500);
}
async function load() {
  if (!accessToken) {
    showLogin();
    return;
  }
  try {
    const postQuery = new URLSearchParams({
      page: state.page.posts,
      limit: 12,
    });
    for (const [key, value] of Object.entries(state.postFilters))
      if (value) postQuery.set(key, value);
    const [
      profiles,
      groups,
      articles,
      posts,
      profileOptions,
      articleOptions,
      groupOptions,
      settings,
      sites,
      me,
      categories,
    ] = await Promise.all([
      api(`/profiles?page=${state.page.profiles}&limit=12`),
      api(`/groups?page=${state.page.groups}&limit=12`),
      api(`/articles?page=${state.page.articles}&limit=12`),
      api(`/posts?${postQuery}`),
      api('/profiles?page=1&limit=100'),
      api('/articles?page=1&limit=100'),
      api('/groups?page=1&limit=100'),
      api('/settings'),
      api('/sites'),
      api('/me'),
      api('/categories'),
    ]);
    state.profiles = profiles.data;
    state.meta.profiles = profiles.meta;
    state.groups = groups.data;
    state.meta.groups = groups.meta;
    state.articles = articles.data;
    state.meta.articles = articles.meta;
    state.posts = posts.data;
    state.meta.posts = posts.meta;
    state.selection.clear();
    state.profileOptions = profileOptions.data;
    state.articleOptions = articleOptions.data;
    state.groupOptions = groupOptions.data;
    state.settings = settings;
    state.sites = sites;
    state.categories = categories;
    state.me = me;
    // Les comptes ne regardent que les administrateurs : les demander en
    // gestionnaire rendrait un 403 et ferait échouer tout le chargement.
    state.users = me.role === 'ADMIN' ? await api('/users') : [];
    document.body.classList.toggle('is-admin', me.role === 'ADMIN');
    render();
  } catch (e) {
    notice(e.message, 'error');
  }
}
const JOIN_LABELS = {
  NOT_JOINED: 'Non rejoint',
  REQUESTED: 'Demande envoyée',
  JOINED: 'Rejoint',
  QUESTIONS: 'Questions',
  FAILED: 'Échec',
};
function render() {
  renderWhoami();
  renderUsers();
  renderSites();
  renderCategories();
  $('#n-profiles').textContent = state.meta.profiles.total;
  $('#n-groups').textContent = state.meta.groups.total;
  $('#n-posts').textContent = state.meta.posts.total;
  $('#n-links').textContent = state.groups.reduce(
    (n, g) => n + g.profiles.length,
    0,
  );
  $('#recent').innerHTML =
    state.profiles
      .slice(0, 4)
      .map(
        (p) =>
          `<div class="recent-row"><span class="avatar">${initials(p.name)}</span><div><strong>${esc(p.name)}</strong><small>${p._count.profileGroups} groupes · ${p._count.posts} posts</small></div><span class="pill">${p.minPostsPerJob}–${p.maxPostsPerJob}</span></div>`,
      )
      .join('') || '<div class="empty">Aucun profil</div>';
  $('#profile-cards').innerHTML =
    state.profiles
      .map(
        (p) =>
          `<article class="profile-card ${p.status === 'INACTIVE' ? 'inactive' : ''}"><div class="card-head"><div class="person"><span class="avatar">${initials(p.name)}</span><div><h3>${esc(p.name)}</h3><p>${esc(p.externalId || 'Sans identifiant')}</p></div></div><span class="status">${p.status === 'ACTIVE' ? 'ACTIF' : 'INACTIF'}</span></div><div class="metrics"><div><strong>${p._count.profileGroups}</strong><span>groupes liés</span></div><div><strong>${p._count.posts}</strong><span>posts</span></div></div><div class="card-actions"><button class="edit" data-toggle-profile="${p.id}">${p.status === 'ACTIVE' ? 'Désactiver' : 'Activer'}</button><button class="edit" data-edit-profile="${p.id}">Modifier</button><button class="danger" data-delete-profile="${p.id}">Supprimer</button></div></article>`,
      )
      .join('') || '<div class="empty">Créez votre premier profil.</div>';
  $('#group-rows').innerHTML =
    state.groups
      .map(
        (g) =>
          `<tr class="${g.status === 'INACTIVE' ? 'inactive' : ''}"><td><strong>${esc(g.name)}</strong><small>${g.status === 'ACTIVE' ? 'ACTIF' : 'INACTIF'} · ${esc(g.externalId || '—')}</small></td><td>${g.category ? `<span class="chip">${esc(g.category.name)}</span>` : '<span class="chip join-questions" title="Modifiez le groupe pour lui choisir une catégorie : sans elle, il ne reçoit aucun article">À ranger</span>'}</td><td><a href="${esc(g.url)}" target="_blank">${esc(g.url)}</a></td><td><div class="chips">${g.profiles.map((x) => `<span class="chip join-${(x.joinStatus || 'NOT_JOINED').toLowerCase()}" title="${esc(JOIN_LABELS[x.joinStatus] || '')}${x.joinError ? ' · ' + esc(x.joinError) : ''}">${esc(x.profile.name)} · ${esc(JOIN_LABELS[x.joinStatus] || 'Non rejoint')}</span>`).join('')}</div></td><td>${g._count.targets}</td><td><span class="stock ${g.availablePosts <= 4 ? 'low' : ''}">${g.availablePosts}</span></td><td><div class="row-actions"><button class="edit" data-toggle-group="${g.id}">${g.status === 'ACTIVE' ? 'Désactiver' : 'Activer'}</button><button class="edit" data-share-group="${g.id}">Partager</button><button class="edit" data-edit-group="${g.id}">Modifier</button><button class="danger" data-clear-group="${g.id}" ${g._count.targets ? '' : 'disabled'}>Retirer les posts</button><button class="danger" data-delete-group="${g.id}">Supprimer</button></div></td></tr>`,
      )
      .join('') ||
    '<tr><td colspan="6"><div class="empty">Aucun groupe</div></td></tr>';
  renderArticles();
  renderSettings();
  fillProfiles();
  fillPostFilters();
  renderPosts();
  renderPagination();
}
/* ── Pilotage des profils ────────────────────────────────────────────────
 *
 * L'admin décide, le terrain obéit. Rien ici ne lance un navigateur :
 * l'agent local et les extensions viennent lire ces ordres, parce que l'API
 * de NSTBrowser n'écoute que sur la machine où elle tourne.
 */
const MODE_LABELS = { OFF: 'Arrêté', ON: 'Marche forcée', AUTO: 'Auto' };
const BROWSER_LABELS = {
  STOPPED: 'fermé',
  STARTING: 'ouverture…',
  RUNNING: 'ouvert',
  ERROR: 'erreur',
};
const PHASE_LABELS = {
  claim: 'réservation',
  publish: 'publication',
  wait: 'attente',
  complete: 'clôture',
  link: 'pose du lien',
  recover: 'reprise',
};
/** « il y a 20 s » se lit mieux qu'un horodatage : ce qu'on veut savoir, c'est
 * si le profil parle encore. */
function ago(at) {
  if (!at) return 'jamais vu';
  const seconds = Math.max(0, Math.round((Date.now() - new Date(at)) / 1000));
  if (seconds < 60) return `il y a ${seconds} s`;
  if (seconds < 3600) return `il y a ${Math.round(seconds / 60)} min`;
  if (seconds < 86400) return `il y a ${Math.round(seconds / 3600)} h`;
  return `il y a ${Math.round(seconds / 86400)} j`;
}
const minutesToTime = (minutes) =>
  minutes === null || minutes === undefined
    ? ''
    : `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
const timeToMinutes = (value) => {
  if (!value) return null;
  const [h, m] = value.split(':').map(Number);
  return h * 60 + (m || 0);
};
async function loadRunners() {
  if (!accessToken) return;
  try {
    state.runners = await api('/runners');
    renderRunners();
  } catch (e) {
    notice(e.message, 'error');
  }
}
function renderRunners() {
  const data = state.runners;
  if (!data) return;
  $('#publishing-enabled').checked = data.publishingEnabled;
  $('#runners-note').textContent = data.publishingEnabled
    ? 'Un ordre est pris en compte au battement suivant du navigateur, soit moins d’une minute.'
    : 'Publication coupée : aucun profil ne publie, quel que soit son mode.';
  $('#runner-rows').innerHTML =
    data.profiles
      .map((r) => {
        const worker = r.atWork
          ? `<span class="chip join-joined">au travail · ${esc(PHASE_LABELS[r.phase] || r.phase || '—')}</span>`
          : r.running
            ? `<span class="chip join-failed">muet · dit travailler</span>`
            : `<span class="chip join-not_joined">à l’arrêt</span>`;
        const browser = `<span class="chip join-${r.browserState === 'RUNNING' ? 'joined' : r.browserState === 'ERROR' ? 'failed' : 'not_joined'}">${BROWSER_LABELS[r.browserState] || r.browserState}</span>`;
        const modes = ['OFF', 'AUTO', 'ON']
          .map(
            (m) =>
              `<option value="${m}" ${r.mode === m ? 'selected' : ''}>${MODE_LABELS[m]}</option>`,
          )
          .join('');
        // L'appairage d'abord : un navigateur jamais appairé ne parlera jamais,
        // quel que soit son mode. C'est la première chose à regarder.
        const paired = r.pairedAt
          ? `<span class="chip join-joined">appairé</span><small>${esc(ago(r.pairedAt))}</small>`
          : r.pairCodePending
            ? `<span class="chip join-requested">code émis</span><small>en attente du navigateur</small>`
            : `<span class="chip join-not_joined">jamais appairé</span>`;
        return `<tr class="${r.status === 'INACTIVE' ? 'inactive' : ''}">
        <td><strong>${esc(r.name)}</strong><small>${esc(r.externalId || 'sans identifiant NSTBrowser')}</small></td>
        <td>${paired}</td>
        <td><select data-runner-mode="${r.profileId}">${modes}</select><small class="${r.shouldRun ? '' : 'muted'}">${r.shouldRun ? '▶ doit publier' : '■ ' + esc(r.reason)}</small></td>
        <td>${esc(r.window)}<small>${esc(r.timezone)}</small></td>
        <td>${browser}<small>${esc(ago(r.browserSeenAt))}${r.browserMessage ? ' · ' + esc(r.browserMessage) : ''}</small></td>
        <td>${worker}<small>${esc(ago(r.lastSeenAt))}</small></td>
        <td>${r.published} publiés · ${r.failed} échecs · ${r.links} liens${r.message ? `<small>${esc(r.message)}</small>` : ''}</td>
        <td><div class="row-actions"><button class="edit" data-runner-pair="${r.profileId}">${r.pairedAt ? 'Ré-appairer' : 'Appairer'}</button><button class="edit" data-runner-edit="${r.profileId}">Réglages</button></div></td>
      </tr>`;
      })
      .join('') ||
    '<tr><td colspan="8"><div class="empty">Aucun profil à piloter.</div></td></tr>';
  $$('[data-runner-mode]').forEach(
    (select) =>
      (select.onchange = () =>
        patchRunner(select.dataset.runnerMode, { mode: select.value })),
  );
  $$('[data-runner-edit]').forEach(
    (button) => (button.onclick = () => openRunnerModal(button.dataset.runnerEdit)),
  );
  $$('[data-runner-pair]').forEach(
    (button) => (button.onclick = () => askPairCode(button.dataset.runnerPair)),
  );
}
async function patchRunner(profileId, patch) {
  try {
    const answer = await api(`/runners/${profileId}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    });
    notice(answer.run ? `Ordre : publier (${answer.reason})` : `Ordre : arrêt (${answer.reason})`);
    await loadRunners();
  } catch (e) {
    notice(e.message, 'error');
    await loadRunners();
  }
}
/** Émettre un code et le montrer en grand : il va être recopié à la main. */
async function askPairCode(profileId) {
  try {
    const issued = await api(`/runners/${profileId}/pair-code`, { method: 'POST' });
    $('#pair-title').textContent = issued.profileName;
    $('#pair-code').textContent = issued.code;
    $('#pair-expiry').textContent = `Valable ${issued.expiresInMinutes} minutes, une seule fois. Un nouveau code annule celui-ci.`;
    $('#pair-modal').showModal();
    await loadRunners();
  } catch (e) {
    notice(e.message, 'error');
  }
}
$('#pair-copy').onclick = async () => {
  try {
    await navigator.clipboard.writeText($('#pair-code').textContent.trim());
    notice('Code copié');
  } catch {
    // Le presse-papiers peut être refusé : le code est déjà sélectionnable.
    notice('Sélectionne le code pour le copier', 'error');
  }
};
function openRunnerModal(profileId) {
  const runner = state.runners?.profiles.find((r) => r.profileId === profileId);
  if (!runner) return;
  const dialog = $('#runner-modal'),
    form = $('#runner-form');
  form.reset();
  form.elements.profileId.value = profileId;
  form.elements.mode.value = runner.mode;
  form.elements.windowStart.value = minutesToTime(runner.windowStart);
  form.elements.windowEnd.value = minutesToTime(runner.windowEnd);
  form.elements.timezone.value = runner.timezone || '';
  form.elements.settings.value = runner.settings
    ? JSON.stringify(runner.settings, null, 2)
    : '';
  const days = String(runner.days || '')
    .split(',')
    .filter(Boolean);
  $('#runner-days').innerHTML = [
    'lundi',
    'mardi',
    'mercredi',
    'jeudi',
    'vendredi',
    'samedi',
    'dimanche',
  ]
    .map(
      (label, index) =>
        `<label class="chip"><input type="checkbox" name="days" value="${index + 1}" ${days.includes(String(index + 1)) ? 'checked' : ''}> ${label}</label>`,
    )
    .join('');
  $('#runner-modal-title').textContent = runner.name;
  dialog.showModal();
}
$('#runner-form').onsubmit = async (e) => {
  e.preventDefault();
  const form = e.target;
  let settings = null;
  const raw = form.elements.settings.value.trim();
  if (raw) {
    try {
      settings = JSON.parse(raw);
    } catch {
      notice('Les réglages poussés ne sont pas du JSON valide', 'error');
      return;
    }
  }
  const days = $$('#runner-days input:checked')
    .map((input) => input.value)
    .join(',');
  await patchRunner(form.elements.profileId.value, {
    mode: form.elements.mode.value,
    windowStart: timeToMinutes(form.elements.windowStart.value),
    windowEnd: timeToMinutes(form.elements.windowEnd.value),
    days,
    timezone: form.elements.timezone.value.trim() || 'Europe/Paris',
    settings,
  });
  $('#runner-modal').close();
};
$('#runners-refresh').onclick = () => loadRunners();
$('#runners-all-auto').onclick = () => patchAllRunners('AUTO');
$('#runners-all-off').onclick = () => patchAllRunners('OFF');
async function patchAllRunners(mode) {
  if (!confirm(mode === 'OFF' ? 'Arrêter tous les profils actifs ?' : 'Passer tous les profils actifs en auto ?'))
    return;
  try {
    const answer = await api('/runners/all', {
      method: 'PATCH',
      body: JSON.stringify({ mode }),
    });
    notice(`${answer.updated} profil(s) réglé(s)`);
    await loadRunners();
  } catch (e) {
    notice(e.message, 'error');
  }
}
/** Le coupe-circuit vit dans les réglages globaux. */
$('#publishing-enabled').onchange = async (e) => {
  try {
    state.settings = await api('/settings', {
      method: 'PATCH',
      body: JSON.stringify({ publishingEnabled: e.target.checked }),
    });
    notice(e.target.checked ? 'Publication autorisée' : 'Publication coupée');
    await loadRunners();
  } catch (err) {
    notice(err.message, 'error');
    await loadRunners();
  }
};
function paginationBox(resource) {
  const meta = state.meta[resource];
  if (!meta) return '';
  return `<button class="secondary" data-page-resource="${resource}" data-page-value="${meta.page - 1}" ${meta.page <= 1 ? 'disabled' : ''}>← Précédent</button><span>Page ${meta.page} sur ${meta.pages} · ${meta.total} élément(s)</span><button class="secondary" data-page-resource="${resource}" data-page-value="${meta.page + 1}" ${meta.page >= meta.pages ? 'disabled' : ''}>Suivant →</button>`;
}
function renderPagination() {
  for (const resource of ['profiles', 'groups', 'articles', 'posts'])
    $(`#${resource}-pagination`).innerHTML = paginationBox(resource);
}
function showLogin() {
  const dialog = $('#login-modal');
  if (!dialog.open) dialog.showModal();
}
/** Les sites où une reprise peut être déposée. La clé n'est jamais relue :
 * l'API ne la rend pas, on affiche seulement si le site en a une. */
/** Qui est connecté, et à quel titre. Sans ça, un gestionnaire ne comprend
 * pas pourquoi il voit si peu de choses. */
function renderWhoami() {
  if (!state.me) return;
  $('#whoami').innerHTML =
    `<b>${esc(state.me.username)}</b> · ` +
    (state.me.role === 'ADMIN' ? 'administrateur' : 'gestionnaire');
}

/** Les comptes. La clé d'automatisation n'apparaît jamais ici : l'API ne la
 * rend qu'à la création et à la régénération. */
function renderUsers() {
  $('#user-rows').innerHTML =
    state.users
      .map(
        (u) =>
          `<tr><td><strong>${esc(u.username)}</strong></td>` +
          `<td>${u.role === 'ADMIN' ? 'Administrateur' : 'Gestionnaire'}</td>` +
          `<td><span class="pill">${u.status === 'ACTIVE' ? 'Actif' : 'Inactif'}</span>` +
          (u.hasNstApiKey
            ? ` <span class="pill" title="Clé NSTBrowser">NST ${esc(u.nstApiKeyHint)}</span>`
            : ` <span class="muted">sans clé NST</span>`) +
          `</td>` +
          `<td>${new Date(u.createdAt).toLocaleDateString('fr-FR')}</td>` +
          `<td><div class="row-actions"><button class="edit" data-edit-user="${u.id}">Modifier</button>` +
          `<button class="edit" data-rotate-user="${u.id}">Nouvelle clé</button>` +
          (u.id === state.me?.id
            ? ''
            : `<button class="danger" data-delete-user="${u.id}">Supprimer</button>`) +
          `</div></td></tr>`,
      )
      .join('') || '<tr><td colspan="5" class="empty">Aucun compte</td></tr>';
}

const PLUGIN_LABELS = {
  CONNECTED: 'Connectée',
  BAD_KEY: 'Clé refusée',
  MISSING: 'Absente',
  OUTDATED: 'À mettre à jour',
  UNREACHABLE: 'Site injoignable',
  UNKNOWN: 'Non vérifiée',
};
const when = (date) =>
  date ? new Date(date).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }) : '';
/** L'extension WordPress du site : son état, et de quoi le croire — la date
 * de la vérification et celle du dernier article reçu. */
function pluginCell(s) {
  const p = s.plugin || { state: 'UNKNOWN' };
  const facts = [
    p.version ? `v${p.version}` : '',
    p.lastDeliveryAt ? `dernier article ${when(p.lastDeliveryAt)}` : '',
    p.checkedAt ? `vérifiée ${when(p.checkedAt)}` : '',
  ].filter(Boolean);
  return (
    `<td><span class="pill plugin-${p.state.toLowerCase()}" title="${esc(p.message || '')}">` +
    `${PLUGIN_LABELS[p.state] || p.state}</span>` +
    (facts.length ? `<small>${esc(facts.join(' · '))}</small>` : '') +
    `</td>`
  );
}
function renderSites() {
  $('#site-rows').innerHTML =
    state.sites
      .map(
        (s) =>
          `<tr><td><strong>${esc(s.name)}</strong></td>` +
          `<td><a href="${esc(s.originUrl)}" target="_blank" rel="noreferrer">${esc(s.originUrl)}</a></td>` +
          `<td>${s.category ? `<span class="chip">${esc(s.category)}</span>` : '<span class="muted">aucune — pas de post</span>'}</td>` +
          pluginCell(s) +
          `<td>${s.hasOwnKey ? 'propre à ce site' : '<span class="muted">clé globale</span>'}</td>` +
          `<td>${s.articles}</td>` +
          `<td><span class="pill">${s.status === 'ACTIVE' ? 'Actif' : 'Inactif'}</span></td>` +
          `<td><div class="row-actions"><button class="edit" data-check-site="${s.id}">Vérifier</button>` +
          `<button class="edit" data-share-site="${s.id}">Partager</button>` +
          `<button class="edit" data-edit-site="${s.id}">Modifier</button>` +
          (s.articles
            ? ''
            : `<button class="danger" data-delete-site="${s.id}">Supprimer</button>`) +
          `</div></td></tr>`,
      )
      .join('') ||
    '<tr><td colspan="8" class="empty">Aucun site déclaré. L’extension ne pourra rien déposer.</td></tr>';
}

/** La liste gérée des catégories. Renommer et supprimer touchent les
 * ressources de tous les comptes : réservé aux administrateurs. */
function renderCategories() {
  const admin = state.me?.role === 'ADMIN';
  $('#category-rows').innerHTML =
    state.categories
      .map(
        (c) =>
          `<tr><td><strong>${esc(c.name)}</strong></td><td>${c.groups}</td><td>${c.sites}</td>` +
          `<td><div class="row-actions">` +
          (admin
            ? `<button class="edit" data-rename-category="${c.id}">Renommer</button>` +
              `<button class="danger" data-delete-category="${c.id}">Supprimer</button>`
            : '') +
          `</div></td></tr>`,
      )
      .join('') ||
    '<tr><td colspan="4" class="empty">Aucune catégorie. Créez-en une, puis rangez-y vos groupes et vos sites.</td></tr>';
  const list = state.categories
    .map((c) => `<option value="${c.id}">${esc(c.name)}</option>`)
    .join('');
  // Un groupe doit avoir sa catégorie : son choix vide n'est qu'une invite,
  // que `required` refuse. Un site, lui, peut rester sans catégorie.
  $$('.category-select').forEach((select) => {
    const current = select.value;
    select.innerHTML =
      (select.hasAttribute('data-required')
        ? '<option value="" disabled selected>Choisir une catégorie</option>'
        : '<option value="">Aucune catégorie</option>') + list;
    select.value = current;
  });
  $('#group-category-help').textContent = state.categories.length
    ? 'Obligatoire : le groupe reçoit les articles des sites de cette catégorie.'
    : 'Aucune catégorie : créez-en une dans la page Catégories avant d’ajouter un groupe.';
  const choose =
    '<option value="">Choisir une catégorie</option>' +
    state.categories
      .map((c) => `<option value="${c.id}">${esc(c.name)}</option>`)
      .join('');
  $$('.groups-by-category').forEach((select) => (select.innerHTML = choose));
  fillQueueFilters();
}

function renderArticles() {
  $('#article-cards').innerHTML =
    state.articles
      .map(
        (a) =>
          `<article class="article-card ${a.status === 'INACTIVE' ? 'inactive' : ''}">${a.coverImageUrl ? `<img src="${esc(a.coverImageUrl)}" alt="" loading="lazy">` : '<div class="article-placeholder">Aucune image</div>'}<div class="article-body"><div class="post-meta"><span>${esc(a.source.name)}</span><span>${a.archivedAt ? `<span class="pill archived" title="Un de ses posts a été publié le ${esc(when(a.archivedAt))} : on n'en tire plus de nouveau post">ARCHIVÉ</span>` : a.status === 'ACTIVE' ? 'ACTIF' : 'INACTIF'}</span></div><h3>${esc(a.title)}</h3><p>${esc(a.excerpt || a.metaDescription || '')}</p><div class="article-facts"><span>${esc(a.course || 'Article')}</span>${a.totalMinutes ? `<span>${a.totalMinutes} min</span>` : ''}<span>${a._count.posts} posts</span></div><div class="card-actions"><a class="edit" href="${esc(a.articleUrl)}" target="_blank">Voir ↗</a><button class="edit" data-toggle-article="${a.id}">${a.status === 'ACTIVE' ? 'Désactiver' : 'Activer'}</button><button class="edit" data-edit-article="${a.id}">Modifier</button><button class="danger" data-delete-article="${a.id}">Supprimer</button><button class="danger" data-delete-article-posts="${a.id}" ${a._count.posts ? '' : 'disabled'}>Supprimer les posts</button><button class="primary compact" data-generate="${a.id}" ${a.status === 'INACTIVE' || a.archivedAt ? 'disabled' : ''} ${a.archivedAt ? 'title="Article archivé : ses posts ont commencé à être publiés"' : ''}>Créer les posts</button></div></div></article>`,
      )
      .join('') ||
    '<div class="empty">Importez votre premier article JSON.</div>';
}
/** Plus rien à régler ici : les posts ne naissent que des articles
 * WordPress. Le coupe-circuit vit dans le Pilotage. */
function renderSettings() {}
function renderPosts() {
  $('#post-cards').innerHTML =
    state.posts
      .map(
        (p) =>
          `<article class="post-card ${state.selection.has(p.id) ? 'selected' : ''}"><div class="post-meta"><label class="inline-check"><input type="checkbox" data-select-post="${p.id}" ${state.selection.has(p.id) ? 'checked' : ''}>${p.targets.length} groupe(s)</label><span>${p.delay} min</span></div><h3>${esc(p.title)}</h3><p>${esc(p.description)}</p><div class="chips">${p.targets
            .slice(0, 3)
            .map((x) => `<span class="chip">${esc(x.group.name)}</span>`)
            .join(
              '',
            )}</div><div class="card-actions"><button class="edit" data-edit-post="${p.id}">Modifier</button><button class="danger" data-delete-post="${p.id}">Supprimer</button></div></article>`,
      )
      .join('') || '<div class="empty">Aucun post pour ce filtre.</div>';
  renderSelection();
}
function renderSelection() {
  const count = state.selection.size,
    button = $('#post-bulk-delete');
  button.disabled = !count;
  button.textContent = count
    ? `Supprimer la sélection (${count})`
    : 'Supprimer la sélection';
  $('#post-select-all').checked = count > 0 && count === state.posts.length;
}
async function loadLogs() {
  const f = state.logFilters,
    query = new URLSearchParams({ page: state.page.logs, limit: 25 }),
    summaryQuery = new URLSearchParams({ hours: f.hours });
  // La fenêtre de la synthèse et celle de la liste doivent coïncider, sinon
  // les compteurs annoncent des incidents que le tableau n'affiche pas.
  query.set('since', new Date(Date.now() - f.hours * 3600000).toISOString());
  if (f.level) query.set('level', f.level);
  if (f.eventType) query.set('eventType', f.eventType);
  if (f.search) query.set('search', f.search);
  if (f.onlyIncidents) query.set('onlyIncidents', 'true');
  if (f.profileId) {
    query.set('profileId', f.profileId);
    summaryQuery.set('profileId', f.profileId);
  }
  try {
    const [logs, summary] = await Promise.all([
      api(`/admin/logs?${query}`),
      api(`/admin/logs/summary?${summaryQuery}`),
    ]);
    state.logs = logs.data;
    state.meta.logs = logs.meta;
    state.logsSummary = summary;
    renderLogs();
  } catch (e) {
    notice(e.message, 'error');
  }
}
function renderLogs() {
  const s = state.logsSummary;
  if (!s) return;
  $('#log-total').textContent = s.total;
  $('#log-errors').textContent = s.levels.ERROR;
  $('#log-warns').textContent = s.levels.WARN;
  $('#log-claimlost').textContent = s.claimLost;
  $('#log-window').textContent =
    `depuis le ${new Date(s.since).toLocaleString('fr-FR')}`;
  // Le stock de liens en attente ignore la fenêtre : un commentaire sans URL
  // depuis trois jours doit rester visible même en regardant les 24 h.
  const pending = s.pendingLinkUpdates;
  $('#log-pending-links').textContent = pending.total;
  $('#log-pending-since').textContent = pending.pendingSince
    ? `depuis le ${new Date(pending.pendingSince).toLocaleString('fr-FR')}`
    : 'commentaires sans URL';

  // Une réservation perdue peut signifier un post publié sans trace : c'est
  // la seule situation qui impose une vérification à la main.
  const banner = $('#log-banner');
  banner.hidden = !s.claimLost && !s.levels.ERROR;
  banner.textContent = s.claimLost
    ? `⚠ ${s.claimLost} réservation(s) perdue(s) : ces posts sont peut-être en ligne sans être enregistrés. Vérifiez-les à la main et ne les republiez pas.`
    : `⚠ ${s.levels.ERROR} erreur(s) sur la période.`;

  const event = $('#log-event');
  event.innerHTML =
    '<option value="">Tous les événements</option>' +
    s.eventTypes
      .map(
        (e) =>
          `<option value="${esc(e.eventType)}">${esc(e.eventType)} (${e.total})</option>`,
      )
      .join('');
  event.value = state.logFilters.eventType;

  $('#log-events').innerHTML =
    s.eventTypes
      .map(
        (e) =>
          `<div class="tally"><b class="event-name">${esc(e.eventType)}</b><span class="count">${e.total}${e.errors ? ` · <em>${e.errors} erreur(s)</em>` : ''}</span></div>`,
      )
      .join('') || '<div class="empty">Aucun événement sur la période.</div>';

  $('#log-profiles').innerHTML =
    s.profiles
      .map(
        (p) =>
          `<div class="tally"><b>${esc(p.name)}${p.status === 'INACTIVE' ? ' (inactif)' : ''}</b><span class="count">${p.total}${p.errors ? ` · <em>${p.errors} erreur(s)</em>` : ''}</span></div>`,
      )
      .join('') || '<div class="empty">Aucune activité sur la période.</div>';

  $('#log-rows').innerHTML =
    state.logs
      .map((l) => {
        const context = [
          l.profile && `Profil : ${esc(l.profile.name)}`,
          l.group && `Groupe : ${esc(l.group.name)}`,
          l.post && `Post : ${esc(l.post.title)}`,
          l.jobId && `Job : ${esc(l.jobId)}`,
        ].filter(Boolean);
        const meta = l.metadata
          ? `<details class="log-meta"><summary>Détails</summary><pre>${esc(JSON.stringify(l.metadata, null, 2))}</pre></details>`
          : '';
        return `<tr><td>${new Date(l.createdAt).toLocaleString('fr-FR')}</td><td><span class="level ${esc(l.level)}">${esc(l.level)}</span></td><td class="event-name">${esc(l.eventType)}</td><td class="log-message">${esc(l.message)}${meta}</td><td>${context.join('<br>') || '—'}</td></tr>`;
      })
      .join('') ||
    '<tr><td colspan="5"><div class="empty">Aucun journal pour ce filtre.</div></td></tr>';

  $('#logs-pagination').innerHTML = paginationBox('logs');
}
function fillProfiles() {
  const options = state.profileOptions
    .filter((p) => p.status === 'ACTIVE')
    .map((p) => `<option value="${p.id}">${esc(p.name)}</option>`)
    .join('');
  const f = $('#post-filter');
  f.innerHTML = '<option value="">Tous les profils</option>' + options;
  f.value = state.postFilters.profileId;
  const logProfile = $('#log-profile');
  logProfile.innerHTML =
    '<option value="">Tous les profils</option>' +
    state.profileOptions
      .map((p) => `<option value="${p.id}">${esc(p.name)}</option>`)
      .join('');
  logProfile.value = state.logFilters.profileId;
  fillGroupProfiles([]);
}
/** Les deux listes viennent du catalogue complet et non de la page affichée :
 * filtrer sur un article ou un groupe absent de la page courante doit rester
 * possible. Les groupes se limitent au profil choisi, sinon la liste propose
 * des cibles qui ne peuvent rien renvoyer. */
function fillPostFilters() {
  const { profileId, articleId, groupId } = state.postFilters,
    articleSelect = $('#post-article-filter'),
    groupSelect = $('#post-group-filter'),
    groups = profileId
      ? state.groupOptions.filter((g) =>
          g.profiles.some(
            (x) => x.profileId === profileId && x.status === 'ACTIVE',
          ),
        )
      : state.groupOptions;
  articleSelect.innerHTML =
    '<option value="">Tous les articles</option>' +
    state.articleOptions
      .map((a) => `<option value="${a.id}">${esc(a.title)}</option>`)
      .join('');
  groupSelect.innerHTML =
    '<option value="">Tous les groupes</option>' +
    groups
      .map((g) => `<option value="${g.id}">${esc(g.name)}</option>`)
      .join('');
  // Un article ou un groupe supprimé entre-temps ne doit pas rester appliqué
  // en silence : le filtre retombe sur « tous » plutôt que de vider la liste
  // sans que rien ne l'explique à l'écran.
  articleSelect.value = state.articleOptions.some((a) => a.id === articleId)
    ? articleId
    : '';
  groupSelect.value = groups.some((g) => g.id === groupId) ? groupId : '';
  state.postFilters.articleId = articleSelect.value;
  state.postFilters.groupId = groupSelect.value;
}
function fillGroupProfiles(selected = []) {
  $('#group-profiles').innerHTML =
    state.profileOptions
      .map(
        (p) =>
          `<label><input type="checkbox" name="profileIds" value="${p.id}" ${selected.includes(p.id) ? 'checked' : ''}>${esc(p.name)}</label>`,
      )
      .join('') || '<span>Créez d’abord un profil.</span>';
}
/** Un post ouvert vise les groupes d'une même catégorie : les choisir par
 * catégorie, tous cochés d'office — c'est le cas courant. */
function loadCategoryGroups(categoryId, boxSelector = '#post-groups') {
  const box = $(boxSelector);
  if (!categoryId) {
    box.innerHTML = '<span>Choisissez une catégorie.</span>';
    return;
  }
  const groups = state.groupOptions.filter(
    (g) => g.status === 'ACTIVE' && g.categoryId === categoryId,
  );
  box.innerHTML =
    groups
      .map(
        (g) =>
          `<label><input type="checkbox" name="groupIds" value="${g.id}" checked>${esc(g.name)}</label>`,
      )
      .join('') || '<span>Aucun groupe actif dans cette catégorie.</span>';
}
async function loadGroups(profileId, boxSelector = '#post-groups') {
  const box = $(boxSelector);
  if (!profileId) {
    box.innerHTML = '<span>Choisissez d’abord un profil.</span>';
    return;
  }
  const groups = await api(`/profiles/${profileId}/groups`);
  box.innerHTML =
    groups
      .map(
        (g) =>
          `<label><input type="checkbox" name="groupIds" value="${g.id}">${esc(g.name)}</label>`,
      )
      .join('') || '<span>Aucun groupe associé.</span>';
}
function view(id) {
  $$('.view').forEach((x) => x.classList.toggle('active', x.id === id));
  $$('.nav').forEach((x) =>
    x.classList.toggle('active', x.dataset.view === id),
  );
  $('#title').textContent = {
    dashboard: 'Vue d’ensemble',
    profiles: 'Profils',
    groups: 'Groupes',
    categories: 'Catégories',
    sites: 'Sites',
    users: 'Comptes',
    articles: 'Articles',
    posts: 'Posts',
    logs: 'Journaux',
    runners: 'Pilotage',
    settings: 'Paramètres',
  }[id];
  // Les journaux se relisent à chaque ouverture : une synthèse périmée
  // conduirait à décider sur l'état d'hier.
  if (id === 'logs') loadLogs();
  // La file bouge toute seule : elle se relit tant qu'elle est à l'écran.
  clearInterval(view.queueTimer);
  if (id === 'posts' && state.queue.tab === 'queue') {
    loadQueue();
    view.queueTimer = setInterval(loadQueue, 15000);
  }
  // Le pilotage se rafraîchit tant qu'il est à l'écran : cette page sert à
  // regarder des navigateurs travailler, un état figé n'y apprend rien.
  clearInterval(view.runnersTimer);
  if (id === 'runners') {
    loadRunners();
    view.runnersTimer = setInterval(loadRunners, 10000);
  }
}
function refreshLogs() {
  state.page.logs = 1;
  loadLogs();
}
$('#log-refresh').onclick = () => loadLogs();
$('#log-hours').onchange = (e) => {
  state.logFilters.hours = Number(e.target.value);
  refreshLogs();
};
$('#log-level').onchange = (e) => {
  state.logFilters.level = e.target.value;
  refreshLogs();
};
$('#log-event').onchange = (e) => {
  state.logFilters.eventType = e.target.value;
  refreshLogs();
};
$('#log-profile').onchange = (e) => {
  state.logFilters.profileId = e.target.value;
  refreshLogs();
};
$('#log-search').onchange = (e) => {
  state.logFilters.search = e.target.value.trim();
  refreshLogs();
};
$('#log-incidents').onchange = (e) => {
  state.logFilters.onlyIncidents = e.target.checked;
  refreshLogs();
};
function openModal(id) {
  const d = $('#' + id),
    f = $('form', d);
  f.reset();
  if (f.elements.id) f.elements.id.value = '';
  $('h2', d).textContent =
    id === 'profile-modal'
      ? 'Nouveau profil'
      : id === 'group-modal'
        ? 'Nouveau groupe'
        : id === 'site-modal'
          ? 'Nouveau site'
          : id === 'user-modal'
            ? 'Nouveau compte'
            : 'Nouveau post';
  if (id === 'group-modal') fillGroupProfiles([]);
  $('#post-category-label').hidden = false;
  $('#target-field').hidden = false;
  if (id === 'post-modal') loadCategoryGroups('');
  d.showModal();
}
$$('[data-view]').forEach((b) => (b.onclick = () => view(b.dataset.view)));
$$('[data-go]').forEach((b) => (b.onclick = () => view(b.dataset.go)));
$$('[data-open]').forEach((b) => (b.onclick = () => openModal(b.dataset.open)));
$$('[data-close]').forEach(
  (b) => (b.onclick = () => b.closest('dialog').close()),
);
function applyPostFilters() {
  state.page.posts = 1;
  load();
}
$('#post-filter').onchange = (e) => {
  state.postFilters.profileId = e.target.value;
  // Un groupe étranger au profil choisi ne renverrait plus aucun post : le
  // filtre tombe en même temps que le groupe quitte la liste.
  const group = state.groupOptions.find(
    (g) => g.id === state.postFilters.groupId,
  );
  if (
    group &&
    e.target.value &&
    !group.profiles.some(
      (x) => x.profileId === e.target.value && x.status === 'ACTIVE',
    )
  )
    state.postFilters.groupId = '';
  applyPostFilters();
};
$('#post-article-filter').onchange = (e) => {
  state.postFilters.articleId = e.target.value;
  applyPostFilters();
};
$('#post-group-filter').onchange = (e) => {
  state.postFilters.groupId = e.target.value;
  applyPostFilters();
};
$('#post-select-all').onchange = (e) => {
  state.selection.clear();
  if (e.target.checked) for (const p of state.posts) state.selection.add(p.id);
  renderPosts();
};
document.addEventListener('change', (e) => {
  const id = e.target.dataset?.selectPost;
  if (!id) return;
  if (e.target.checked) state.selection.add(id);
  else state.selection.delete(id);
  e.target.closest('.post-card').classList.toggle('selected', e.target.checked);
  renderSelection();
});
$('#post-bulk-delete').onclick = async () => {
  const ids = [...state.selection];
  if (!ids.length) return;
  if (
    !confirm(`Supprimer définitivement ${ids.length} post(s) et leurs cibles ?`)
  )
    return;
  try {
    const r = await api('/posts/bulk-delete', {
      method: 'POST',
      body: JSON.stringify({ ids }),
    });
    notice(
      r.blocked
        ? `${r.deleted} post(s) supprimé(s). ${r.blocked} post(s) réservé(s) par un automate ont été conservés.`
        : `${r.deleted} post(s) supprimé(s).`,
      r.blocked ? 'error' : 'success',
    );
    await load();
  } catch (x) {
    notice(x.message, 'error');
  }
};
$$('.groups-by-category').forEach(
  (select) =>
    (select.onchange = (e) =>
      loadCategoryGroups(e.target.value, e.target.dataset.groups)),
);
$('#login-form').onsubmit = async (e) => {
  e.preventDefault();
  const data = Object.fromEntries(new FormData(e.target));
  try {
    const session = await api('/auth/login', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    accessToken = session.accessToken;
    localStorage.setItem('postflow_token', accessToken);
    e.target.reset();
    e.target.closest('dialog').close();
    await load();
    notice('Connexion réussie.');
  } catch (x) {
    notice(x.message, 'error');
  }
};
$('#logout').onclick = () => {
  accessToken = '';
  localStorage.removeItem('postflow_token');
  showLogin();
};
$('#article-form').onsubmit = async (e) => {
  e.preventDefault();
  const data = Object.fromEntries(new FormData(e.target));
  if (!data.sourceName) delete data.sourceName;
  try {
    await api('/articles/import', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    e.target.closest('dialog').close();
    notice('Article importé avec ses légendes et son image.');
    await load();
  } catch (x) {
    notice(x.message, 'error');
  }
};
$('#article-edit-form').onsubmit = async (e) => {
  e.preventDefault();
  const data = Object.fromEntries(new FormData(e.target));
  const id = data.id;
  delete data.id;
  if (!data.excerpt) delete data.excerpt;
  if (!data.coverImageUrl) delete data.coverImageUrl;
  try {
    await api(`/articles/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
    e.target.closest('dialog').close();
    notice('Article modifié.');
    await load();
  } catch (x) {
    notice(x.message, 'error');
  }
};
$('#generate-form').onsubmit = async (e) => {
  e.preventDefault();
  const form = new FormData(e.target);
  const articleId = form.get('articleId');
  const data = {
    groupIds: form.getAll('groupIds'),
    delayMin: Number(form.get('delayMin')),
    delayMax: Number(form.get('delayMax')),
  };
  if (!data.groupIds.length)
    return notice('Sélectionnez au moins un groupe.', 'error');
  try {
    const posts = await api(`/articles/${articleId}/generate-posts`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
    e.target.closest('dialog').close();
    notice(`${posts.length} posts créés ou actualisés.`);
    await load();
    view('posts');
  } catch (x) {
    notice(x.message, 'error');
  }
};
$('#profile-form').onsubmit = async (e) => {
  e.preventDefault();
  const d = Object.fromEntries(new FormData(e.target)),
    id = d.id;
  delete d.id;
  d.minPostsPerJob = +d.minPostsPerJob;
  d.maxPostsPerJob = +d.maxPostsPerJob;
  if (!d.externalId) delete d.externalId;
  if (!d.defaultImageUrl) delete d.defaultImageUrl;
  // Champ vidé : null efface la valeur propre au profil et le fait retomber
  // sur le réglage global. Le supprimer laisserait l'ancienne en place.
  for (const k of ['minimumAvailable', 'minimumAvailablePerGroup'])
    d[k] = d[k] === '' ? null : +d[k];
  try {
    await api(id ? `/profiles/${id}` : '/profiles', {
      method: id ? 'PATCH' : 'POST',
      body: JSON.stringify(d),
    });
    e.target.closest('dialog').close();
    notice(id ? 'Profil modifié.' : 'Profil créé.');
    await load();
  } catch (x) {
    notice(x.message, 'error');
  }
};
/** La clé ne se lit qu'une fois : l'API ne la rend qu'à la création et à
 * la régénération, et aucune lecture ultérieure ne la montre. */
function showKey(username, key) {
  $('#key-title').textContent = `Clé de ${username}`;
  $('#key-value').textContent = key;
  $('#key-modal').showModal();
}

$('#user-form').onsubmit = async (e) => {
  e.preventDefault();
  const d = Object.fromEntries(new FormData(e.target)),
    id = d.id;
  delete d.id;
  // Un mot de passe vide ne doit pas en imposer un : à la modification, il
  // signifie « inchangé ».
  if (!d.password) delete d.password;
  // Même règle pour la clé NSTBrowser : vide = inchangée. Le compte la
  // retire lui-même depuis « Clé NSTBrowser ».
  if (!d.nstApiKey) delete d.nstApiKey;
  if (!id) delete d.status;
  try {
    const saved = await api(id ? `/users/${id}` : '/users', {
      method: id ? 'PATCH' : 'POST',
      body: JSON.stringify(d),
    });
    e.target.closest('dialog').close();
    await load();
    if (saved.automationKey) showKey(saved.username, saved.automationKey);
    else notice('Compte mis à jour.');
  } catch (x) {
    notice(x.message, 'error');
  }
};

/* ── Sa propre clé NSTBrowser ──────────────────────────────────────── */
/** La clé n'est jamais relue : seulement si elle existe, et sa fin. */
function renderNstStatus() {
  $('#nst-status').textContent = state.me?.hasNstApiKey
    ? `Clé enregistrée (${state.me.nstApiKeyHint}). En saisir une nouvelle la remplace.`
    : 'Aucune clé : l’agent local utilise celle de son .env (NST_API_KEY).';
  $('#nst-clear').hidden = !state.me?.hasNstApiKey;
}
async function saveNstKey(value) {
  try {
    state.me = await api('/me/nstbrowser-key', {
      method: 'PUT',
      body: JSON.stringify({ nstApiKey: value }),
    });
    $('#nst-modal').close();
    notice(value ? 'Clé NSTBrowser enregistrée.' : 'Clé NSTBrowser retirée.');
    if (state.me.role === 'ADMIN') await load();
  } catch (x) {
    notice(x.message, 'error');
  }
}
$('#nst-open').onclick = () => {
  $('#nst-form').reset();
  renderNstStatus();
  $('#nst-modal').showModal();
};
$('#nst-form').onsubmit = (e) => {
  e.preventDefault();
  saveNstKey(e.target.elements.nstApiKey.value.trim());
};
$('#nst-clear').onclick = () => {
  if (!confirm('Retirer la clé NSTBrowser ? L’agent reprendra celle de son .env.')) return;
  saveNstKey('');
};

/* ── Partages ──────────────────────────────────────────────────────── */
let sharing = null;

async function openAccess(kind, resource) {
  sharing = { kind, id: resource.id };
  $('#access-title').textContent = `Accès à « ${resource.name} »`;
  const rows = await api(`/${kind}/${resource.id}/access`);
  $('#access-rows').innerHTML =
    rows
      .map(
        (a) =>
          `<div class="access-row"><span>${esc(a.username)}</span>` +
          `<button class="danger" data-revoke="${a.userId}">Retirer</button></div>`,
      )
      .join('') || '<div class="access-empty">Partagé avec personne.</div>';
  // Ni le propriétaire, ni les administrateurs : les uns ont déjà tout, les
  // autres voient déjà tout.
  const already = new Set(rows.map((a) => a.userId));
  const options = state.users.filter(
    (u) => u.role !== 'ADMIN' && u.status === 'ACTIVE' && !already.has(u.id),
  );
  $('#access-user').innerHTML =
    options.map((u) => `<option value="${u.id}">${esc(u.username)}</option>`).join('') ||
    '<option value="">— aucun compte à qui partager —</option>';
  $('#access-modal').showModal();
}

$('#access-form').onsubmit = async (e) => {
  e.preventDefault();
  const userId = $('#access-user').value;
  if (!userId || !sharing) return;
  try {
    await api(`/${sharing.kind}/${sharing.id}/access`, {
      method: 'POST',
      body: JSON.stringify({ userId }),
    });
    const resource = (sharing.kind === 'sites' ? state.sites : state.groups).find(
      (x) => x.id === sharing.id,
    );
    await openAccess(sharing.kind, resource);
    notice('Partagé.');
  } catch (x) {
    notice(x.message, 'error');
  }
};

$('#category-form').onsubmit = async (e) => {
  e.preventDefault();
  try {
    await api('/categories', {
      method: 'POST',
      body: JSON.stringify({ name: e.target.elements.name.value }),
    });
    e.target.reset();
    await load();
    notice('Catégorie ajoutée.');
  } catch (x) {
    notice(x.message, 'error');
  }
};
$('#sites-check').onclick = async (e) => {
  e.target.disabled = true;
  try {
    state.sites = await api('/sites/check', { method: 'POST' });
    renderSites();
    const ok = state.sites.filter((s) => s.plugin.state === 'CONNECTED').length;
    notice(`${ok} site(s) sur ${state.sites.length} avec l’extension connectée.`);
  } catch (x) {
    notice(x.message, 'error');
  } finally {
    e.target.disabled = false;
  }
};
$('#site-form').onsubmit = async (e) => {
  e.preventDefault();
  const d = Object.fromEntries(new FormData(e.target)),
    id = d.id;
  delete d.id;
  // Une clé vide ne doit pas effacer celle en place : l'interface ne la relit
  // jamais, donc elle ne peut pas la renvoyer.
  if (!d.depositKey) delete d.depositKey;
  try {
    await api(id ? `/sites/${id}` : '/sites', {
      method: id ? 'PATCH' : 'POST',
      body: JSON.stringify(d),
    });
    e.target.closest('dialog').close();
    await load();
    notice(id ? 'Site mis à jour.' : 'Site ajouté.');
  } catch (x) {
    notice(x.message, 'error');
  }
};
$('#group-form').onsubmit = async (e) => {
  e.preventDefault();
  const form = new FormData(e.target),
    d = Object.fromEntries(form),
    id = d.id,
    profileIds = form.getAll('profileIds');
  delete d.id;
  delete d.profileIds;
  if (!profileIds.length)
    return notice('Sélectionnez au moins un profil.', 'error');
  if (!d.externalId) delete d.externalId;
  try {
    if (id) {
      const group = state.groups.find((g) => g.id === id),
        current = group.profiles.map((x) => x.profileId);
      await api(`/profiles/${profileIds[0]}/groups/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(d),
      });
      await Promise.all(
        profileIds
          .filter((x) => !current.includes(x))
          .map((profileId) =>
            api(`/profiles/${profileId}/groups/${id}/link`, { method: 'POST' }),
          ),
      );
      await Promise.all(
        current
          .filter((x) => !profileIds.includes(x))
          .map((profileId) =>
            api(`/profiles/${profileId}/groups/${id}/link`, {
              method: 'DELETE',
            }),
          ),
      );
    } else {
      const group = await api(`/profiles/${profileIds[0]}/groups`, {
        method: 'POST',
        body: JSON.stringify(d),
      });
      await Promise.all(
        profileIds.slice(1).map((profileId) =>
          api(`/profiles/${profileId}/groups/${group.id}/link`, {
            method: 'POST',
          }),
        ),
      );
    }
    e.target.closest('dialog').close();
    notice(
      id ? 'Groupe et profils modifiés.' : 'Groupe créé et profils associés.',
    );
    await load();
  } catch (x) {
    notice(x.message, 'error');
  }
};
$('#post-form').onsubmit = async (e) => {
  e.preventDefault();
  const f = new FormData(e.target),
    d = Object.fromEntries(f),
    id = d.id;
  delete d.id;
  d.delay = +d.delay;
  if (!d.url) delete d.url;
  if (!d.imageUrl) delete d.imageUrl;
  if (id) {
    delete d.profileId;
    delete d.groupIds;
  } else {
    d.groupIds = f.getAll('groupIds');
    if (!d.groupIds.length)
      return notice('Sélectionnez au moins un groupe.', 'error');
  }
  try {
    await api(id ? `/posts/${id}` : '/posts', {
      method: id ? 'PATCH' : 'POST',
      body: JSON.stringify(d),
    });
    e.target.closest('dialog').close();
    notice(id ? 'Post modifié.' : 'Post créé.');
    await load();
  } catch (x) {
    notice(x.message, 'error');
  }
};
/* ── File d'attente des posts ─────────────────────────────────────── */

function fillQueueFilters() {
  const q = state.queue;
  const categories = $('#queue-category');
  categories.innerHTML =
    '<option value="">Toutes les catégories</option>' +
    state.categories.map((c) => `<option value="${c.id}">${esc(c.name)}</option>`).join('');
  categories.value = q.categoryId;
  const groups = state.groupOptions.filter((g) => !q.categoryId || g.categoryId === q.categoryId);
  const groupSelect = $('#queue-group');
  groupSelect.innerHTML =
    '<option value="">Tous les groupes</option>' +
    groups.map((g) => `<option value="${g.id}">${esc(g.name)}</option>`).join('');
  if (!groups.some((g) => g.id === q.groupId)) q.groupId = '';
  groupSelect.value = q.groupId;
}

async function loadQueue() {
  const q = state.queue;
  const query = new URLSearchParams({ limit: q.limit, publishedLimit: q.publishedLimit });
  if (q.categoryId) query.set('categoryId', q.categoryId);
  if (q.groupId) query.set('groupId', q.groupId);
  try {
    q.data = await api(`/posts/queue?${query}`);
    renderQueue();
  } catch (x) {
    notice(x.message, 'error');
  }
}

const queuePost = (post) =>
  `<div class="queue-post">${post.imageUrl ? `<img src="${esc(post.imageUrl)}" alt="" loading="lazy">` : '<span class="noimg"></span>'}` +
  `<div><strong title="${esc(post.title)}">${esc(post.title)}</strong>` +
  `<small>${esc((post.description || '').slice(0, 70))}${(post.description || '').length > 70 ? '…' : ''}</small></div></div>`;
const queueGroup = (group) =>
  `<strong>${esc(group.name)}</strong><small>${group.category ? esc(group.category.name) : 'sans catégorie'}</small>`;
const queueProfile = (profile) =>
  profile ? `<strong>${esc(profile.name)}</strong>` : '<span class="muted">—</span>';
const LINK_LABELS = {
  placed: 'Posé',
  waiting: 'En attente',
  missing: 'Manquant',
  none: 'Sans lien',
};

function renderQueue() {
  const d = state.queue.data;
  if (!d) return;
  $('#q-running').textContent = d.counts.running;
  $('#q-upcoming').textContent = d.counts.upcoming;
  $('#q-published').textContent = d.counts.published;

  $('#queue-running').innerHTML =
    d.running
      .map(
        (r) =>
          `<tr><td>${queuePost(r.post)}</td><td>${queueGroup(r.group)}</td><td>${queueProfile(r.profile)}</td>` +
          `<td><span class="pill state-${r.state}">${r.state === 'publishing' ? 'Publication en cours' : 'Réservé'}</span>` +
          `<small>depuis ${esc(when(r.since))}</small></td></tr>`,
      )
      .join('') || '<tr><td colspan="4" class="empty">Rien en cours.</td></tr>';

  $('#queue-upcoming').innerHTML =
    d.upcoming
      .map((u) => {
        const prio = u.post.priority;
        const candidates = u.candidates.length
          ? u.candidates.map((p) => `<span class="chip">${esc(p.name)}</span>`).join(' ')
          : '<span class="chip join-questions" title="Aucun profil n’a rejoint ce groupe : ce post n’en partira pas">aucun profil</span>';
        return (
          `<tr><td><span class="rank ${u.rank === 1 ? 'next' : ''}">${u.rank}</span></td>` +
          `<td>${queuePost(u.post)}</td><td>${queueGroup(u.group)}</td><td><div class="chips">${candidates}</div></td>` +
          `<td>${prio ? `<span class="prio ${prio < 0 ? 'low' : ''}">${prio > 0 ? '+' : ''}${prio}</span>` : ''}` +
          `<div class="row-actions">` +
          `<button class="edit" data-prio="${u.post.id}" data-move="top" title="Passer devant tous les autres">⤒ En tête</button>` +
          `<button class="edit" data-prio="${u.post.id}" data-move="up" title="Avancer d’un cran">↑</button>` +
          `<button class="edit" data-prio="${u.post.id}" data-move="down" title="Reculer d’un cran">↓</button>` +
          (prio ? `<button class="edit" data-prio="${u.post.id}" data-move="reset" title="Priorité normale">Réinit.</button>` : '') +
          `</div></td></tr>`
        );
      })
      .join('') || '<tr><td colspan="5" class="empty">Aucun post en attente pour ce filtre.</td></tr>';
  $('#queue-more').hidden = d.upcoming.length >= d.counts.upcoming;

  $('#queue-published').innerHTML =
    d.published
      .map(
        (p) =>
          `<tr><td><strong>${esc(when(p.publishedAt))}</strong>` +
          (p.facebookUrl ? `<a href="${esc(p.facebookUrl)}" target="_blank" rel="noreferrer">Voir sur Facebook ↗</a>` : '') +
          `</td><td>${queuePost(p.post)}</td><td>${queueGroup(p.group)}</td><td>${queueProfile(p.profile)}</td>` +
          `<td><span class="pill link-${p.link}">${LINK_LABELS[p.link]}</span></td></tr>`,
      )
      .join('') || '<tr><td colspan="5" class="empty">Aucune publication pour ce filtre.</td></tr>';
  $('#queue-more-published').hidden = d.published.length >= d.counts.published;
}

function showPostsTab(tab) {
  state.queue.tab = tab;
  $$('[data-posts-tab]').forEach((b) => b.classList.toggle('active', b.dataset.postsTab === tab));
  $('#posts-queue').classList.toggle('hidden', tab !== 'queue');
  $('#posts-all').classList.toggle('hidden', tab !== 'all');
  view('posts');
}
$$('[data-posts-tab]').forEach((b) => (b.onclick = () => showPostsTab(b.dataset.postsTab)));
$('#queue-category').onchange = (e) => {
  state.queue.categoryId = e.target.value;
  fillQueueFilters();
  loadQueue();
};
$('#queue-group').onchange = (e) => {
  state.queue.groupId = e.target.value;
  loadQueue();
};
$('#queue-refresh').onclick = () => loadQueue();
$('#queue-more').onclick = () => {
  state.queue.limit = Math.min(100, state.queue.limit + 10);
  loadQueue();
};
$('#queue-more-published').onclick = () => {
  state.queue.publishedLimit = Math.min(200, state.queue.publishedLimit + 20);
  loadQueue();
};
/** Prioriser : le post passe devant dans TOUS ses groupes. */
async function movePost(postId, move, button) {
  button.disabled = true;
  try {
    await api(`/posts/${postId}/priority`, { method: 'PATCH', body: JSON.stringify({ move }) });
    await loadQueue();
    if (move === 'top') notice('Post passé en tête de file dans tous ses groupes.');
  } catch (x) {
    notice(x.message, 'error');
    button.disabled = false;
  }
}

/** Retire d'un groupe les posts qui y attendent. Un premier appel à blanc
 * donne les chiffres exacts : un post partagé avec d'autres groupes n'est
 * retiré que d'ici, et ce qui est publié reste — il faut le dire avant. */
async function clearGroupPosts(group, button) {
  button.disabled = true;
  try {
    const plan = await api(`/groups/${group.id}/posts?dryRun=true`, { method: 'DELETE' });
    if (!plan.removedFromGroup) {
      notice(
        plan.kept
          ? `Rien à retirer de « ${group.name} » : ses ${plan.kept} post(s) sont déjà publiés ou en cours.`
          : `Aucun post en attente dans « ${group.name} ».`,
      );
      return;
    }
    const lines = [
      `Retirer ${plan.removedFromGroup} post(s) en attente du groupe « ${group.name} » ?`,
      '',
      `• ${plan.deletedPosts} post(s) ne visaient que ce groupe : ils seront supprimés.`,
      `• ${plan.stillInOtherGroups} post(s) restent dans les autres groupes de leur catégorie.`,
    ];
    if (plan.kept) lines.push(`• ${plan.kept} publication(s) faites ou en cours sont conservées.`);
    if (!confirm(lines.join('\n'))) return;
    const done = await api(`/groups/${group.id}/posts`, { method: 'DELETE' });
    notice(
      `${done.removedFromGroup} post(s) retiré(s) de « ${group.name} », ${done.deletedPosts} supprimé(s).`,
    );
    await load();
  } catch (x) {
    notice(x.message, 'error');
  } finally {
    button.disabled = false;
  }
}
async function deleteArticlePosts(article, button) {
  const message =
    `Supprimer définitivement tous les posts liés à l’article « ${article.title} » ? L’article sera conservé. Les posts réservés par un automate en cours seront conservés.`;
  if (!confirm(message)) return;
  button.disabled = true;
  try {
    const result = await api('/posts/bulk-delete', {
      method: 'POST',
      body: JSON.stringify({ articleId: article.id }),
    });
    await load();
    notice(
      `${result.deleted} post(s) supprimé(s) pour cet article.` +
        (result.blocked
          ? ` ${result.blocked} post(s) réservé(s) ont été conservés. Réessayez après la fin des jobs.`
          : ''),
      result.blocked ? 'error' : 'success',
    );
  } catch (error) {
    notice(error.message, 'error');
  } finally {
    button.disabled = false;
  }
}

document.addEventListener('click', (e) => {
  if (e.target.dataset.pageResource) {
    const resource = e.target.dataset.pageResource;
    state.page[resource] = Number(e.target.dataset.pageValue);
    if (resource === 'logs') loadLogs();
    else load();
    return;
  }
  const toggleProfile = state.profiles.find(
    (x) => x.id === e.target.dataset.toggleProfile,
  );
  if (toggleProfile) {
    api(`/profiles/${toggleProfile.id}`, {
      method: 'PATCH',
      body: JSON.stringify({
        status: toggleProfile.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE',
      }),
    })
      .then(load)
      .then(() => notice('État du profil modifié.'))
      .catch((x) => notice(x.message, 'error'));
    return;
  }
  if (e.target.dataset.prio) {
    void movePost(e.target.dataset.prio, e.target.dataset.move, e.target);
    return;
  }
  const clearGroup = state.groups.find(
    (x) => x.id === e.target.dataset.clearGroup,
  );
  if (clearGroup) {
    if (!e.target.disabled) void clearGroupPosts(clearGroup, e.target);
    return;
  }
  const toggleGroup = state.groups.find(
    (x) => x.id === e.target.dataset.toggleGroup,
  );
  if (toggleGroup) {
    api(`/groups/${toggleGroup.id}`, {
      method: 'PATCH',
      body: JSON.stringify({
        status: toggleGroup.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE',
      }),
    })
      .then(load)
      .then(() => notice('État du groupe modifié.'))
      .catch((x) => notice(x.message, 'error'));
    return;
  }
  const deleteProfile = state.profiles.find(
    (x) => x.id === e.target.dataset.deleteProfile,
  );
  if (deleteProfile) {
    if (
      !confirm(
        `Supprimer définitivement le profil « ${deleteProfile.name} » et ses données dépendantes ?`,
      )
    )
      return;
    api(`/profiles/${deleteProfile.id}`, { method: 'DELETE' })
      .then(load)
      .then(() => notice('Profil supprimé.'))
      .catch((x) => notice(x.message, 'error'));
    return;
  }
  const deleteGroup = state.groups.find(
    (x) => x.id === e.target.dataset.deleteGroup,
  );
  if (deleteGroup) {
    if (
      !confirm(
        `Supprimer définitivement le groupe « ${deleteGroup.name} » et ses associations ?`,
      )
    )
      return;
    api(`/groups/${deleteGroup.id}`, { method: 'DELETE' })
      .then(load)
      .then(() => notice('Groupe supprimé.'))
      .catch((x) => notice(x.message, 'error'));
    return;
  }
  const articlePosts = state.articles.find(
    (x) => x.id === e.target.dataset.deleteArticlePosts,
  );
  if (articlePosts) {
    if (!e.target.disabled) void deleteArticlePosts(articlePosts, e.target);
    return;
  }
  const deleteArticle = state.articles.find(
    (x) => x.id === e.target.dataset.deleteArticle,
  );
  if (deleteArticle) {
    if (
      !confirm(
        `Supprimer définitivement l’article « ${deleteArticle.title} » ? Les posts existants seront conservés.`,
      )
    )
      return;
    api(`/articles/${deleteArticle.id}`, { method: 'DELETE' })
      .then(load)
      .then(() => notice('Article supprimé.'))
      .catch((x) => notice(x.message, 'error'));
    return;
  }
  const editArticle = state.articles.find(
    (x) => x.id === e.target.dataset.editArticle,
  );
  if (editArticle) {
    openModal('article-edit-modal');
    const form = $('#article-edit-form');
    for (const key of [
      'id',
      'title',
      'excerpt',
      'articleUrl',
      'coverImageUrl',
      'status',
    ])
      form.elements[key].value = editArticle[key] ?? '';
    $('h2', $('#article-edit-modal')).textContent = 'Modifier l’article';
    return;
  }
  const articleToToggle = state.articles.find(
    (x) => x.id === e.target.dataset.toggleArticle,
  );
  if (articleToToggle) {
    api(`/articles/${articleToToggle.id}`, {
      method: 'PATCH',
      body: JSON.stringify({
        status: articleToToggle.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE',
      }),
    })
      .then(() => load())
      .then(() => notice('État de l’article modifié.'))
      .catch((x) => notice(x.message, 'error'));
    return;
  }
  const article = state.articles.find(
    (x) => x.id === e.target.dataset.generate,
  );
  if (article) {
    openModal('generate-modal');
    $('#generate-form').elements.articleId.value = article.id;
    $('#caption-info').textContent =
      `${article.captions.length} variantes seront créées à partir des légendes de l’article.`;
    loadCategoryGroups('', '#article-groups');
    return;
  }
  let p = state.profiles.find((x) => x.id === e.target.dataset.editProfile);
  if (p) {
    openModal('profile-modal');
    const f = $('#profile-form');
    for (const k of [
      'id',
      'name',
      'externalId',
      'defaultImageUrl',
      'minPostsPerJob',
      'maxPostsPerJob',
      'minimumAvailable',
      'minimumAvailablePerGroup',
      'status',
    ])
      f.elements[k].value = p[k] ?? '';
    $('h2', $('#profile-modal')).textContent = 'Modifier le profil';
    return;
  }
  const user = state.users.find((x) => x.id === e.target.dataset.editUser);
  if (user) {
    openModal('user-modal');
    const f = $('#user-form');
    for (const k of ['id', 'username', 'role', 'status']) f.elements[k].value = user[k] ?? '';
    f.elements.password.value = '';
    $('h2', $('#user-modal')).textContent = 'Modifier le compte';
    return;
  }
  const rotate = state.users.find((x) => x.id === e.target.dataset.rotateUser);
  if (rotate) {
    if (!confirm(`Régénérer la clé de « ${rotate.username} » ? L’ancienne cessera aussitôt de fonctionner.`)) return;
    api(`/users/${rotate.id}/rotate-key`, { method: 'POST' })
      .then((r) => showKey(r.username, r.automationKey))
      .catch((x) => notice(x.message, 'error'));
    return;
  }
  const dropUser = state.users.find((x) => x.id === e.target.dataset.deleteUser);
  if (dropUser) {
    if (!confirm(`Supprimer « ${dropUser.username} » ? Ses ressources ne sont pas détruites : elles deviennent sans propriétaire.`)) return;
    api(`/users/${dropUser.id}`, { method: 'DELETE' })
      .then((r) => {
        const n = r.released;
        notice(
          `Compte supprimé. Relâché : ${n.profiles} profil(s), ${n.groups} groupe(s), ${n.sites} site(s).`,
        );
      })
      .then(load)
      .catch((x) => notice(x.message, 'error'));
    return;
  }
  const shareSite = state.sites.find((x) => x.id === e.target.dataset.shareSite);
  if (shareSite) {
    void openAccess('sites', shareSite).catch((x) => notice(x.message, 'error'));
    return;
  }
  const shareGroup = state.groups.find((x) => x.id === e.target.dataset.shareGroup);
  if (shareGroup) {
    void openAccess('groups', shareGroup).catch((x) => notice(x.message, 'error'));
    return;
  }
  const revoke = e.target.dataset.revoke;
  if (revoke && sharing) {
    api(`/${sharing.kind}/${sharing.id}/access/${revoke}`, { method: 'DELETE' })
      .then(() => {
        const resource = (sharing.kind === 'sites' ? state.sites : state.groups).find(
          (x) => x.id === sharing.id,
        );
        return openAccess(sharing.kind, resource);
      })
      .then(() => notice('Partage retiré.'))
      .catch((x) => notice(x.message, 'error'));
    return;
  }
  const checkSite = e.target.dataset.checkSite;
  if (checkSite) {
    e.target.disabled = true;
    api(`/sites/${checkSite}/check`, { method: 'POST' })
      .then((r) => {
        notice(`${r.name} : ${PLUGIN_LABELS[r.plugin.state]} — ${r.plugin.message || ''}`,
          r.plugin.state === 'CONNECTED' ? 'success' : 'error');
        return load();
      })
      .catch((x) => notice(x.message, 'error'));
    return;
  }
  const renameCat = state.categories.find(
    (x) => x.id === e.target.dataset.renameCategory,
  );
  if (renameCat) {
    const name = prompt('Nouveau nom de la catégorie', renameCat.name);
    if (!name || name === renameCat.name) return;
    api(`/categories/${renameCat.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ name }),
    })
      .then(load)
      .then(() => notice('Catégorie renommée.'))
      .catch((x) => notice(x.message, 'error'));
    return;
  }
  const dropCat = state.categories.find(
    (x) => x.id === e.target.dataset.deleteCategory,
  );
  if (dropCat) {
    if (
      !confirm(
        `Supprimer « ${dropCat.name} » ? ${dropCat.groups} groupe(s) et ${dropCat.sites} site(s) deviendront sans catégorie : les articles de ces sites ne produiront plus de post.`,
      )
    )
      return;
    api(`/categories/${dropCat.id}`, { method: 'DELETE' })
      .then(load)
      .then(() => notice('Catégorie supprimée.'))
      .catch((x) => notice(x.message, 'error'));
    return;
  }
  const site = state.sites.find((x) => x.id === e.target.dataset.editSite);
  if (site) {
    openModal('site-modal');
    const f = $('#site-form');
    for (const k of ['id', 'name', 'originUrl', 'status', 'categoryId'])
      f.elements[k].value = site[k] ?? '';
    f.elements.depositKey.value = '';
    $('h2', $('#site-modal')).textContent = 'Modifier le site';
    return;
  }
  const dropSite = state.sites.find(
    (x) => x.id === e.target.dataset.deleteSite,
  );
  if (dropSite) {
    if (!confirm(`Supprimer le site « ${dropSite.name} » ?`)) return;
    api(`/sites/${dropSite.id}`, { method: 'DELETE' })
      .then(load)
      .then(() => notice('Site supprimé.'))
      .catch((x) => notice(x.message, 'error'));
    return;
  }
  let g = state.groups.find((x) => x.id === e.target.dataset.editGroup);
  if (g) {
    openModal('group-modal');
    const f = $('#group-form');
    for (const k of ['id', 'name', 'externalId', 'url', 'status', 'categoryId'])
      f.elements[k].value = g[k] ?? '';
    fillGroupProfiles(g.profiles.map((x) => x.profileId));
    $('h2', $('#group-modal')).textContent = 'Modifier le groupe';
    return;
  }
  const deletePost = state.posts.find(
    (x) => x.id === e.target.dataset.deletePost,
  );
  if (deletePost) {
    if (!confirm(`Supprimer définitivement le post « ${deletePost.title} » ?`))
      return;
    api(`/posts/${deletePost.id}`, { method: 'DELETE' })
      .then(load)
      .then(() => notice('Post supprimé.'))
      .catch((x) => notice(x.message, 'error'));
    return;
  }
  let pId = e.target.dataset.editPost,
    post = state.posts.find((x) => x.id === pId);
  if (post) {
    openModal('post-modal');
    const f = $('#post-form');
    for (const k of [
      'id',
      'title',
      'description',
      'url',
      'imageUrl',
      'delay',
    ])
      f.elements[k].value = post[k] ?? '';
    $('#post-category-label').hidden = true;
    $('#target-field').hidden = true;
    $('h2', $('#post-modal')).textContent = 'Modifier le post';
  }
});

function registerAgentTools() {
  const context = document.modelContext;
  if (!context?.registerTool) return;
  const sections = [
    'dashboard',
    'profiles',
    'groups',
    'articles',
    'posts',
    'logs',
    'settings',
  ];
  context.registerTool({
    name: 'get_admin_summary',
    title: 'Lire le résumé PostFlow',
    description:
      'Retourne le nombre de profils, groupes, posts et associations visibles dans PostFlow.',
    inputSchema: {
      type: 'object',
      properties: {},
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, untrustedContentHint: false },
    execute: () => ({
      profiles: state.profiles.length,
      groups: state.groups.length,
      articles: state.articles.length,
      posts: state.posts.length,
      associations: state.groups.reduce((n, g) => n + g.profiles.length, 0),
    }),
  });
  context.registerTool({
    name: 'open_management_section',
    title: 'Ouvrir une section',
    description: 'Affiche une section de gestion sans modifier les données.',
    inputSchema: {
      type: 'object',
      properties: { section: { type: 'string', enum: sections } },
      required: ['section'],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, untrustedContentHint: false },
    execute: ({ section }) => {
      if (!sections.includes(section)) throw new Error('Section invalide');
      view(section);
      return { section };
    },
  });
  context.registerTool({
    name: 'start_record_creation',
    title: 'Préparer une création',
    description:
      'Ouvre le formulaire de création d’un profil, groupe ou post sans enregistrer de données.',
    inputSchema: {
      type: 'object',
      properties: {
        recordType: { type: 'string', enum: ['profile', 'group', 'post'] },
      },
      required: ['recordType'],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, untrustedContentHint: false },
    execute: ({ recordType }) => {
      const map = {
        profile: 'profile-modal',
        group: 'group-modal',
        post: 'post-modal',
      };
      openModal(map[recordType]);
      return { recordType, status: 'form_opened' };
    },
  });
}

load().then(registerAgentTools);
