const API = '/api',
  state = {
    profiles: [], groups: [], articles: [], posts: [], profileOptions: [], settings: null,
    page: { profiles: 1, groups: 1, articles: 1, posts: 1, logs: 1 }, meta: {},
    logs: [], logsSummary: null,
    logFilters: { hours: 24, level: '', eventType: '', profileId: '', search: '', onlyIncidents: false },
    // Le filtre est appliqué par l'API : la sélection « tout » doit porter
    // sur le même ensemble que celui que la suppression en masse vise.
    postProfileId: '', selection: new Set(),
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
  if (accessToken && path !== '/auth/login') headers.Authorization = `Bearer ${accessToken}`;
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
  if (!accessToken) { showLogin(); return; }
  try {
    const [profiles, groups, articles, posts, profileOptions, settings] = await Promise.all([
      api(`/profiles?page=${state.page.profiles}&limit=12`),
      api(`/groups?page=${state.page.groups}&limit=12`),
      api(`/articles?page=${state.page.articles}&limit=12`),
      api(
        `/posts?page=${state.page.posts}&limit=12` +
          (state.postProfileId
            ? `&profileId=${encodeURIComponent(state.postProfileId)}`
            : ''),
      ),
      api('/profiles?page=1&limit=100'),
      api('/settings'),
    ]);
    state.profiles = profiles.data; state.meta.profiles = profiles.meta;
    state.groups = groups.data; state.meta.groups = groups.meta;
    state.articles = articles.data; state.meta.articles = articles.meta;
    state.posts = posts.data; state.meta.posts = posts.meta;
    state.selection.clear();
    state.profileOptions = profileOptions.data;
    state.settings = settings;
    render();
  } catch (e) {
    notice(e.message, 'error');
  }
}
function render() {
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
          `<tr class="${g.status === 'INACTIVE' ? 'inactive' : ''}"><td><strong>${esc(g.name)}</strong><small>${g.status === 'ACTIVE' ? 'ACTIF' : 'INACTIF'} · ${esc(g.externalId || '—')}</small></td><td><a href="${esc(g.url)}" target="_blank">${esc(g.url)}</a></td><td><div class="chips">${g.profiles.map((x) => `<span class="chip">${esc(x.profile.name)}</span>`).join('')}</div></td><td>${g._count.targets}</td><td><span class="stock ${g.availablePosts <= 4 ? 'low' : ''}">${g.availablePosts}</span></td><td><div class="row-actions"><button class="edit" data-toggle-group="${g.id}">${g.status === 'ACTIVE' ? 'Désactiver' : 'Activer'}</button><button class="edit" data-edit-group="${g.id}">Modifier</button><button class="danger" data-delete-group="${g.id}">Supprimer</button></div></td></tr>`,
      )
      .join('') ||
    '<tr><td colspan="6"><div class="empty">Aucun groupe</div></td></tr>';
  renderArticles();
  renderSettings();
  fillProfiles();
  renderPosts();
  renderPagination();
}
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
function renderArticles() {
  $('#article-cards').innerHTML =
    state.articles
      .map(
        (a) =>
          `<article class="article-card ${a.status === 'INACTIVE' ? 'inactive' : ''}">${a.coverImageUrl ? `<img src="${esc(a.coverImageUrl)}" alt="" loading="lazy">` : '<div class="article-placeholder">Aucune image</div>'}<div class="article-body"><div class="post-meta"><span>${esc(a.source.name)}</span><span>${a.status === 'ACTIVE' ? 'ACTIF' : 'INACTIF'}</span></div><h3>${esc(a.title)}</h3><p>${esc(a.excerpt || a.metaDescription || '')}</p><div class="article-facts"><span>${esc(a.course || 'Article')}</span>${a.totalMinutes ? `<span>${a.totalMinutes} min</span>` : ''}<span>${a._count.posts} posts</span></div><div class="card-actions"><a class="edit" href="${esc(a.articleUrl)}" target="_blank">Voir ↗</a><button class="edit" data-toggle-article="${a.id}">${a.status === 'ACTIVE' ? 'Désactiver' : 'Activer'}</button><button class="edit" data-edit-article="${a.id}">Modifier</button><button class="danger" data-delete-article="${a.id}">Supprimer</button><button class="primary compact" data-generate="${a.id}" ${a.status === 'INACTIVE' ? 'disabled' : ''}>Créer les posts</button></div></div></article>`,
      )
      .join('') || '<div class="empty">Importez votre premier article JSON.</div>';
}
function renderSettings() {
  if (!state.settings) return;
  const form = $('#settings-form');
  form.elements.autoReplenishEnabled.checked = state.settings.autoReplenishEnabled;
  form.elements.minimumAvailablePerProfile.value = state.settings.minimumAvailablePerProfile;
  form.elements.minimumAvailablePerGroup.value = state.settings.minimumAvailablePerGroup;
  // La cadence vient de l'environnement du serveur : l'afficher évite de
  // croire que l'alimentation tourne alors que le minuteur est coupé.
  const minutes = state.settings.replenishIntervalMinutes;
  $('#replenish-cadence').textContent = minutes
    ? `Un passage automatique a lieu toutes les ${minutes} minutes, en plus de celui déclenché avant chaque réservation d’un automate.`
    : 'Passage automatique désactivé (REPLENISH_INTERVAL_MINUTES=0) : le stock ne se refait qu’avant une réservation ou avec le bouton ci-dessous.';
}
function renderPosts() {
  $('#post-cards').innerHTML =
    state.posts
      .map(
        (p) =>
          `<article class="post-card ${state.selection.has(p.id) ? 'selected' : ''}"><div class="post-meta"><label class="inline-check"><input type="checkbox" data-select-post="${p.id}" ${state.selection.has(p.id) ? 'checked' : ''}>${esc(state.profileOptions.find((x) => x.id === p.profileId)?.name || 'Profil')}</label><span>${p.delay} min</span></div><h3>${esc(p.title)}</h3><p>${esc(p.description)}</p><div class="chips">${p.targets
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
  $('#post-select-all').checked =
    count > 0 && count === state.posts.length;
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
  $('#log-window').textContent = `depuis le ${new Date(s.since).toLocaleString('fr-FR')}`;
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
  const options = state.profileOptions.filter((p) => p.status === 'ACTIVE')
    .map((p) => `<option value="${p.id}">${esc(p.name)}</option>`)
    .join('');
  $('#post-profile').innerHTML =
    '<option value="">Choisir un profil</option>' + options;
  $('#article-profile').innerHTML =
    '<option value="">Choisir un profil</option>' + options;
  const f = $('#post-filter');
  f.innerHTML = '<option value="">Tous les profils</option>' + options;
  f.value = state.postProfileId;
  const logProfile = $('#log-profile');
  logProfile.innerHTML =
    '<option value="">Tous les profils</option>' +
    state.profileOptions
      .map((p) => `<option value="${p.id}">${esc(p.name)}</option>`)
      .join('');
  logProfile.value = state.logFilters.profileId;
  fillGroupProfiles([]);
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
    articles: 'Articles',
    posts: 'Posts',
    logs: 'Journaux',
    settings: 'Paramètres',
  }[id];
  // Les journaux se relisent à chaque ouverture : une synthèse périmée
  // conduirait à décider sur l'état d'hier.
  if (id === 'logs') loadLogs();
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
        : 'Nouveau post';
  if (id === 'group-modal') fillGroupProfiles([]);
  $('#post-profile-label').hidden = false;
  $('#target-field').hidden = false;
  d.showModal();
}
$$('[data-view]').forEach((b) => (b.onclick = () => view(b.dataset.view)));
$$('[data-go]').forEach((b) => (b.onclick = () => view(b.dataset.go)));
$$('[data-open]').forEach((b) => (b.onclick = () => openModal(b.dataset.open)));
$$('[data-close]').forEach(
  (b) => (b.onclick = () => b.closest('dialog').close()),
);
$('#post-filter').onchange = (e) => {
  state.postProfileId = e.target.value;
  state.page.posts = 1;
  load();
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
  if (!confirm(`Supprimer définitivement ${ids.length} post(s) et leurs cibles ?`)) return;
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
  } catch (x) { notice(x.message, 'error'); }
};
$('#post-profile').onchange = (e) =>
  loadGroups(e.target.value).catch((x) => notice(x.message, 'error'));
$('#article-profile').onchange = (e) =>
  loadGroups(e.target.value, '#article-groups').catch((x) =>
    notice(x.message, 'error'),
  );
$('#login-form').onsubmit = async (e) => {
  e.preventDefault();
  const data = Object.fromEntries(new FormData(e.target));
  try {
    const session = await api('/auth/login', { method: 'POST', body: JSON.stringify(data) });
    accessToken = session.accessToken;
    localStorage.setItem('postflow_token', accessToken);
    e.target.reset();
    e.target.closest('dialog').close();
    await load();
    notice('Connexion réussie.');
  } catch (x) { notice(x.message, 'error'); }
};
$('#logout').onclick = () => {
  accessToken = '';
  localStorage.removeItem('postflow_token');
  showLogin();
};
$('#settings-form').onsubmit = async (e) => {
  e.preventDefault();
  const form = new FormData(e.target);
  try {
    await api('/settings', {
      method: 'PATCH',
      body: JSON.stringify({
        autoReplenishEnabled: e.target.elements.autoReplenishEnabled.checked,
        minimumAvailablePerProfile: Number(form.get('minimumAvailablePerProfile')),
        minimumAvailablePerGroup: Number(form.get('minimumAvailablePerGroup')),
      }),
    });
    notice('Paramètres d’automatisation enregistrés.');
    await load();
  } catch (x) { notice(x.message, 'error'); }
};
$('#replenish-now').onclick = async () => {
  try {
    const results = await api('/settings/replenish-now', { method: 'POST' });
    const generated = results.reduce((total, item) => total + item.generated, 0);
    const reused = results.reduce((total, item) => total + item.reused, 0);
    notice(
      `${generated} post(s) créé(s) et ${reused} post(s) existant(s) rattaché(s) aux groupes en manque.`,
    );
    await load();
  } catch (x) { notice(x.message, 'error'); }
};
$('#article-form').onsubmit = async (e) => {
  e.preventDefault();
  const data = Object.fromEntries(new FormData(e.target));
  if (!data.sourceName) delete data.sourceName;
  try {
    await api('/articles/import', { method: 'POST', body: JSON.stringify(data) });
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
    await api(`/articles/${id}`, { method: 'PATCH', body: JSON.stringify(data) });
    e.target.closest('dialog').close();
    notice('Article modifié.');
    await load();
  } catch (x) { notice(x.message, 'error'); }
};
$('#generate-form').onsubmit = async (e) => {
  e.preventDefault();
  const form = new FormData(e.target);
  const articleId = form.get('articleId');
  const data = {
    profileId: form.get('profileId'),
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
        profileIds
          .slice(1)
          .map((profileId) =>
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
document.addEventListener('click', (e) => {
  if (e.target.dataset.pageResource) {
    const resource = e.target.dataset.pageResource;
    state.page[resource] = Number(e.target.dataset.pageValue);
    if (resource === 'logs') loadLogs();
    else load();
    return;
  }
  const toggleProfile = state.profiles.find((x) => x.id === e.target.dataset.toggleProfile);
  if (toggleProfile) {
    api(`/profiles/${toggleProfile.id}`, { method: 'PATCH', body: JSON.stringify({ status: toggleProfile.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE' }) })
      .then(load).then(() => notice('État du profil modifié.')).catch((x) => notice(x.message, 'error'));
    return;
  }
  const toggleGroup = state.groups.find((x) => x.id === e.target.dataset.toggleGroup);
  if (toggleGroup) {
    api(`/groups/${toggleGroup.id}`, { method: 'PATCH', body: JSON.stringify({ status: toggleGroup.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE' }) })
      .then(load).then(() => notice('État du groupe modifié.')).catch((x) => notice(x.message, 'error'));
    return;
  }
  const deleteProfile = state.profiles.find((x) => x.id === e.target.dataset.deleteProfile);
  if (deleteProfile) {
    if (!confirm(`Supprimer définitivement le profil « ${deleteProfile.name} » et ses données dépendantes ?`)) return;
    api(`/profiles/${deleteProfile.id}`, { method: 'DELETE' }).then(load).then(() => notice('Profil supprimé.')).catch((x) => notice(x.message, 'error'));
    return;
  }
  const deleteGroup = state.groups.find((x) => x.id === e.target.dataset.deleteGroup);
  if (deleteGroup) {
    if (!confirm(`Supprimer définitivement le groupe « ${deleteGroup.name} » et ses associations ?`)) return;
    api(`/groups/${deleteGroup.id}`, { method: 'DELETE' }).then(load).then(() => notice('Groupe supprimé.')).catch((x) => notice(x.message, 'error'));
    return;
  }
  const deleteArticle = state.articles.find((x) => x.id === e.target.dataset.deleteArticle);
  if (deleteArticle) {
    if (!confirm(`Supprimer définitivement l’article « ${deleteArticle.title} » ? Les posts existants seront conservés.`)) return;
    api(`/articles/${deleteArticle.id}`, { method: 'DELETE' }).then(load).then(() => notice('Article supprimé.')).catch((x) => notice(x.message, 'error'));
    return;
  }
  const editArticle = state.articles.find((x) => x.id === e.target.dataset.editArticle);
  if (editArticle) {
    openModal('article-edit-modal');
    const form = $('#article-edit-form');
    for (const key of ['id', 'title', 'excerpt', 'articleUrl', 'coverImageUrl', 'status']) form.elements[key].value = editArticle[key] ?? '';
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
  const article = state.articles.find((x) => x.id === e.target.dataset.generate);
  if (article) {
    openModal('generate-modal');
    $('#generate-form').elements.articleId.value = article.id;
    $('#caption-info').textContent = `${article.captions.length} variantes seront créées à partir des légendes de l’article.`;
    $('#article-groups').innerHTML = '<span>Choisissez d’abord un profil.</span>';
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
  let g = state.groups.find((x) => x.id === e.target.dataset.editGroup);
  if (g) {
    openModal('group-modal');
    const f = $('#group-form');
    for (const k of ['id', 'name', 'externalId', 'url', 'status'])
      f.elements[k].value = g[k] ?? '';
    fillGroupProfiles(g.profiles.map((x) => x.profileId));
    $('h2', $('#group-modal')).textContent = 'Modifier le groupe';
    return;
  }
  const deletePost = state.posts.find((x) => x.id === e.target.dataset.deletePost);
  if (deletePost) {
    if (!confirm(`Supprimer définitivement le post « ${deletePost.title} » ?`)) return;
    api(`/posts/${deletePost.id}`, { method: 'DELETE' })
      .then(load).then(() => notice('Post supprimé.')).catch((x) => notice(x.message, 'error'));
    return;
  }
  let pId = e.target.dataset.editPost,
    post = state.posts.find((x) => x.id === pId);
  if (post) {
    openModal('post-modal');
    const f = $('#post-form');
    for (const k of [
      'id',
      'profileId',
      'title',
      'description',
      'url',
      'imageUrl',
      'delay',
    ])
      f.elements[k].value = post[k] ?? '';
    $('#post-profile-label').hidden = true;
    $('#target-field').hidden = true;
    $('h2', $('#post-modal')).textContent = 'Modifier le post';
  }
});

function registerAgentTools() {
  const context = document.modelContext;
  if (!context?.registerTool) return;
  const sections = ['dashboard', 'profiles', 'groups', 'articles', 'posts', 'logs', 'settings'];
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
