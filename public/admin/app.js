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
      // Le domaine d'abord : publication, captures, synchronisation…
      domain: '',
      hours: 24,
      level: '',
      eventType: '',
      profileId: '',
      search: '',
      onlyIncidents: false,
      // Traçabilité : par groupe, catégorie, publication, post, lien.
      groupId: '',
      categoryId: '',
      postTargetId: '',
      postId: '',
      facebookUrl: '',
      withUrl: false,
      since: '',
      until: '',
    },
    // Les filtres sont appliqués par l'API : la sélection « tout » doit porter
    // sur le même ensemble que celui que la suppression en masse vise.
    postFilters: { profileId: '', articleId: '', groupId: '' },
    // Les filtres de la page Profils (appliqués par l'API).
    profileFilters: { search: '', status: '', health: '', activity: '', categoryId: '', sort: 'recent' },
    // Les filtres du Pilotage survivent au rafraîchissement automatique.
    runnerFilters: { search: '', mode: '', state: '' },
    // La file de publication : ses filtres et combien on en montre.
    queue: { tab: 'queue', categoryId: '', groupId: '', limit: 10, publishedLimit: 20, data: null },
    selection: new Set(),
  };
// La session vit dans un cookie HttpOnly que ce script ne voit pas : aucun
// jeton à garder ici. Une ancienne version en avait rangé un : on l'efface.
try {
  localStorage.removeItem('postflow_token');
} catch (_) {
  /* stockage indisponible */
}
/** La session est tombée (expirée, déconnectée ailleurs) : retour à la page
 * de connexion, qui ramènera ici. */
function toLogin() {
  location.assign(`/login?expired=1&next=${encodeURIComponent(location.pathname + location.search)}`);
}
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
  // L'en-tête dit au serveur que la requête vient de la plateforme (CSRF).
  const headers = { 'X-Requested-With': 'PostFlow', ...(options.headers || {}) };
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';
  const r = await fetch(API + path, {
    ...options,
    credentials: 'same-origin',
    headers,
  });
  if (!r.ok) {
    const b = await r.json().catch(() => ({}));
    if (r.status === 401) toLogin();
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
      api(`/profiles?${profileQuery()}`),
      api(`/groups?page=${state.page.groups}&limit=12`),
      api(`/articles?page=${state.page.articles}&limit=12`),
      api(`/posts?${postQuery}`),
      api('/profiles?page=1&limit=100&withModerators=true'),
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
    // Les statistiques des profils : ne pas les avoir ne doit pas empêcher
    // la page de s'afficher.
    state.profileStats = await api('/insights/profiles').catch(() => ({}));
    document.body.classList.toggle('is-admin', me.role === 'ADMIN');
    render();
    loadCounters();
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
/* ── Compteurs du menu ─────────────────────────────────────────────── */
/** À côté de chaque entrée du menu, son nombre ; en rouge ce qui demande
 * une action (erreurs, sites non prêts, publications en échec). */
async function loadCounters() {
  try {
    state.counters = await api('/insights/counters');
    renderCounters();
  } catch {
    // Un compteur manquant n'empêche rien.
  }
}
function renderCounters() {
  const c = state.counters;
  if (!c) return;
  const set = (view, value, { alert = false, title = '' } = {}) => {
    const button = document.querySelector(`.nav[data-view="${view}"]`);
    if (!button) return;
    let badge = button.querySelector('.nav-count');
    if (!badge) {
      badge = document.createElement('em');
      badge.className = 'nav-count';
      button.append(badge);
    }
    badge.hidden = value === null || value === undefined || value === '';
    badge.textContent = value;
    badge.classList.toggle('alert', alert);
    badge.title = title;
  };
  set('profiles', c.profiles, { title: 'profils actifs' });
  set('groups', c.groups, { title: 'groupes actifs' });
  set('categories', c.categories);
  set('sites', c.sitesAlert ? `${c.sitesAlert}/${c.sites}` : c.sites, {
    alert: c.sitesAlert > 0,
    title: c.sitesAlert ? `${c.sitesAlert} site(s) non prêt(s) (extension ou catégorie)` : 'sites actifs',
  });
  set('articles', c.articles);
  set('posts', c.postsFailed ? `${c.posts} · ${c.postsFailed}✕` : c.posts, {
    alert: c.postsFailed > 0,
    title: `${c.posts} publication(s) en attente${c.postsFailed ? `, ${c.postsFailed} en échec` : ''}`,
  });
  set('logs', c.logErrors || '', { alert: c.logErrors > 0, title: `${c.logErrors} erreur(s) sur 24 h` });
  set('users', c.users || '');
  set('runners', c.dailyTarget ? `${c.publishedToday}/${c.dailyTarget}` : c.publishedToday, {
    title: 'publiés aujourd’hui' + (c.dailyTarget ? ' / objectif' : ''),
  });
}
setInterval(() => loadCounters(), 60000);

/* ── Groupes : les profils liés, en résumé ─────────────────────────── */
/** Dix-huit pastilles par groupe rendaient la page illisible : un résumé
 * par état, et la liste nominative au clic. */
const JOIN_ORDER = ['JOINED', 'REQUESTED', 'QUESTIONS', 'NOT_JOINED', 'FAILED'];
function groupProfilesCell(g) {
  if (!g.profiles.length) return '<span class="muted">aucun profil</span>';
  const by = {};
  for (const x of g.profiles) (by[x.joinStatus || 'NOT_JOINED'] ||= []).push(x);
  const summary = JOIN_ORDER.filter((k) => by[k])
    .map((k) => `<span class="chip join-${k.toLowerCase()}">${by[k].length} ${esc(JOIN_LABELS[k]).toLowerCase()}</span>`)
    .join('');
  const detail = JOIN_ORDER.filter((k) => by[k])
    .map(
      (k) =>
        `<div class="join-line"><b>${esc(JOIN_LABELS[k])}</b> : ${by[k]
          .map(
            (x) =>
              `<span class="join-name" title="${esc(x.joinError || '')}">${esc(x.profile.name)}` +
              // Rejoint sur Facebook sans que rien ne l'ait remonté : se
              // corrige ici, sinon le groupe reste sans profil pour publier.
              (k === 'JOINED'
                ? ''
                : `<button class="link mark-joined" data-mark-joined="${x.profileId}" data-group="${g.id}" title="${esc(x.profile.name)} a bien rejoint ce groupe sur Facebook">✓ rejoint</button>`) +
              `</span>`,
          )
          .join(' ')}</div>`,
    )
    .join('');
  return `<div class="chips">${summary}</div><details class="join-details"><summary>Voir les ${g.profiles.length} profils</summary>${detail}</details>`;
}

/* ── Profils : filtres ──────────────────────────────────────────────── */
const PROFILE_FILTER_DEFAULTS = { search: '', status: '', health: '', activity: '', categoryId: '', sort: 'recent' };
function profileQuery() {
  const q = new URLSearchParams({ page: state.page.profiles, limit: 12 });
  for (const [k, v] of Object.entries(state.profileFilters)) if (v && !(k === 'sort' && v === 'recent')) q.set(k, v);
  return q;
}
function renderProfileFilters() {
  const f = state.profileFilters;
  $('#pf-search').value = f.search;
  $('#pf-status').value = f.status;
  $('#pf-health').value = f.health;
  $('#pf-activity').value = f.activity;
  $('#pf-sort').value = f.sort;
  $('#pf-category').innerHTML =
    '<option value="">Toutes les catégories</option>' +
    (state.categories || []).map((c) => `<option value="${c.id}">${esc(c.name)}</option>`).join('');
  $('#pf-category').value = f.categoryId;
  const filtered = Object.entries(PROFILE_FILTER_DEFAULTS).some(([k, v]) => f[k] !== v);
  $('#pf-reset').hidden = !filtered;
  $('#pf-count').textContent = filtered ? `${state.meta.profiles.total} profil(s) pour ces filtres` : '';
}
[['#pf-search', 'search'], ['#pf-status', 'status'], ['#pf-health', 'health'], ['#pf-activity', 'activity'], ['#pf-category', 'categoryId'], ['#pf-sort', 'sort']].forEach(([id, key]) => {
  $(id).onchange = (e) => {
    state.profileFilters[key] = e.target.value.trim();
    state.page.profiles = 1;
    load();
  };
});
$('#pf-reset').onclick = () => {
  state.profileFilters = { ...PROFILE_FILTER_DEFAULTS };
  state.page.profiles = 1;
  load();
};

/* ── Profils : la fiche détaillée ───────────────────────────────────── */
const HEALTH_TONES = { good: 'join-joined', watch: 'join-requested', bad: 'join-failed', new: 'join-not_joined' };
const pctOf = (v) => (v === null || v === undefined ? '—' : `${Math.round(v * 100)} %`);
function healthBadge(h) {
  if (!h) return '';
  return `<span class="chip ${HEALTH_TONES[h.label] || ''}" title="Santé sur 14 jours">${h.score === null ? esc(h.labelText) : `${h.score}/100 · ${esc(h.labelText)}`}</span>` +
    (h.suggestDeactivate ? ` <span class="chip join-failed" title="${esc((h.reasons || []).join(' · '))}">⚠ À désactiver ?</span>` : '');
}

/** Le graphe des 14 jours : publiés et échecs, barres empilées par jour. */
function profileChart(days) {
  const max = Math.max(1, ...days.map((d) => d.published + d.failed));
  const bars = days
    .map((d) => {
      const pub = (d.published / max) * 100;
      const fail = (d.failed / max) * 100;
      const label = new Date(`${d.day}T12:00:00`).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });
      return `<div class="pd-bar" title="${esc(label)} : ${d.published} publié(s), ${d.failed} échec(s)">` +
        `<div class="pd-bar-stack"><span class="fail" style="height:${fail}%"></span><span class="pub" style="height:${pub}%"></span></div>` +
        `<small>${esc(label.slice(0, 2))}</small></div>`;
    })
    .join('');
  return `<div class="pd-legend"><span class="pub">Publiés</span><span class="fail">Échecs</span></div><div class="pd-bars">${bars}</div>`;
}

/** Ouvrir la page d'un profil : son adresse est /profils/<id>. */
function openProfileDetail(profileId, { focusDeactivate = false } = {}) {
  history.pushState({}, '', `/profils/${profileId}`);
  view('profile-page', { fromUrl: true });
  return renderProfilePage(profileId, { focusDeactivate });
}

const JOIN_TEXT = { JOINED: 'Rejoint', REQUESTED: 'Demande envoyée', QUESTIONS: 'Questions', NOT_JOINED: 'À rejoindre', FAILED: 'Échec' };
const JOIN_CLASS = { JOINED: 'join-joined', REQUESTED: 'join-requested', QUESTIONS: 'join-questions', NOT_JOINED: 'join-not_joined', FAILED: 'join-failed' };

async function renderProfilePage(profileId, { focusDeactivate = false } = {}) {
  state.profilePage = { id: profileId, selected: new Set(), add: new Set() };
  $('#pd-title').textContent = 'Chargement…';
  let d;
  try {
    d = await api(`/profiles/${profileId}/health`);
  } catch (x) {
    notice(x.message, 'error');
    return;
  }
  const h = d.health, t = d.totals, p = d.profile, tr = d.transfer;
  state.profilePage.data = d;
  $('#pd-title').textContent = p.name;
  $('#pd-avatar').textContent = initials(p.name);
  $('#title').textContent = p.name;
  document.title = `PostFlow — ${p.name}`;
  $('#pd-sub').textContent = `PROFIL · ${p.status === 'ACTIVE' ? 'ACTIF' : 'INACTIF'}${p.isModerator ? ' · VÉRIFICATEUR' : ''}`;
  $('#pd-health').innerHTML =
    `<div class="pd-score ${h.label}"><strong>${h.score === null ? '—' : h.score}</strong><span>/100</span><small>${esc(h.labelText)}</small></div>` +
    `<div class="pd-verdict">` +
    (h.suggestDeactivate
      ? `<b>⚠ Indice : il vaudrait mieux le désactiver.</b><ul>${h.reasons.map((r) => `<li>${esc(r)}</li>`).join('')}</ul>`
      : h.reasons.length
        ? `<b>À surveiller :</b><ul>${h.reasons.map((r) => `<li>${esc(r)}</li>`).join('')}</ul>`
        : `<b>Rien d’inquiétant sur ${h.windowDays} jours.</b>`) +
    `<small>Score sur ${h.windowDays} jours : réussite des publications (50 %), posts vérifiés en ligne avec leur lien (30 %), lien de l’article posé (20 %), moins les échecs d’affilée.</small></div>`;
  const stat = (value, label, bad) => `<div class="${bad ? 'bad' : ''}"><strong>${value}</strong><span>${label}</span></div>`;
  $('#pd-stats').innerHTML =
    `<div class="metrics profile-stats">` +
    stat(t.today, 'publiés aujourd’hui') +
    stat(t.week, 'publiés (7 j)') +
    stat(t.month, 'publiés (30 j)') +
    stat(t.total, 'au total') +
    stat(t.failedWeek, 'échecs (7 j)', t.failedWeek) +
    stat(t.failedMonth, 'échecs (30 j)', t.failedMonth) +
    stat(pctOf(h.successRate), 'réussite (14 j)', h.successRate !== null && h.successRate < 0.5) +
    stat(pctOf(h.verifyRate), 'vérifiés OK (14 j)', h.verifyRate !== null && h.verifyRate < 0.5) +
    stat(pctOf(h.linkRate), 'liens posés (14 j)', h.linkRate !== null && h.linkRate < 0.5) +
    stat(h.input.failStreak, 'échecs d’affilée', h.input.failStreak >= 3) +
    stat(h.input.claimsLost, 'réservations perdues (14 j)', h.input.claimsLost >= 3) +
    stat(`${d.joins.JOINED || 0}`, `groupes rejoints${d.preApproved ? ` · ${d.preApproved} pré-approuvé(s)` : ''}`) +
    `</div><p class="profile-line"><small>${t.lastPublishedAt ? `dernière publication ${esc(ago(t.lastPublishedAt))}` : 'aucune publication'}${t.lastFailedAt ? ` · dernier échec ${esc(ago(t.lastFailedAt))}` : ''}${p.runner ? ` · pilotage : ${esc(MODE_LABELS[p.runner.mode] || p.runner.mode)}` : ''}</small></p>`;
  $('#pd-chart').innerHTML = profileChart(d.days);
  $('#pd-groups').innerHTML =
    d.groups.map((g) => `<tr><td>${esc(g.name)}</td><td>${g.published}</td><td class="${g.failed ? 'bad' : ''}">${g.failed}</td><td><small>${esc(g.lastError || '—')}</small></td></tr>`).join('') ||
    '<tr><td colspan="4" class="empty">Aucune activité sur 30 jours.</td></tr>';
  $('#pd-errors').innerHTML = d.errors.map((e) => `<li><b>${e.count}×</b> ${esc(e.error)}</li>`).join('') || '<li class="muted">Aucune erreur.</li>';
  $('#pd-failures').innerHTML =
    d.failures
      .map((f) => `<li class="bad"><b>${esc(f.post)} · ${esc(f.group)}</b><small>${esc(when(f.at))}</small><small>${esc(f.error || '')}</small>` +
        `<div class="link-actions"><button type="button" data-history="${f.postTargetId}">Historique</button></div></li>`)
      .join('') || '<li>Aucun échec.</li>';

  // Désactiver : ce qui l'attend, et qui le reprend.
  if (p.status === 'ACTIVE') {
    const options = tr.candidates
      .map((c) => `<option value="${c.id}" ${c.id === tr.recommendedId ? 'selected' : ''}>${esc(c.name)} — ${c.score === null ? 'nouveau' : `${c.score}/100`} · ${c.groupsCovered}/${tr.groupsWaiting} groupe(s)${c.running ? '' : ' · arrêté'}${c.id === tr.recommendedId ? ' (recommandé)' : ''}</option>`)
      .join('');
    $('#pd-transfer').innerHTML =
      `<h3 class="history-h">Le désactiver</h3>` +
      `<p>Ce qui l’attend : <b>${tr.forcedTargets}</b> publication(s) envoyée(s) vers lui, <b>${tr.ownedPosts}</b> post(s) à lui, ` +
      `posts en file dans <b>${tr.groupsWaiting}</b> groupe(s)${tr.activeJobs ? `, et un lot en cours (libéré)` : ''}.</p>` +
      `<label>Confier ses posts en attente à <select id="pd-heir"><option value="">Personne : les rendre à la file</option>${options}</select></label>` +
      `<small>Le repreneur les reçoit en priorité dans les groupes qu’il a rejoints ; ailleurs, ils restent dans la file pour les autres profils.</small>` +
      (tr.orphanGroups.length
        ? `<div class="warn-box">⚠ Dans ${tr.orphanGroups.length} groupe(s), il est le seul profil : ${tr.orphanGroups.map((g) => esc(g.name)).join(', ')}. Personne n’y publiera tant qu’un autre profil ne l’aura pas rejoint.</div>`
        : '') +
      `<div class="actions"><button class="danger" type="button" id="pd-deactivate">Désactiver${tr.recommendedId ? ' et transférer' : ''}</button></div>`;
    $('#pd-actions').innerHTML =
      `<button class="edit" type="button" data-edit-profile="${p.id}">Modifier</button>` +
      `<button class="edit" type="button" data-goto="/pilotage">Pilotage</button>` +
      `<button class="danger" type="button" id="pd-goto-deactivate">Désactiver…</button>`;
    $('#pd-goto-deactivate').onclick = () => $('#pd-transfer').scrollIntoView?.({ behavior: 'smooth', block: 'start' });
    $('#pd-deactivate').onclick = async () => {
      const heir = $('#pd-heir').value || null;
      const heirName = heir ? tr.candidates.find((c) => c.id === heir)?.name : null;
      if (!confirm(`Désactiver « ${p.name} » ?\n${heirName ? `Ses posts en attente iront en priorité à « ${heirName} ».` : 'Ses posts en attente retournent à la file.'}`)) return;
      $('#pd-deactivate').disabled = true;
      try {
        const r = await api(`/profiles/${p.id}/deactivate`, { method: 'POST', body: JSON.stringify({ transferTo: heir }) });
        notice(
          `« ${p.name} » désactivé.` +
            (r.transferredTo ? ` ${r.forcedMoved + r.prioritised} publication(s) confiée(s) à ${r.transferredTo.name}.` : '') +
            (r.released ? ` ${r.released} post(s) du lot en cours remis en file.` : '') +
            (r.orphanGroups.length ? ` ⚠ ${r.orphanGroups.length} groupe(s) sans autre profil.` : ''),
          r.orphanGroups.length ? 'error' : 'success',
        );
        await load();
        await renderProfilePage(p.id);
      } catch (x) {
        notice(x.message, 'error');
        $('#pd-deactivate').disabled = false;
      }
    };
    $('#pd-transfer').hidden = false;
  } else {
    $('#pd-transfer').hidden = true;
    $('#pd-actions').innerHTML =
      `<button class="edit" type="button" data-edit-profile="${p.id}">Modifier</button>` +
      `<button class="primary" type="button" data-toggle-profile="${p.id}">Activer</button>`;
  }
  // Un modérateur : sa vraie page est dans la rubrique Modérateurs, et seul
  // un administrateur le modifie.
  if (p.isModerator) {
    $('#pd-actions').innerHTML =
      `<button class="primary" type="button" data-goto="/moderateurs/${p.id}">🛡 Sa page modérateur</button>` +
      (isAdminUser() ? $('#pd-actions').innerHTML : '');
    if (!isAdminUser()) {
      $('#pd-transfer').hidden = true;
      $('#pp-groups').classList.add('locked');
    }
  }
  renderMemberships();
  await loadAddableGroups();
  if (focusDeactivate) $('#pd-transfer').scrollIntoView?.({ block: 'start' });
}

/* ── Page profil : ses groupes ──────────────────────────────────────── */
const AUDIT_STATES = {
  PREAPPROVED: ['join-joined', '✓ déjà faite'],
  NOT_PREAPPROVED: ['join-failed', '✗ pas faite'],
  NO_PERMISSION: ['join-questions', 'pas l’option'],
  NOT_FOUND: ['join-not_joined', 'introuvable'],
};
/** La pré-approbation d'une liaison : ce que le dernier contrôle a vu sur
 * Facebook, sinon ce que la plateforme croit (« non vérifié »). */
function preApprovalCell(m) {
  if (m.auditPending) return '<span class="chip join-requested" title="Le modérateur va regarder sur Facebook">⏳ test en cours</span>';
  const st = AUDIT_STATES[m.preApprovalState];
  if (st) {
    return `<span class="chip ${st[0]}" title="${esc(m.preApprovalDetail || '')}">${st[1]}</span>` +
      `<small>vérifié ${esc(ago(m.preApprovalCheckedAt))}</small>`;
  }
  return m.preApproved
    ? '<span class="chip join-joined">oui</span><small>non vérifié sur Facebook</small>'
    : '<span class="muted">non</span>';
}
/** Demander au modérateur de regarder (mode « check » : rien n'est cliqué). */
async function requestAudit(body, button) {
  if (button) button.disabled = true;
  try {
    const r = await api('/moderators/audit', { method: 'POST', body: JSON.stringify(body) });
    notice(
      r.requested
        ? `${r.requested} contrôle(s) demandé(s)${r.moderators ? ' : le modérateur s’en charge dans la minute.' : ', mais aucun modérateur actif.'}`
        : 'Rien à contrôler : le profil doit être membre du groupe et son compte Facebook connu.',
      r.requested && r.moderators ? 'success' : 'error',
    );
    return r;
  } catch (x) {
    notice(x.message, 'error');
    if (button) button.disabled = false;
    return null;
  }
}
function renderMemberships() {
  const pp = state.profilePage;
  const all = Array.isArray(pp.data.memberships) ? pp.data.memberships : [];
  const text = $('#pp-group-search').value.trim().toLowerCase();
  const join = $('#pp-group-join').value;
  const rows = all.filter((m) => (!text || m.name.toLowerCase().includes(text) || (m.category?.name || '').toLowerCase().includes(text)) && (!join || m.joinStatus === join));
  $('#pp-groups-title').textContent = `${all.length} groupe(s) lié(s)` +
    ` · ${all.filter((m) => m.joinStatus === 'JOINED').length} rejoint(s)` +
    ` · ${all.filter((m) => m.preApproved).length} pré-approuvé(s)`;
  $('#pp-memberships').innerHTML =
    rows
      .map(
        (m) =>
          `<tr class="${m.groupStatus === 'INACTIVE' || m.linkStatus !== 'ACTIVE' ? 'inactive' : ''}">` +
          `<td class="w-check"><input type="checkbox" data-pp-select="${m.groupId}" ${pp.selected.has(m.groupId) ? 'checked' : ''} aria-label="Sélectionner ${esc(m.name)}"></td>` +
          `<td><strong>${esc(m.name)}</strong>${m.url ? `<small><a href="${esc(m.url)}" target="_blank" rel="noreferrer">${esc(m.url.replace(/^https:\/\/(www\.)?facebook\.com/, ''))}</a></small>` : ''}</td>` +
          `<td>${m.category ? `<span class="chip">${esc(m.category.name)}</span>` : '<span class="muted">—</span>'}</td>` +
          `<td><span class="chip ${JOIN_CLASS[m.joinStatus] || ''}">${JOIN_TEXT[m.joinStatus] || m.joinStatus}</span>` +
          (m.memberActionError ? `<small class="bad" title="${esc(m.memberActionError)}">⚠ vérificateur</small>` : '') + `</td>` +
          `<td>${preApprovalCell(m)}</td>` +
          `<td>${m.waiting}</td>` +
          `<td><div class="row-actions">` +
          (m.joinStatus !== 'JOINED' ? `<button class="edit" type="button" data-pp-joined="${m.groupId}" title="Il a bien rejoint ce groupe sur Facebook">✓ rejoint</button>` : '') +
          (m.joinStatus === 'JOINED' && isAdminUser()
            ? `<button class="edit" type="button" data-pp-audit="${m.linkId}" ${m.auditPending ? 'disabled' : ''} title="Le modérateur regarde sur Facebook si la pré-approbation est faite, sans rien modifier">🔍 Tester</button>`
            : '') +
          `<button class="danger" type="button" data-pp-unlink="${m.groupId}" data-name="${esc(m.name)}">Retirer</button></div></td></tr>`,
      )
      .join('') || `<tr><td colspan="7" class="empty">${all.length ? 'Aucun groupe pour ce filtre.' : 'Lié à aucun groupe : ajoutez-en ci-dessous.'}</td></tr>`;
  $('#pp-check-all').checked = rows.length > 0 && rows.every((m) => pp.selected.has(m.groupId));
  $('#pp-group-bar').hidden = !pp.selected.size;
  $('#pp-group-selected').textContent = `${pp.selected.size} groupe(s) sélectionné(s)`;
}
['#pp-group-search', '#pp-group-join'].forEach((id) => ($(id).oninput = $(id).onchange = () => state.profilePage && renderMemberships()));
$('#pp-check-all').onchange = (e) => {
  const pp = state.profilePage;
  const text = $('#pp-group-search').value.trim().toLowerCase();
  const join = $('#pp-group-join').value;
  for (const m of pp.data.memberships) {
    if ((!text || m.name.toLowerCase().includes(text)) && (!join || m.joinStatus === join)) {
      if (e.target.checked) pp.selected.add(m.groupId);
      else pp.selected.delete(m.groupId);
    }
  }
  renderMemberships();
};
$('#pp-memberships').addEventListener('change', (e) => {
  const id = e.target.dataset.ppSelect;
  if (!id) return;
  if (e.target.checked) state.profilePage.selected.add(id);
  else state.profilePage.selected.delete(id);
  renderMemberships();
});
async function ppUnlink(groupIds, label) {
  const pp = state.profilePage;
  if (!confirm(`Retirer « ${pp.data.profile.name} » de ${label} ?\nIl ne publiera plus dans ${groupIds.length > 1 ? 'ces groupes' : 'ce groupe'}.`)) return;
  try {
    const r = await api('/bulk/link', { method: 'POST', body: JSON.stringify({ profileIds: [pp.id], groupIds, action: 'unlink' }) });
    notice(`${r.removed} liaison(s) retirée(s).`);
    await renderProfilePage(pp.id);
  } catch (x) {
    notice(x.message, 'error');
  }
}
async function ppMarkJoined(groupIds) {
  const pp = state.profilePage;
  try {
    for (const g of groupIds) {
      await api(`/groups/${g}/profiles/${pp.id}/join-status`, { method: 'PATCH', body: JSON.stringify({ joinStatus: 'JOINED' }) });
    }
    notice(`${groupIds.length} adhésion(s) marquée(s) « rejoint ».`);
    await renderProfilePage(pp.id);
  } catch (x) {
    notice(x.message, 'error');
  }
}
$('#pp-memberships').addEventListener('click', (e) => {
  const audit = e.target.dataset.ppAudit;
  if (audit) {
    void requestAudit({ mode: 'check', profileGroupIds: [audit] }, e.target).then((r) => r && renderProfilePage(state.profilePage.id));
    return;
  }
  const unlink = e.target.dataset.ppUnlink;
  if (unlink) return void ppUnlink([unlink], `« ${e.target.dataset.name} »`);
  const joined = e.target.dataset.ppJoined;
  if (joined) return void ppMarkJoined([joined]);
});
$('#pp-unlink').onclick = () => ppUnlink([...state.profilePage.selected], `${state.profilePage.selected.size} groupe(s)`);
$('#pp-mark-joined').onclick = () => ppMarkJoined([...state.profilePage.selected]);
$('#pp-audit-selected').onclick = (e) => {
  const pp = state.profilePage;
  const ids = pp.data.memberships.filter((m) => pp.selected.has(m.groupId) && m.joinStatus === 'JOINED').map((m) => m.linkId);
  if (!ids.length) return notice('Sélectionnez des groupes où il est membre (« Rejoint »).', 'error');
  void requestAudit({ mode: 'check', profileGroupIds: ids }, e.target).then((r) => r && renderProfilePage(pp.id));
};

/** Les groupes qu'on peut encore lui lier, par catégorie et recherche. */
async function loadAddableGroups() {
  const pp = state.profilePage;
  const category = $('#pp-add-category');
  category.innerHTML =
    '<option value="">Toutes les catégories</option>' +
    (state.categories || []).map((c) => `<option value="${c.id}">${esc(c.name)}</option>`).join('') +
    '<option value="none">Sans catégorie</option>';
  category.value = pp.addCategory || '';
  try {
    const rows = await api('/bulk/groups');
    pp.addable = Array.isArray(rows) ? rows : [];
  } catch (x) {
    pp.addable = [];
    notice(x.message, 'error');
  }
  renderAddable();
}
function addableVisible() {
  const pp = state.profilePage;
  const linked = new Set((pp.data.memberships || []).map((m) => m.groupId));
  const cat = $('#pp-add-category').value;
  const text = $('#pp-add-search').value.trim().toLowerCase();
  return (pp.addable || []).filter(
    (g) =>
      !linked.has(g.id) &&
      g.status === 'ACTIVE' &&
      (!cat || (cat === 'none' ? !g.category : g.category?.id === cat)) &&
      (!text || g.name.toLowerCase().includes(text) || (g.url || '').toLowerCase().includes(text)),
  );
}
function renderAddable() {
  const pp = state.profilePage;
  const list = addableVisible();
  $('#pp-add-list').innerHTML =
    list
      .map(
        (g) =>
          `<label class="pick"><input type="checkbox" data-pp-add="${g.id}" ${pp.add.has(g.id) ? 'checked' : ''}>` +
          `<span><b>${esc(g.name)}</b><small>${g.category ? esc(g.category.name) : 'sans catégorie'} · ${g._count.profiles} profil(s)</small></span></label>`,
      )
      .join('') || '<div class="empty">Aucun groupe à ajouter pour ce filtre.</div>';
  $('#pp-add').disabled = !pp.add.size;
  $('#pp-add').textContent = pp.add.size ? `Lier aux ${pp.add.size} groupe(s) coché(s)` : 'Lier aux groupes cochés';
}
$('#pp-add-category').onchange = () => {
  state.profilePage.addCategory = $('#pp-add-category').value;
  renderAddable();
};
$('#pp-add-search').oninput = () => renderAddable();
$('#pp-add-list').addEventListener('change', (e) => {
  const id = e.target.dataset.ppAdd;
  if (!id) return;
  if (e.target.checked) state.profilePage.add.add(id);
  else state.profilePage.add.delete(id);
  renderAddable();
});
$('#pp-add-all').onclick = () => {
  for (const g of addableVisible()) state.profilePage.add.add(g.id);
  renderAddable();
};
$('#pp-add-none').onclick = () => {
  state.profilePage.add.clear();
  renderAddable();
};
$('#pp-add').onclick = async () => {
  const pp = state.profilePage;
  $('#pp-add').disabled = true;
  try {
    const r = await api('/bulk/link', { method: 'POST', body: JSON.stringify({ profileIds: [pp.id], groupIds: [...pp.add], action: 'link' }) });
    notice(`${r.created + r.reactivated} groupe(s) lié(s) à ${pp.data.profile.name}${r.already ? ` (${r.already} déjà lié(s))` : ''}. Ils sont « à rejoindre » : l’extension d’adhésion s’en charge.`);
    await renderProfilePage(pp.id);
  } catch (x) {
    notice(x.message, 'error');
    $('#pp-add').disabled = false;
  }
};

/* ── Profils : leurs statistiques ──────────────────────────────────── */
function profileMetrics(p) {
  const st = state.profileStats?.[p.id];
  if (!st)
    return `<div class="metrics"><div><strong>${p._count.profileGroups}</strong><span>groupes liés</span></div><div><strong>${p._count.posts}</strong><span>posts</span></div></div>`;
  const g = st.groups;
  const state_ = st.atWork
    ? '<span class="chip join-joined">au travail</span>'
    : st.mode === 'OFF'
      ? '<span class="chip join-not_joined">arrêté</span>'
      : '<span class="chip join-requested">en attente</span>';
  return (
    `<div class="metrics profile-stats">` +
    `<div><strong>${st.publishedToday}</strong><span>publiés aujourd’hui</span></div>` +
    `<div><strong>${st.publishedWeek}</strong><span>sur 7 jours</span></div>` +
    `<div><strong>${st.publishedTotal}</strong><span>au total</span></div>` +
    `<div class="${st.failedWeek ? 'bad' : ''}"><strong>${st.failedWeek}</strong><span>échecs (7 j)</span></div>` +
    `<div><strong>${st.stock}</strong><span>posts qui l’attendent</span></div>` +
    `<div><strong>${g.joined}</strong><span>groupes rejoints</span></div>` +
    `</div>` +
    `<p class="profile-line">${state_} ` +
    (g.requested ? `<span class="chip join-requested">${g.requested} demande(s)</span> ` : '') +
    (g.pending ? `<span class="chip join-not_joined">${g.pending} à rejoindre</span> ` : '') +
    (g.failed ? `<span class="chip join-failed">${g.failed} échec(s)</span> ` : '') +
    `<small>${st.lastPublishedAt ? `dernière publication ${esc(ago(st.lastPublishedAt))}` : 'aucune publication encore'}</small></p>`
  );
}

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
          `<article class="profile-card ${p.status === 'INACTIVE' ? 'inactive' : ''} ${p.health?.suggestDeactivate ? 'flagged' : ''}"><div class="card-head"><button type="button" class="person person-link" data-profile-detail="${p.id}" title="Statistiques détaillées"><span class="avatar">${initials(p.name)}</span><div><h3>${esc(p.name)}</h3><p>${esc(p.externalId || 'Sans identifiant')}</p></div></button><span class="status">${p.status === 'ACTIVE' ? 'ACTIF' : 'INACTIF'}</span></div><p class="profile-health">${healthBadge(p.health)}</p>${profileMetrics(p)}<div class="card-actions"><button class="edit" data-profile-detail="${p.id}">Ouvrir sa page</button><button class="edit" ${p.status === 'ACTIVE' ? `data-deactivate-profile="${p.id}"` : `data-toggle-profile="${p.id}"`}>${p.status === 'ACTIVE' ? 'Désactiver' : 'Activer'}</button><button class="edit" data-edit-profile="${p.id}">Modifier</button><button class="danger" data-delete-profile="${p.id}">Supprimer</button></div></article>`,
      )
      .join('') || '<div class="empty">Créez votre premier profil.</div>';
  $('#group-rows').innerHTML =
    state.groups
      .map(
        (g) =>
          `<tr class="${g.status === 'INACTIVE' ? 'inactive' : ''}"><td><strong>${esc(g.name)}</strong><small>${g.status === 'ACTIVE' ? 'ACTIF' : 'INACTIF'} · ${esc(g.externalId || '—')}</small></td><td>${g.category ? `<span class="chip">${esc(g.category.name)}</span>` : '<span class="chip join-questions" title="Modifiez le groupe pour lui choisir une catégorie : sans elle, il ne reçoit aucun article">À ranger</span>'}</td><td><a href="${esc(g.url)}" target="_blank">${esc(g.url)}</a></td><td>${groupProfilesCell(g)}</td><td>${g._count.targets}</td><td><span class="stock ${g.availablePosts <= 4 ? 'low' : ''}">${g.availablePosts}</span></td><td><div class="row-actions"><button class="edit" data-toggle-group="${g.id}">${g.status === 'ACTIVE' ? 'Désactiver' : 'Activer'}</button><button class="edit" data-share-group="${g.id}">Partager</button><button class="edit" data-edit-group="${g.id}">Modifier</button><button class="danger" data-clear-group="${g.id}" ${g._count.targets ? '' : 'disabled'}>Retirer les posts</button><button class="danger" data-delete-group="${g.id}">Supprimer</button></div></td></tr>`,
      )
      .join('') ||
    '<tr><td colspan="6"><div class="empty">Aucun groupe</div></td></tr>';
  renderProfileFilters();
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
/** Un profil « à vérifier » : quelque chose empêche qu'il publie alors
 * qu'on le lui demande, ou il ne répond plus. C'est le filtre du matin. */
function runnerTags(r) {
  const tags = new Set();
  if (r.atWork) tags.add('working');
  if (r.shouldRun) tags.add('should');
  if (r.shouldRun && !r.atWork) tags.add('idle');
  if (r.running && !r.atWork) tags.add('silent');
  if (r.browserState === 'RUNNING') tags.add('browser-open');
  if (r.browserState === 'ERROR') tags.add('browser-error');
  const pairing = r.pairing?.state || (r.pairedAt ? 'confirmed' : 'never');
  if (pairing === 'never' || pairing === 'code_pending') tags.add('unpaired');
  if (r.pairing?.broken) tags.add('pairing-broken');
  if (pairing === 'unconfirmed' || pairing === 'stale') tags.add('pairing-unconfirmed');
  if (r.status === 'INACTIVE') tags.add('inactive');
  if (
    r.status === 'ACTIVE' &&
    (tags.has('silent') || tags.has('browser-error') || tags.has('idle') ||
      tags.has('pairing-broken') ||
      (r.mode !== 'OFF' && tags.has('unpaired')))
  )
    tags.add('check');
  return tags;
}
function filteredRunners() {
  const { search, mode, state: wanted } = state.runnerFilters;
  const needle = search.trim().toLowerCase();
  return (state.runners?.profiles || []).filter(
    (r) =>
      (!needle ||
        r.name.toLowerCase().includes(needle) ||
        (r.externalId || '').toLowerCase().includes(needle)) &&
      (!mode || r.mode === mode) &&
      (!wanted || runnerTags(r).has(wanted)),
  );
}
const runnerFiltered = () =>
  Boolean(state.runnerFilters.search.trim() || state.runnerFilters.mode || state.runnerFilters.state);

/** L'état RÉEL de l'appairage, calculé par l'API : clé encore valable,
 * identifiant inchangé, battements reçus ou refusés. */
const PAIRING_LABELS = {
  confirmed: ['joined', 'appairé ✓'],
  unconfirmed: ['requested', 'non confirmé'],
  stale: ['questions', 'à confirmer'],
  key_changed: ['failed', 'à ré-appairer'],
  id_changed: ['failed', 'à ré-appairer'],
  rejected: ['failed', 'refusé'],
  code_pending: ['requested', 'code émis'],
  never: ['not_joined', 'jamais appairé'],
};
function pairingCell(r) {
  const p = r.pairing || { state: r.pairedAt ? 'confirmed' : 'never', detail: '' };
  const [tone, label] = PAIRING_LABELS[p.state] || ['not_joined', p.state];
  const since = r.pairedAt ? ` · appairé ${ago(r.pairedAt)}` : '';
  return (
    `<span class="chip join-${tone}" title="${esc(p.detail)}">${label}</span>` +
    `<small class="pairing-detail" title="${esc(p.detail)}">${esc(p.detail)}${esc(since)}</small>`
  );
}

/* ── L'objectif du jour ─────────────────────────────────────────────── */
const PACE_TEXT = {
  no_target: ['neutral', 'Aucun objectif réglé'],
  not_started: ['neutral', 'La plage de publication n’a pas commencé'],
  ahead: ['good', 'En avance'],
  on_track: ['good', 'Dans les temps'],
  late: ['bad', 'En retard'],
  reached: ['good', 'Objectif atteint'],
  missed: ['bad', 'Objectif manqué'],
};
async function loadObjective() {
  try {
    state.objective = await api('/insights/objective');
    renderObjective();
  } catch (e) {
    notice(e.message, 'error');
  }
}
function renderObjective() {
  const o = state.objective;
  if (!o) return;
  const p = o.pace;
  const f = $('#objective-form');
  // Ne pas écraser ce que l'on est en train de saisir.
  if (!f.contains(document.activeElement)) {
    f.elements.dailyTarget.value = o.settings.dailyTarget || '';
    f.elements.objectiveStart.value = minutesToTime(o.settings.objectiveStart);
    f.elements.objectiveEnd.value = minutesToTime(o.settings.objectiveEnd);
  }
  const [tone, label] = PACE_TEXT[p.status] || ['neutral', p.status];
  const window_ = `${minutesToTime(o.settings.objectiveStart)} → ${minutesToTime(o.settings.objectiveEnd)}`;
  $('#obj-title').textContent = p.target
    ? `${p.published} / ${p.target} publications aujourd’hui`
    : `${p.published} publication(s) aujourd’hui`;
  $('#obj-status').className = `obj-status ${tone}`;
  $('#obj-status').innerHTML =
    `<b>${label}</b>` +
    (p.target && !['no_target', 'reached'].includes(p.status)
      ? ` · attendu à cette heure : ${p.expected} (${p.delta >= 0 ? '+' : ''}${p.delta})`
      : '') +
    `<span>plage ${window_} · mis à jour ${new Date(o.serverTime).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>`;

  // La barre : publié, et le repère de ce qui est attendu maintenant.
  const pct = (n) => (p.target ? Math.min(100, (n / p.target) * 100) : 0);
  $('#obj-progress').setAttribute('aria-label', `${p.published} publiés sur ${p.target}, ${p.expected} attendus`);
  $('#obj-progress').innerHTML = p.target
    ? `<div class="obj-bar"><i class="done ${tone}" style="width:${pct(p.published)}%"></i>` +
      `<b class="expected" style="left:${pct(p.expected)}%" title="Attendu à cette heure : ${p.expected}"></b></div>`
    : '';

  const kpi = (value, labelText, sub = '', cls = '') =>
    `<div class="obj-kpi ${cls}"><strong>${value}</strong><span>${labelText}</span>${sub ? `<small>${sub}</small>` : ''}</div>`;
  $('#obj-kpis').innerHTML =
    kpi(p.remaining, 'reste à publier', p.target ? `sur ${p.target}` : '') +
    kpi(`${p.ratePerHour}/h`, 'rythme actuel', p.target && p.minutesLeft ? `il faut ${p.neededPerHour}/h` : '', p.target && p.ratePerHour < p.neededPerHour ? 'bad' : '') +
    kpi(p.projection, 'projection fin de plage', p.target ? (p.projection >= p.target ? 'objectif tenu' : `manque ${p.target - p.projection}`) : '', p.target && p.projection < p.target ? 'bad' : '') +
    kpi(o.stock.publishable, 'posts prêts', o.stock.blocked ? `+${o.stock.blocked} bloqués` : 'dans des groupes actifs', o.stock.deficit ? 'bad' : '') +
    kpi(o.articles.needed, 'articles à importer', `${o.articles.today} reçu(s) aujourd’hui`, o.articles.needed ? 'bad' : '') +
    kpi(`${o.profiles.atWork}/${o.profiles.participating}`, 'profils au travail', o.profiles.share ? `${o.profiles.share} posts chacun` : '');

  $('#obj-advice').innerHTML = o.advice
    .map((a) => `<li class="${a.level}"><span>${a.level === 'ok' ? '✓' : a.level === 'error' ? '✕' : '!'}</span>${esc(a.text)}</li>`)
    .join('');

  // Heure par heure : une seule série, barres fines ancrées à la base.
  const max = Math.max(1, ...o.hourly);
  const nowHour = Number(new Date(o.serverTime).toLocaleString('fr-FR', { hour: '2-digit', hour12: false, timeZone: o.settings.objectiveTimezone }).slice(0, 2));
  $('#obj-chart').innerHTML =
    '<div class="bars">' +
    o.hourly
      .map((n, h) => {
        const inWindow = h * 60 >= o.settings.objectiveStart - 59 && h * 60 < o.settings.objectiveEnd;
        return `<div class="bar-col ${inWindow ? '' : 'off'} ${h === nowHour ? 'now' : ''}" title="${String(h).padStart(2, '0')} h : ${n} publication(s)">` +
          `<i style="height:${(n / max) * 100}%"></i><span>${h % 3 === 0 ? String(h).padStart(2, '0') : ''}</span></div>`;
      })
      .join('') +
    `</div><p class="obj-chart-note">Maximum : ${max} en une heure · heures de ${o.settings.objectiveTimezone}</p>`;

  const table = (head, rows, empty) =>
    rows.length ? `<table><thead><tr>${head.map((h) => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table>` : `<p class="muted">${empty}</p>`;
  $('#obj-categories').innerHTML = table(
    ['Catégorie', 'Groupes prêts', 'Publiés', 'Stock prêt', 'Articles à importer'],
    o.categories.map(
      (c) =>
        `<tr><td><b>${esc(c.name)}</b></td><td>${c.publishableGroups}/${c.groups}${c.id && c.publishableGroups ? `<small>1 article = ${c.publishableGroups} post(s)</small>` : c.id ? '<small>aucun groupe prêt</small>' : '<small>à ranger dans une catégorie</small>'}</td>` +
        `<td>${c.publishedToday}</td><td>${c.stockPublishable}${c.stock > c.stockPublishable ? `<small>+${c.stock - c.stockPublishable} bloqués</small>` : ''}</td>` +
        `<td class="${c.articlesNeeded ? 'bad' : ''}">${c.articlesNeeded || '—'}</td></tr>`,
    ),
    'Aucun groupe actif.',
  );
  $('#obj-profiles').innerHTML = table(
    ['Profil', 'Publiés', 'Part', 'Groupes', 'État'],
    o.profiles.rows.map((r) => {
      const share = r.share ? Math.min(100, Math.round((r.publishedToday / r.share) * 100)) : 0;
      return (
        `<tr class="${r.participating ? '' : 'inactive'}"><td><b>${esc(r.name)}</b></td><td>${r.publishedToday}</td>` +
        `<td>${r.share ? `${r.publishedToday}/${r.share}<div class="mini-bar"><i style="width:${share}%"></i></div>` : '—'}</td>` +
        `<td>${r.joinedGroups}</td><td>${r.atWork ? '<span class="chip join-joined">au travail</span>' : r.mode === 'OFF' ? '<span class="chip join-not_joined">arrêté</span>' : !r.joinedGroups ? '<span class="chip join-questions">aucun groupe</span>' : '<span class="chip join-requested">en attente</span>'}</td></tr>`
      );
    }),
    'Aucun profil actif.',
  );
  $('#obj-groups').innerHTML = table(
    ['Groupe', 'Publiés', 'Stock', 'Profils'],
    o.groups.slice(0, 30).map(
      (g) =>
        `<tr class="${g.blocked ? 'blocked' : ''}"><td><b title="${esc(g.name)}">${esc(g.name)}</b><small>${esc(g.category?.name || 'sans catégorie')}</small></td>` +
        `<td>${g.publishedToday}</td><td>${g.stock}</td>` +
        `<td>${g.blocked ? `<span class="chip join-failed">${g.blocked === 'no_profile' ? 'aucun profil' : g.blocked === 'requests_pending' ? `${g.pendingJoins} demande(s) en attente` : 'profils arrêtés'}</span>` : `${g.participants.length} profil(s)`}</td></tr>`,
    ),
    'Aucun groupe actif.',
  );
}
$('#objective-form').onsubmit = async (e) => {
  e.preventDefault();
  const f = e.target.elements;
  try {
    await api('/settings', {
      method: 'PATCH',
      body: JSON.stringify({
        dailyTarget: Number(f.dailyTarget.value || 0),
        objectiveStart: timeToMinutes(f.objectiveStart.value) ?? 480,
        objectiveEnd: timeToMinutes(f.objectiveEnd.value) ?? 1320,
      }),
    });
    notice('Objectif enregistré.');
    document.activeElement?.blur?.();
    await loadObjective();
    loadCounters();
  } catch (x) {
    notice(x.message, 'error');
  }
};

/* ── Repartir de zéro (administrateurs) ────────────────────────────── */
async function loadResetCounts() {
  try {
    const c = await api('/admin/reset', { method: 'POST', body: JSON.stringify({ dryRun: true }) });
    state.resetCounts = c;
    $('#reset-counts').innerHTML =
      `<span><b>${c.posts}</b> post(s)</span><span><b>${c.postsFromArticles}</b> venant d’articles</span>` +
      `<span><b>${c.articles}</b> article(s)</span><span><b>${c.published}</b> publication(s) faites</span>` +
      (c.activeJobs ? `<span class="bad"><b>${c.activeJobs}</b> lot(s) en cours</span>` : '');
  } catch (x) {
    $('#reset-counts').textContent = x.message;
  }
}
/** Le choix courant de la fenêtre, tel que l'API l'attend. */
function resetChoice() {
  const f = $('#reset-form').elements;
  return {
    posts: f.posts.checked,
    articles: f.articles.checked,
    articlePosts: f.articlePosts.value || undefined,
    unarchive: f.unarchive.checked,
  };
}
/** À chaque changement : montrer la bonne question, et dire exactement ce
 * qui partira — l'API calcule le plan à blanc. */
async function refreshResetPlan() {
  const c = state.resetCounts;
  const choice = resetChoice();
  const articlesOnly = choice.articles && !choice.posts;
  const askPosts = articlesOnly && c.postsFromArticles > 0;
  $('#reset-article-posts').hidden = !askPosts;
  $('#reset-article-posts-title').textContent =
    `${c.postsFromArticles} post(s) viennent de ces articles : que faut-il en faire ?`;
  const offerUnarchive = choice.posts && !choice.articles && c.archivedArticles > 0;
  $('#reset-unarchive-row').hidden = !offerUnarchive;
  if (!offerUnarchive) $('#reset-form').elements.unarchive.checked = false;
  const summary = $('#reset-summary');
  if (!choice.posts && !choice.articles) {
    summary.innerHTML = '<p class="muted">Cochez ce que vous voulez effacer.</p>';
    $('#reset-submit').disabled = true;
    $('#reset-force-row').hidden = true;
    return;
  }
  if (askPosts && !choice.articlePosts) {
    summary.innerHTML = '<p class="warn">Dites ce qu’il faut faire des posts liés à ces articles.</p>';
    $('#reset-submit').disabled = true;
    return;
  }
  try {
    const { plan, activeJobs } = await api('/admin/reset', {
      method: 'POST',
      body: JSON.stringify({ ...choice, dryRun: true }),
    });
    const lines = [];
    if (plan.posts) lines.push(`<li><b>${plan.posts}</b> post(s) supprimé(s), avec leurs publications par groupe</li>`);
    if (plan.articles) lines.push(`<li><b>${plan.articles}</b> article(s) supprimé(s)</li>`);
    if (plan.postsDetached) lines.push(`<li><b>${plan.postsDetached}</b> post(s) gardé(s), sans article</li>`);
    if (plan.articlesUnarchived) lines.push(`<li><b>${plan.articlesUnarchived}</b> article(s) désarchivé(s) : ils pourront redonner des posts</li>`);
    if (choice.posts && !choice.articles) lines.push('<li>Les articles restent</li>');
    if (choice.articles && !choice.posts && !plan.posts) lines.push('<li>Aucun post supprimé</li>');
    const blocked = plan.posts > 0 && activeJobs > 0;
    summary.innerHTML =
      `<p>Ce qui va se passer :</p><ul>${lines.join('')}</ul>` +
      (blocked ? `<p class="warn"><b>${activeJobs} lot(s) sont en cours de publication.</b> Coupez la publication dans le Pilotage et attendez, ou forcez.</p>` : '') +
      (plan.articles ? '<p class="warn">Les sites WordPress ne renverront pas les articles déjà transmis : seuls ceux publiés ou modifiés ensuite reviendront.</p>' : '');
    $('#reset-force-row').hidden = !blocked;
    $('#reset-submit').disabled = false;
  } catch (x) {
    summary.textContent = x.message;
  }
}
$('#reset-open').onclick = async () => {
  await loadResetCounts();
  const c = state.resetCounts;
  if (!c) return;
  $('#reset-form').reset();
  $('#reset-posts-info').textContent =
    `${c.posts} post(s), dont ${c.published} publication(s) déjà faites` +
    (c.postsFromArticles ? ` · ${c.postsFromArticles} venant d’articles` : '');
  $('#reset-articles-info').textContent =
    `${c.articles} article(s)` + (c.archivedArticles ? `, dont ${c.archivedArticles} archivé(s)` : '');
  $('#reset-unarchive-label').textContent =
    `Désarchiver les ${c.archivedArticles} article(s) archivés, pour qu’ils redonnent des posts`;
  $('#reset-modal').showModal();
  refreshResetPlan();
};
$('#reset-form').addEventListener('change', (e) => {
  if (e.target.name !== 'confirm' && e.target.name !== 'force') refreshResetPlan();
});
$('#reset-form').onsubmit = async (e) => {
  e.preventDefault();
  const f = e.target.elements;
  try {
    const r = await api('/admin/reset', {
      method: 'POST',
      body: JSON.stringify({ ...resetChoice(), confirm: f.confirm.value.trim(), force: f.force.checked }),
    });
    $('#reset-modal').close();
    const d = r.deleted;
    notice(
      [
        d.posts && `${d.posts} post(s) supprimé(s)`,
        d.articles && `${d.articles} article(s) supprimé(s)`,
        d.postsDetached && `${d.postsDetached} post(s) gardé(s) sans article`,
        d.articlesUnarchived && `${d.articlesUnarchived} article(s) désarchivé(s)`,
      ]
        .filter(Boolean)
        .join(' · ') || 'Rien à effacer.',
    );
    await load();
    loadResetCounts();
  } catch (x) {
    notice(x.message, 'error');
  }
};

async function loadRunners() {
  try {
    [state.runners, state.verifyOverview] = await Promise.all([
      api('/runners'),
      api('/admin/verify').catch(() => null),
    ]);
    renderRunners();
    renderMembers();
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
  const shown = filteredRunners();
  const filtered = runnerFiltered();
  const toCheck = data.profiles.filter((r) => runnerTags(r).has('check')).length;
  $('#runner-count').innerHTML =
    (filtered ? `<b>${shown.length}</b> profil(s) sur ${data.profiles.length}` : `${data.profiles.length} profil(s)`) +
    (toCheck ? ` · <button class="link warn-link" data-runner-check type="button">⚠ ${toCheck} à vérifier</button>` : '');
  $('#runner-filters-reset').hidden = !filtered;
  // Filtrés : les boutons de masse ne visent que ce qui est affiché — sinon
  // « Tout arrêter » couperait aussi ce qu'on ne voit pas.
  $('#runners-all-auto').textContent = filtered ? `Mettre en auto (${shown.length})` : 'Tout en auto';
  $('#runners-all-off').textContent = filtered ? `Arrêter (${shown.length})` : 'Tout arrêter';
  $('#runners-all-auto').disabled = $('#runners-all-off').disabled = filtered && !shown.length;
  $('#runner-rows').innerHTML =
    shown
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
        const paired = pairingCell(r);
        return `<tr class="${r.status === 'INACTIVE' ? 'inactive' : ''}">
        <td><strong>${esc(r.name)}</strong>${r.isModerator ? ' <span class="chip moderator" title="Ce profil vérifie les publications des autres (extension FB Post Checker)">vérificateur</span>' : ''}<small>${esc(r.externalId || 'sans identifiant NSTBrowser')}</small>` +
          `<small>${r.facebookUserId
            ? `<a href="https://www.facebook.com/profile.php?id=${esc(r.facebookUserId)}" target="_blank" rel="noreferrer" title="${esc(r.facebookName || '')}">Facebook ${esc(r.facebookUserId)}</a>`
            : '<span class="fb-missing" title="Remonté automatiquement par l’extension de publication (≥ 1.3.0) au prochain battement ; sans lui, le vérificateur ne peut ni accepter son adhésion ni le pré-approuver">⚠ compte Facebook inconnu</span>'}` +
          ` <button class="link inline-link" type="button" data-fb-id="${r.profileId}" data-current="${esc(r.facebookUserId || '')}">${r.facebookUserId ? 'modifier' : 'saisir'}</button></small></td>
        <td>${paired}</td>
        <td><select data-runner-mode="${r.profileId}" ${r.isModerator && state.me?.role !== 'ADMIN' ? 'disabled title="Profil modérateur : réservé aux administrateurs"' : ''}>${modes}</select><small class="${r.shouldRun ? '' : 'muted'}">${r.shouldRun ? '▶ doit publier' : '■ ' + esc(r.reason)}</small></td>
        <td>${esc(r.window)}<small>${esc(r.timezone)}</small></td>
        <td>${browser}<small>${esc(ago(r.browserSeenAt))}${r.browserMessage ? ' · ' + esc(r.browserMessage) : ''}</small></td>
        <td>${worker}<small>${esc(ago(r.lastSeenAt))}</small></td>
        <td>${r.published} publiés · ${r.failed} échecs · ${r.links} liens${r.message ? `<small>${esc(r.message)}</small>` : ''}</td>
        <td><div class="row-actions"><button class="edit" data-runner-pair="${r.profileId}">${r.pairedAt ? 'Ré-appairer' : 'Appairer'}</button><button class="edit" data-runner-edit="${r.profileId}">Réglages</button><button class="edit admin-only" data-runner-moderator="${r.profileId}" data-on="${r.isModerator ? '1' : ''}" title="Le vérificateur ouvre les posts publiés par les autres profils, vérifie le lien, supprime et fait republier ce qui est en défaut. Il doit être administrateur des groupes.">${r.isModerator ? 'Retirer vérificateur' : 'Vérificateur'}</button></div></td>
      </tr>`;
      })
      .join('') ||
    `<tr><td colspan="8"><div class="empty">${filtered ? 'Aucun profil pour ces filtres.' : 'Aucun profil à piloter.'}</div></td></tr>`;
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
  $$('[data-fb-id]').forEach(
    (button) =>
      (button.onclick = async () => {
        const value = prompt(
          'Identifiant Facebook NUMÉRIQUE de ce profil (vide pour l’effacer).\nNormalement remonté seul par l’extension de publication.',
          button.dataset.current || '',
        );
        if (value === null || value === undefined) return;
        try {
          await api(`/admin/verify/profiles/${button.dataset.fbId}`, {
            method: 'PATCH',
            body: JSON.stringify({ facebookUserId: String(value).trim() }),
          });
          notice('Identifiant Facebook enregistré.');
          await loadRunners();
        } catch (x) {
          notice(x.message, 'error');
        }
      }),
  );
  $$('[data-runner-moderator]').forEach(
    (button) =>
      (button.onclick = async () => {
        const isModerator = !button.dataset.on;
        button.disabled = true;
        try {
          const p = await api(`/admin/verify/profiles/${button.dataset.runnerModerator}`, {
            method: 'PATCH',
            body: JSON.stringify({ isModerator }),
          });
          notice(isModerator ? `${p.name} vérifie désormais les publications.` : `${p.name} n’est plus vérificateur.`);
          await loadRunners();
        } catch (x) {
          notice(x.message, 'error');
          button.disabled = false;
        }
      }),
  );
}
/** Ce que le vérificateur fait pour nos profils dans les groupes. */
function renderMembers() {
  const m = state.verifyOverview?.members;
  const panel = $('#members-panel');
  if (!m || !Array.isArray(m.problems)) {
    panel.hidden = true;
    return;
  }
  panel.hidden = false;
  $('#members-summary').textContent =
    `${m.approved} adhésion(s) acceptée(s) · ${m.preApproved} pré-approuvé(s) · ${m.due} à faire` +
    (m.unknownIdentity ? ` · ${m.unknownIdentity} profil(s) sans compte Facebook connu` : '');
  $('#members-problems').innerHTML =
    m.problems
      .map(
        (p) =>
          `<tr><td><strong>${esc(p.profile.name)}</strong><small>${p.kind === 'approve' ? 'adhésion' : 'pré-approbation'}</small></td>` +
          `<td>${p.group.url ? `<a href="${esc(p.group.url)}" target="_blank" rel="noreferrer">${esc(p.group.name)}</a>` : esc(p.group.name)}</td>` +
          `<td><div class="queue-error" title="${esc(p.error || '')}">${esc(p.error || '')}</div>` +
          `<small>${esc(when(p.at))} · ${p.attempts} essai(s)${p.gaveUp ? ' · abandonné' : ''}</small></td>` +
          `<td><button class="edit" data-member-retry="${p.taskId}">↻ Relancer</button></td></tr>`,
      )
      .join('') || '<tr><td colspan="4" class="empty">Aucun problème.</td></tr>';
  $$('[data-member-retry]').forEach(
    (button) =>
      (button.onclick = async () => {
        button.disabled = true;
        try {
          await api(`/admin/verify/members/${button.dataset.memberRetry}/retry`, { method: 'POST' });
          notice('Relancé : le vérificateur réessaiera à son prochain passage.');
          await loadRunners();
        } catch (x) {
          notice(x.message, 'error');
          button.disabled = false;
        }
      }),
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
  const verb = mode === 'OFF' ? 'Arrêter' : 'Passer en auto';
  // Filtrés : seulement les profils actifs affichés, un par un.
  if (runnerFiltered()) {
    const targets = filteredRunners().filter((r) => r.status === 'ACTIVE');
    if (!targets.length) return notice('Aucun profil actif parmi ceux affichés.', 'error');
    if (!confirm(`${verb} les ${targets.length} profil(s) affiché(s) ?\n${targets.map((r) => '• ' + r.name).join('\n')}`)) return;
    let done = 0;
    for (const r of targets) {
      try {
        await api(`/runners/${r.profileId}`, { method: 'PATCH', body: JSON.stringify({ mode }) });
        done += 1;
      } catch (e) {
        notice(`${r.name} : ${e.message}`, 'error');
      }
    }
    notice(`${done} profil(s) réglé(s) sur ${targets.length}`);
    return loadRunners();
  }
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
/* Les filtres du Pilotage : appliqués dans la page, la liste est complète. */
$('#runner-search').oninput = (e) => {
  state.runnerFilters.search = e.target.value;
  renderRunners();
};
$('#runner-mode-filter').onchange = (e) => {
  state.runnerFilters.mode = e.target.value;
  renderRunners();
};
$('#runner-state-filter').onchange = (e) => {
  state.runnerFilters.state = e.target.value;
  renderRunners();
};
$('#runner-filters-reset').onclick = () => {
  state.runnerFilters = { search: '', mode: '', state: '' };
  $('#runner-search').value = '';
  $('#runner-mode-filter').value = '';
  $('#runner-state-filter').value = '';
  renderRunners();
};
/** Vérifier tous les appairages d'un coup : l'API compare, pour chaque
 * profil appairé, la clé du navigateur à celle du compte, l'identifiant, et
 * ses battements. Le résultat reste affiché, et les profils à refaire sont
 * filtrés d'emblée. */
$('#runners-pairing-check').onclick = async (e) => {
  const button = e.target;
  button.disabled = true;
  button.textContent = 'Vérification…';
  try {
    const report = await api('/runners/pairing-check', { method: 'POST' });
    const ok = report.byState.confirmed || 0;
    const box = $('#pairing-report');
    box.hidden = false;
    box.className = `banner pairing-report ${report.broken.length ? 'bad' : report.unconfirmed.length ? 'warn' : 'good'}`;
    box.innerHTML =
      `<b>${report.checked} appairage(s) vérifié(s)</b> — ${ok} confirmé(s), ` +
      `${report.broken.length} à refaire, ${report.unconfirmed.length} à confirmer.` +
      (report.broken.length
        ? '<ul>' + report.broken.map((p) => `<li><b>${esc(p.name)}</b> : ${esc(p.detail)}</li>`).join('') + '</ul>'
        : '') +
      (report.unconfirmed.length
        ? `<small>À confirmer : ${report.unconfirmed.map((p) => esc(p.name)).join(', ')} — ouvrez leur navigateur : le premier battement confirme l’appairage.</small>`
        : '');
    if (report.broken.length) {
      state.runnerFilters.state = 'pairing-broken';
      $('#runner-state-filter').value = 'pairing-broken';
    }
    await loadRunners();
  } catch (x) {
    notice(x.message, 'error');
  } finally {
    button.disabled = false;
    button.textContent = 'Vérifier les appairages';
  }
};
// Le raccourci « ⚠ N à vérifier » du compteur.
$('#runner-count').addEventListener('click', (e) => {
  if (!e.target.closest('[data-runner-check]')) return;
  state.runnerFilters.state = 'check';
  $('#runner-state-filter').value = 'check';
  renderRunners();
});
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
          (s.status === 'ACTIVE'
            ? '<td><span class="pill">Actif</span></td>'
            : '<td><span class="pill plugin-unknown" title="Les articles publiés pendant la désactivation sont ignorés, et le restent ; à la réactivation, les suivants sont créés normalement">Inactif</span><small>nouveaux articles ignorés</small></td>') +
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
/** Les filtres du journal en paramètres d'URL : la liste et l'export
 * portent exactement sur le même ensemble. */
function logQuery() {
  const f = state.logFilters;
  const query = new URLSearchParams();
  if (f.hours === 'custom') {
    if (f.since) query.set('since', new Date(f.since).toISOString());
    if (f.until) query.set('until', new Date(f.until).toISOString());
  } else {
    query.set('since', new Date(Date.now() - f.hours * 3600000).toISOString());
  }
  for (const key of ['domain', 'level', 'eventType', 'search', 'profileId', 'groupId', 'categoryId', 'postTargetId', 'postId', 'facebookUrl']) {
    if (f[key]) query.set(key, f[key]);
  }
  if (f.onlyIncidents) query.set('onlyIncidents', 'true');
  if (f.withUrl) query.set('withUrl', 'true');
  return query;
}
const LOG_DEFAULTS = { level: '', eventType: '', profileId: '', search: '', onlyIncidents: false, groupId: '', categoryId: '', postTargetId: '', postId: '', facebookUrl: '', withUrl: false };
const logFiltered = () => Object.entries(LOG_DEFAULTS).some(([k, v]) => state.logFilters[k] !== v);

async function loadLogs() {
  const f = state.logFilters,
    query = logQuery(),
    // La synthèse compte sur des heures ; sur des dates précises, elle prend
    // la fenêtre la plus proche qui les couvre.
    summaryHours = f.hours === 'custom'
      ? Math.min(720, Math.max(1, Math.ceil((Date.now() - (f.since ? new Date(f.since).getTime() : Date.now() - 86400000)) / 3600000)))
      : f.hours,
    summaryQuery = new URLSearchParams({ hours: summaryHours });
  query.set('page', state.page.logs);
  query.set('limit', 25);
  if (f.domain) summaryQuery.set('domain', f.domain);
  if (f.profileId) summaryQuery.set('profileId', f.profileId);
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
const LOG_DOMAINS = {
  '': { label: 'Tout', hint: 'Tous les journaux, tous domaines confondus.' },
  publication: {
    label: 'Publication',
    hint: 'Les automates : réservations, publications dans les groupes, commentaires et liens, et les gestes faits depuis la file (relancer, forcer, retirer).',
  },
  security: {
    label: 'Sécurité',
    hint: 'Les connexions à la plateforme : réussies, échouées, bloquées après trop d’essais, déconnexions — avec l’adresse IP.',
  },
  capture: {
    label: 'Captures',
    hint: 'Les reprises depuis l’extension FB Catch Post : capture refusée, lecture de la page source, réécriture, dépôt sur WordPress.',
  },
  sync: {
    label: 'Synchronisation',
    hint: 'Ce qui entre dans la plateforme : articles reçus de WordPress (avec ou sans post, et pourquoi), état des extensions des sites, profils NSTBrowser ajoutés.',
  },
  groups: {
    label: 'Groupes & pilotage',
    hint: 'Adhésions des profils aux groupes et état de leurs navigateurs.',
  },
  other: { label: 'Autres', hint: 'Les événements qui n’entrent dans aucun domaine connu.' },
};

/** Les onglets de domaine, chacun avec ce qui mérite l'attention : erreurs
 * en rouge, avertissements en orange. */
function renderLogDomains(s) {
  const counts = Object.fromEntries((s.domains || []).map((d) => [d.domain, d]));
  const all = (s.domains || []).reduce(
    (sum, d) => ({ total: sum.total + d.total, errors: sum.errors + d.errors, warns: sum.warns + d.warns }),
    { total: 0, errors: 0, warns: 0 },
  );
  $('#log-domains').innerHTML = Object.entries(LOG_DOMAINS)
    .map(([key, def]) => {
      const c = key ? counts[key] || { total: 0, errors: 0, warns: 0 } : all;
      const badge = c.errors
        ? `<em class="badge error" title="${c.errors} erreur(s)">${c.errors}</em>`
        : c.warns
          ? `<em class="badge warn" title="${c.warns} avertissement(s)">${c.warns}</em>`
          : `<em class="badge">${c.total}</em>`;
      return `<button class="subtab ${state.logFilters.domain === key ? 'active' : ''}" data-log-domain="${key}" role="tab">${def.label}${badge}</button>`;
    })
    .join('');
  $('#log-domain-hint').textContent = LOG_DOMAINS[state.logFilters.domain]?.hint || '';
}

function renderLogs() {
  const s = state.logsSummary;
  if (!s) return;
  renderLogDomains(s);
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

  renderLogFilters();
  $('#log-rows').innerHTML =
    state.logs
      .map((l) => {
        // Chaque élément du contexte filtre le journal d'un clic.
        const filterLink = (key, value, label) =>
          `<button type="button" class="link inline-link" data-log-filter="${key}" data-value="${esc(value)}" data-label="${esc(label)}" title="Ne voir que celui-ci">${esc(label)}</button>`;
        const context = [
          l.profile && `Profil : ${filterLink('profileId', l.profile.id, l.profile.name)}`,
          l.group && `Groupe : ${filterLink('groupId', l.group.id, l.group.name)}${l.group.category ? ` <small>(${esc(l.group.category.name)})</small>` : ''}`,
          l.post && `Post : ${filterLink('postId', l.post.id, l.post.title)}`,
          l.jobId && `Job : ${esc(l.jobId)}`,
        ].filter(Boolean);
        const fb = l.facebookUrl
          ? `<a href="${esc(l.facebookUrl)}" target="_blank" rel="noreferrer" title="${esc(l.facebookUrl)}">Ouvrir ↗</a>` +
            `<small>${esc(l.facebookUrl.replace(/^https:\/\/www\.facebook\.com/, ''))}</small>`
          : '<span class="muted">—</span>';
        const history = l.postTargetId
          ? `<div class="link-actions"><button type="button" data-history="${esc(l.postTargetId)}">Historique</button>` +
            `<button type="button" data-log-filter="postTargetId" data-value="${esc(l.postTargetId)}" data-label="${esc(`${l.post?.title || 'publication'} · ${l.group?.name || ''}`)}">Tout sur cette publication</button></div>`
          : '';
        const meta = l.metadata
          ? `<details class="log-meta"><summary>Détails</summary><pre>${esc(JSON.stringify(l.metadata, null, 2))}</pre></details>`
          : '';
        const domain = LOG_DOMAINS[l.domain] ? l.domain : 'other';
        return `<tr><td>${new Date(l.createdAt).toLocaleString('fr-FR')}</td><td><span class="level ${esc(l.level)}">${esc(l.level)}</span></td><td><span class="domain-tag domain-${domain}">${LOG_DOMAINS[domain].label}</span></td><td class="event-name">${esc(l.eventType)}</td><td class="log-message">${esc(l.message)}${meta}</td><td class="log-fb">${fb}${history}</td><td>${context.join('<br>') || '—'}</td></tr>`;
      })
      .join('') ||
    '<tr><td colspan="7"><div class="empty">Aucun journal pour ce filtre.</div></td></tr>';

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
/* ── Une adresse par rubrique ──────────────────────────────────────── */
const ROUTES = {
  '/': { view: 'dashboard' },
  '/profils': { view: 'profiles' },
  '/groupes': { view: 'groups' },
  '/categories': { view: 'categories' },
  '/sites': { view: 'sites' },
  '/articles': { view: 'articles' },
  '/posts': { view: 'posts', tab: 'queue' },
  '/posts/tous': { view: 'posts', tab: 'all' },
  '/journaux': { view: 'logs' },
  '/pilotage': { view: 'runners' },
  '/parametres': { view: 'settings' },
  '/comptes': { view: 'users' },
  '/actions-en-masse': { view: 'bulk' },
  '/moderateurs': { view: 'moderators' },
};
/** L'adresse d'une rubrique (et, pour les posts, de son onglet). */
function pathOf(id, tab) {
  if (id === 'posts') return (tab || state.queue.tab) === 'all' ? '/posts/tous' : '/posts';
  return Object.keys(ROUTES).find((p) => ROUTES[p].view === id) || '/';
}
/** Mettre l'adresse à jour sans recharger : le bouton Précédent du
 * navigateur ramène à la rubrique d'avant, et un lien se partage. */
function syncUrl(id) {
  if (id === 'profile-page' || id === 'moderator-page') return;
  const path = pathOf(id);
  if (location.pathname.replace(/\/+$/, '') !== path.replace(/\/+$/, '') && path) {
    history.pushState({ view: id }, '', path);
  }
  document.title = `PostFlow — ${$('#title').textContent}`;
}
/** La rubrique que l'adresse désigne (au chargement, ou Précédent). */
function routeFromUrl() {
  const moderator = /^\/moderateurs\/([A-Za-z0-9_-]{6,64})\/?$/.exec(location.pathname);
  if (moderator) {
    view('moderator-page', { fromUrl: true });
    void renderModeratorPage(moderator[1]);
    return;
  }
  const profile = /^\/profils\/([A-Za-z0-9_-]{6,64})\/?$/.exec(location.pathname);
  if (profile) {
    view('profile-page', { fromUrl: true });
    void renderProfilePage(profile[1]);
    return;
  }
  const path = (location.pathname.replace(/\/+$/, '') || '/').toLowerCase();
  const route = ROUTES[path] || ROUTES['/'];
  // « Voir au journal » depuis les contrôles : les constats MEMBER_AUDIT_*.
  if (route.view === 'logs' && new URLSearchParams(location.search).get('audit')) {
    state.logFilters.search = 'MEMBER_AUDIT';
    $('#log-search').value = 'MEMBER_AUDIT';
  }
  if (route.view === 'posts') showPostsTab(route.tab, { fromUrl: true });
  else view(route.view, { fromUrl: true });
}
window.addEventListener('popstate', routeFromUrl);

function view(id, { fromUrl = false } = {}) {
  // Un gestionnaire n'a pas la rubrique Comptes.
  if (id === 'users' && state.me && state.me.role !== 'ADMIN') id = 'dashboard';
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
    bulk: 'Actions en masse',
    moderators: 'Modérateurs',
    'profile-page': 'Profil',
    'moderator-page': 'Modérateur',
  }[id];
  if (id === 'bulk') loadBulk();
  if (id === 'moderators') loadModerators();
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
  clearInterval(view.objectiveTimer);
  if (id === 'runners') {
    loadRunners();
    view.runnersTimer = setInterval(loadRunners, 10000);
    // L'objectif se relit toutes les 30 s : c'est le « temps réel » de la
    // journée, sans charger l'API à chaque battement.
    loadObjective();
    view.objectiveTimer = setInterval(loadObjective, 30000);
  }
  if (id === 'settings' && state.me?.role === 'ADMIN') loadResetCounts();
  if (!fromUrl) syncUrl(id);
  else document.title = `PostFlow — ${$('#title').textContent}`;
}
function refreshLogs() {
  state.page.logs = 1;
  loadLogs();
}
$('#log-refresh').onclick = () => loadLogs();
$('#log-domains').addEventListener('click', (e) => {
  const tab = e.target.closest('[data-log-domain]');
  if (!tab) return;
  state.logFilters.domain = tab.dataset.logDomain;
  // Un événement choisi dans un autre domaine viderait la liste en silence.
  state.logFilters.eventType = '';
  refreshLogs();
});
$('#log-hours').onchange = (e) => {
  state.logFilters.hours = e.target.value === 'custom' ? 'custom' : Number(e.target.value);
  if (state.logFilters.hours === 'custom' && !state.logFilters.since) {
    // Par défaut, les dernières 24 h, à ajuster.
    const local = (d) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
    state.logFilters.since = local(new Date(Date.now() - 86400000));
    $('#log-since').value = state.logFilters.since;
  }
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
$('#log-with-url').onchange = (e) => {
  state.logFilters.withUrl = e.target.checked;
  refreshLogs();
};
$('#log-url').onchange = (e) => {
  state.logFilters.facebookUrl = e.target.value.trim();
  refreshLogs();
};
$('#log-category').onchange = (e) => {
  state.logFilters.categoryId = e.target.value;
  // Un groupe d'une autre catégorie viderait la liste.
  const group = state.groupOptions.find((g) => g.id === state.logFilters.groupId);
  if (group && e.target.value && group.categoryId !== e.target.value) state.logFilters.groupId = '';
  refreshLogs();
};
$('#log-group').onchange = (e) => {
  state.logFilters.groupId = e.target.value;
  refreshLogs();
};
['#log-since', '#log-until'].forEach((id) => {
  $(id).onchange = (e) => {
    state.logFilters[id === '#log-since' ? 'since' : 'until'] = e.target.value;
    refreshLogs();
  };
});
$('#log-reset').onclick = () => {
  Object.assign(state.logFilters, LOG_DEFAULTS);
  state.logLabels = {};
  refreshLogs();
};
/** Un clic sur un profil, un groupe, un post ou une publication du journal :
 * ne voir que lui. */
document.addEventListener('click', (e) => {
  const chip = e.target.closest('[data-log-filter]');
  if (!chip) return;
  const key = chip.dataset.logFilter;
  state.logFilters[key] = chip.dataset.value;
  state.logLabels = { ...(state.logLabels || {}), [key]: chip.dataset.label };
  refreshLogs();
});
$('#log-chips').addEventListener('click', (e) => {
  const key = e.target.closest('[data-log-unfilter]')?.dataset.logUnfilter;
  if (!key) return;
  state.logFilters[key] = LOG_DEFAULTS[key];
  refreshLogs();
});
/** L'export suit les mêmes filtres que la liste. */
$('#log-export').onclick = async (e) => {
  const button = e.target;
  button.disabled = true;
  try {
    const response = await fetch(`${API}/admin/logs/export?${logQuery()}`, {
      credentials: 'same-origin',
      headers: { 'X-Requested-With': 'PostFlow' },
    });
    if (response.status === 401) return toLogin();
    if (!response.ok) throw new Error(`Export refusé (HTTP ${response.status})`);
    const blob = await response.blob();
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `journal-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')}.csv`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 10000);
  } catch (x) {
    notice(x.message, 'error');
  } finally {
    button.disabled = false;
  }
};
/** Les listes et les pastilles des filtres, d'après l'état. */
function renderLogFilters() {
  const f = state.logFilters;
  $('#log-dates').hidden = f.hours !== 'custom';
  $('#log-hours').value = String(f.hours);
  const categories = $('#log-category');
  categories.innerHTML =
    '<option value="">Toutes les catégories</option>' +
    (state.categories || []).map((c) => `<option value="${c.id}">${esc(c.name)}</option>`).join('');
  categories.value = f.categoryId;
  const groups = (state.groupOptions || []).filter((g) => !f.categoryId || g.categoryId === f.categoryId);
  const groupSelect = $('#log-group');
  groupSelect.innerHTML =
    '<option value="">Tous les groupes</option>' +
    groups.map((g) => `<option value="${g.id}">${esc(g.name)}</option>`).join('');
  groupSelect.value = f.groupId;
  $('#log-with-url').checked = f.withUrl;
  $('#log-url').value = f.facebookUrl;
  $('#log-reset').hidden = !logFiltered();
  // Ce qui n'a pas de liste (une publication, un post) se montre en
  // pastille, avec sa croix.
  const labels = state.logLabels || {};
  const chips = [
    f.postTargetId && ['postTargetId', `Publication : ${labels.postTargetId || f.postTargetId}`],
    f.postId && ['postId', `Post : ${labels.postId || f.postId}`],
    f.facebookUrl && ['facebookUrl', `Lien : ${f.facebookUrl}`],
  ].filter(Boolean);
  $('#log-chips').innerHTML = chips
    .map(([key, label]) => `<span class="chip">${esc(label)} <button type="button" data-log-unfilter="${key}" title="Retirer ce filtre">×</button></span>`)
    .join('');
}
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
  if (id === 'post-modal') {
    loadCategoryGroups('');
    $('#post-image-preview').hidden = true;
  }
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
/** Se déconnecter : la session est révoquée côté serveur, pas seulement
 * oubliée par le navigateur. */
$('#logout').onclick = async () => {
  try {
    await fetch(`${API}/auth/logout`, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'X-Requested-With': 'PostFlow' },
    });
  } finally {
    location.replace('/login');
  }
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
    if (state.queue.tab === 'queue') await loadQueue();
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
    // La vérification est un plus : son absence (serveur pas encore à jour)
    // ne doit pas vider la file.
    [q.data, q.verify] = await Promise.all([
      api(`/posts/queue?${query}`),
      api('/admin/verify').catch(() => null),
    ]);
    renderQueue();
  } catch (x) {
    notice(x.message, 'error');
  }
}

const queuePost = (post) =>
  `<div class="queue-post">${post.imageUrl ? `<img src="${esc(post.imageUrl)}" alt="" loading="lazy">` : '<span class="noimg"></span>'}` +
  `<div><strong title="${esc(post.title)}">${esc(post.title)}</strong>` +
  `<small title="${esc(post.description || '')}">${esc(post.description || '')}</small></div></div>`;
const queueGroup = (group) =>
  `<strong title="${esc(group.name)}">${esc(group.name)}</strong>` +
  `<small>${group.category ? esc(group.category.name) : 'sans catégorie'}</small>`;
/** Au plus trois profils, puis « +N » : huit pastilles rendaient chaque
 * ligne haute comme trois. Le survol donne la liste complète. */
const profileChips = (profiles, pendingJoins = 0) => {
  if (!profiles.length)
    return pendingJoins
      ? `<span class="chip join-questions" title="Aucun profil marqué « Rejoint », mais ${pendingJoins} demande(s) d’adhésion en attente : si elles ont été acceptées sur Facebook, l’extension d’adhésion les revérifie, ou corrigez dans Groupes">${pendingJoins} demande(s) en attente</span>`
      : '<span class="chip join-questions" title="Aucun profil n’a rejoint ce groupe : ce post n’en partira pas">aucun profil</span>';
  const shown = profiles.slice(0, 3).map((p) => `<span class="chip" title="${esc(p.name)}">${esc(p.name)}</span>`);
  const rest = profiles.slice(3);
  if (rest.length)
    shown.push(`<span class="chip more" title="${esc(rest.map((p) => p.name).join(', '))}">+${rest.length}</span>`);
  return shown.join('');
};
const queueProfile = (profile) =>
  profile ? `<strong>${esc(profile.name)}</strong>` : '<span class="muted">—</span>';
const VERIFY_LABELS = {
  OK: '✓ Vérifié',
  REPUBLISHED: '↻ Republié',
  NEEDS_ACTION: '⚠ À traiter',
};
/** Ce que le vérificateur a constaté sur une publication. */
function verifyCell(v) {
  if (!v || !v.status) return '<span class="pill verify-none" title="Le vérificateur n’est pas encore passé">Pas encore</span>';
  const title = [v.detail, v.at && `le ${when(v.at)}`, v.republishCount && `${v.republishCount} republication(s)`]
    .filter(Boolean)
    .join(' · ');
  return `<span class="pill verify-${v.status}" title="${esc(title)}">${VERIFY_LABELS[v.status]}</span>`;
}
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
  $('#q-failed').textContent = d.counts.failed;

  $('#queue-failed-panel').hidden = !d.failed.length;
  $('#queue-failed').innerHTML = d.failed
    .map(
      (f) =>
        `<tr><td>${queuePost(f.post)}</td><td>${queueGroup(f.group)}</td>` +
        `<td><div class="queue-error">${esc(f.error)}</div>` +
        `<small>${f.profile ? `par ${esc(f.profile.name)} · ` : ''}${esc(when(f.failedAt))} · ${f.attempts} tentative(s)</small></td>` +
        `<td>${targetActions(f, { retry: true })}</td></tr>`,
    )
    .join('');

  $('#queue-running').innerHTML =
    d.running
      .map(
        (r) =>
          `<tr><td>${queuePost(r.post)}</td><td>${queueGroup(r.group)}</td><td>${queueProfile(r.profile)}</td>` +
          `<td><span class="pill state-${r.state}">${r.state === 'publishing' ? 'Publication en cours' : 'Réservé'}</span>` +
          `<small>depuis ${esc(when(r.since))}${r.expiresAt ? ` · jusqu’à ${esc(when(r.expiresAt))}` : ''}</small>` +
          // Un lot qui ne bouge plus (navigateur fermé, extension réinstallée)
          // garde son profil « occupé » : le libérer remet ses posts en file.
          (r.jobId ? `<button class="edit release-job" data-release-job="${r.jobId}" data-profile="${esc(r.profile?.name || '')}">Libérer le lot</button>` : '') +
          `</td></tr>`,
      )
      .join('') || '<tr><td colspan="4" class="empty">Rien en cours.</td></tr>';

  $('#queue-upcoming').innerHTML =
    d.upcoming
      .map((u) => {
        const prio = u.post.priority;
        const candidates = profileChips(u.candidates, u.group.pendingJoins);
        return (
          `<tr><td><span class="rank ${u.rank === 1 ? 'next' : ''}">${u.rank}</span></td>` +
          `<td>${queuePost(u.post)}</td><td>${queueGroup(u.group)}</td><td>` +
          (u.forcedProfile
            ? `<div class="forced" title="${esc(u.forcedProfile.name)} le publiera à son prochain passage (forcé le ${esc(when(u.forcedAt))})">→ ${esc(u.forcedProfile.name)}` +
              `<button data-unforce="${u.targetId}" title="Rendre à la file normale">annuler</button></div>`
            : '') +
          `<div class="chips">${candidates}</div></td>` +
          `<td><div class="prio-actions">` +
          (prio ? `<span class="prio ${prio < 0 ? 'low' : ''}">${prio > 0 ? '+' : ''}${prio}</span>` : '') +
          `<button class="edit" data-prio="${u.post.id}" data-move="top" title="En tête : passer devant tous les autres">⤒</button>` +
          `<button class="edit" data-prio="${u.post.id}" data-move="up" title="Avancer d’un cran">↑</button>` +
          `<button class="edit" data-prio="${u.post.id}" data-move="down" title="Reculer d’un cran">↓</button>` +
          (prio ? `<button class="edit" data-prio="${u.post.id}" data-move="reset" title="Priorité normale">×</button>` : '') +
          `</div></td><td>${targetActions(u)}</td></tr>`
        );
      })
      .join('') || '<tr><td colspan="6" class="empty">Aucun post en attente pour ce filtre.</td></tr>';
  $('#queue-more').hidden = d.upcoming.length >= d.counts.upcoming;

  $('#queue-published').innerHTML =
    d.published
      .map(
        (p) =>
          `<tr><td><strong>${esc(when(p.publishedAt))}</strong>` +
          (p.facebookUrl
            ? `<a href="${esc(p.facebookUrl)}" target="_blank" rel="noreferrer" title="${esc(p.facebookUrl)}">Voir sur Facebook ↗</a>`
            : '<span class="fb-missing" title="L’extension n’a pas retrouvé l’adresse du post : le vérificateur la cherchera dans le groupe, ou collez-la">⚠ adresse inconnue</span>') +
          `<div class="link-actions"><button type="button" data-history="${p.targetId}">Historique</button>` +
          `<button type="button" data-set-url="${p.targetId}" data-current="${esc(p.facebookUrl || '')}">${p.facebookUrl ? 'Corriger le lien' : 'Coller le lien'}</button></div>` +
          `</td><td>${queuePost(p.post)}</td><td>${queueGroup(p.group)}</td><td>${queueProfile(p.profile)}</td>` +
          `<td><span class="pill link-${p.link}">${LINK_LABELS[p.link]}</span></td>` +
          `<td>${verifyCell(p.verify)}</td></tr>`,
      )
      .join('') || '<tr><td colspan="6" class="empty">Aucune publication pour ce filtre.</td></tr>';
  $('#queue-more-published').hidden = d.published.length >= d.counts.published;
  renderVerifyReview();
}

/** Ce que le vérificateur n'a pas pu régler seul : post sans lien qu'il n'a
 * pas pu supprimer, republications épuisées, page toujours injoignable. */
function renderVerifyReview() {
  const v = state.queue.verify;
  const panel = $('#queue-review-panel');
  if (!v || !Array.isArray(v.review)) {
    panel.hidden = true;
    return;
  }
  panel.hidden = !v.review.length;
  $('#verify-summary').textContent =
    `${v.verified} vérifiée(s) · ${v.republished} republiée(s) · ${v.due} à vérifier`;
  $('#queue-review').innerHTML = v.review
    .map(
      (r) =>
        `<tr><td>${queuePost(r.post)}</td><td>${queueGroup(r.group)}</td>` +
        `<td><div class="queue-error" title="${esc(r.detail || '')}">${esc(r.detail || 'À vérifier')}</div>` +
        `<small>${esc(when(r.since))}` +
        (r.facebookUrl ? ` · <a href="${esc(r.facebookUrl)}" target="_blank" rel="noreferrer">Voir sur Facebook ↗</a>` : '') +
        `</small></td>` +
        `<td><div class="row-actions">` +
        `<button class="edit" data-history="${r.targetId}">Historique</button>` +
        `<button class="edit" data-verify-resolve="${r.targetId}" data-action="ok" title="J’ai regardé : le post est correct, le laisser tel quel">✓ C’est bon</button>` +
        `<button class="edit" data-verify-resolve="${r.targetId}" data-action="republish" title="Le remettre dans la file. Supprimez d’abord le post défectueux sur Facebook, sinon il sera en double">↻ Republier</button>` +
        `</div></td></tr>`,
    )
    .join('');
}

const TARGET_STATUS_LABELS = {
  AVAILABLE: 'En attente dans la file',
  CLAIMED: 'Réservé',
  CONSUMED: 'Publication en cours',
  PUBLISHED: 'Publié',
  FAILED: 'En échec',
};
const TRACE_TONES = {
  PUBLISHED: 'good', LINK_PLACED: 'good', VERIFIED_OK: 'good', RESOLVED_OK: 'good', URL_FOUND: 'good', URL_SET: 'good', MARKED_PUBLISHED: 'good',
  FAILED: 'bad', VERIFY_MISSING_POST: 'bad', VERIFY_MISSING_LINK: 'bad', DELETE_FAILED: 'bad', NEEDS_ACTION: 'bad',
  URL_MISSING: 'warn', VERIFY_PENDING: 'warn', VERIFY_UNREACHABLE: 'warn', DELETED: 'warn', REQUEUED: 'warn', RETRIED: 'warn',
};
const fbLink = (url) => (url ? `<a href="${esc(url)}" target="_blank" rel="noreferrer">${esc(url.replace(/^https:\/\/www\./, ''))}</a>` : '<span class="muted">—</span>');

/** Tout ce qui est arrivé à une publication, dans l'ordre. */
async function openHistory(targetId) {
  let h;
  try {
    h = await api(`/posts/targets/${targetId}/history`);
  } catch (x) {
    notice(x.message, 'error');
    return;
  }
  $('#history-title').textContent = `${h.post.title} · ${h.group.name}`;
  $('#history-summary').innerHTML =
    `<div><b>État :</b> ${esc(TARGET_STATUS_LABELS[h.status] || h.status)}` +
    (h.verifyStatus ? ` · ${esc(VERIFY_LABELS[h.verifyStatus] || h.verifyStatus)}` : '') +
    (h.republishCount ? ` · republié ${h.republishCount} fois` : '') +
    `</div><div><b>Post Facebook actuel :</b> ${fbLink(h.facebookUrl)}</div>` +
    `<div><b>Lien de l’article :</b> ${h.post.url ? `<a href="${esc(h.post.url)}" target="_blank" rel="noreferrer">${esc(h.post.url)}</a>` : '<span class="muted">aucun</span>'}</div>` +
    (h.group.url ? `<div><b>Groupe :</b> <a href="${esc(h.group.url)}" target="_blank" rel="noreferrer">${esc(h.group.name)} ↗</a></div>` : '');
  $('#history-attempts').innerHTML =
    h.attempts
      .map(
        (a) =>
          `<tr><td>${esc(when(a.publishedAt || a.at))}</td><td>${esc(a.profile?.name || '—')}</td>` +
          `<td>${esc(TARGET_STATUS_LABELS[a.status] || a.status)}${a.linkPlacedAt ? ' · lien posé' : a.commentId ? ' · commenté' : ''}` +
          (a.error ? `<small class="muted">${esc(a.error)}</small>` : '') +
          `</td><td>${fbLink(a.facebookUrl)}</td></tr>`,
      )
      .join('') || '<tr><td colspan="4" class="empty">Aucune tentative.</td></tr>';
  $('#history-events').innerHTML =
    h.events
      .slice()
      .reverse()
      .map(
        (ev) =>
          `<li class="${TRACE_TONES[ev.kind] || ''}"><b>${esc(ev.label)}</b>` +
          `<small>${esc(when(ev.at))}${ev.actor ? ` · ${esc(ev.actor)}` : ''}</small>` +
          (ev.detail ? `<small>${esc(ev.detail)}</small>` : '') +
          (ev.facebookUrl ? `<small>${fbLink(ev.facebookUrl)}</small>` : '') +
          `</li>`,
      )
      .join('') || '<li>Aucun événement enregistré.</li>';
  $('#history-modal').showModal();
}

/** Retrouver la publication derrière un lien Facebook (actuel ou ancien). */
$('#url-search').addEventListener('submit', async (e) => {
  e.preventDefault();
  const url = e.target.elements.url.value.trim();
  try {
    const found = await api(`/posts/targets-by-url?url=${encodeURIComponent(url)}`);
    if (!found.length) return notice('Aucune publication connue pour ce lien.', 'error');
    if (found.length > 1) notice(`${found.length} publications pour ce lien : la première est affichée.`);
    await openHistory(found[0].targetId);
  } catch (x) {
    notice(x.message, 'error');
  }
});

/** Les gestes sur une publication (un post dans un groupe) : l'envoyer
 * par un profil précis, modifier le post, le retirer de ce groupe — et,
 * pour un échec, le relancer. */
function targetActions(row, { retry = false } = {}) {
  const who = row.candidates.length
    ? `<select data-force="${row.targetId}" title="Ce profil la publiera en premier à son prochain passage">` +
      '<option value="">Envoyer par…</option>' +
      row.candidates.map((p) => `<option value="${p.id}">${esc(p.name)}</option>`).join('') +
      '</select>'
    : '<select disabled title="Aucun profil n’a rejoint ce groupe"><option>Aucun profil dans ce groupe</option></select>';
  return (
    `<div class="queue-actions">${who}<div class="row-actions">` +
    (retry ? `<button class="edit" data-retry="${row.targetId}" title="Le republier : seulement s’il n’est PAS en ligne">↻ Relancer</button>` : '') +
    (retry ? `<button class="edit" data-mark-online="${row.targetId}" title="Il est bien sur Facebook : l’enregistrer comme publié, sans le republier">✓ Déjà en ligne</button>` : '') +
    `<button class="edit" data-edit-queued="${row.post.id}">Modifier</button>` +
    `<button class="danger" data-remove-target="${row.targetId}" data-title="${esc(row.post.title)}" data-group="${esc(row.group.name)}">Retirer</button>` +
    `</div></div>`
  );
}

async function queueAction(request, success, button) {
  if (button) button.disabled = true;
  try {
    const result = await request();
    notice(result?.warning ? `${success} ${result.warning}` : success, result?.warning ? 'error' : 'success');
    await loadQueue();
  } catch (x) {
    notice(x.message, 'error');
    if (button) button.disabled = false;
  }
}

/** Modifier texte et image depuis la file : on relit le post entier (la
 * file n'en porte qu'un aperçu), puis la fenêtre de modification habituelle. */
async function openPostEditor(postId) {
  try {
    const post = await api(`/posts/${postId}`);
    openModal('post-modal');
    const f = $('#post-form');
    for (const k of ['id', 'title', 'description', 'url', 'imageUrl', 'delay'])
      f.elements[k].value = post[k] ?? '';
    $('#post-category-label').hidden = true;
    $('#target-field').hidden = true;
    $('h2', $('#post-modal')).textContent = 'Modifier le post';
    previewPostImage();
  } catch (x) {
    notice(x.message, 'error');
  }
}
function previewPostImage() {
  const url = $('#post-form').elements.imageUrl.value.trim();
  const img = $('#post-image-preview');
  img.hidden = !/^https?:\/\//.test(url);
  if (!img.hidden) img.src = url;
}
$('#post-form').elements.imageUrl.addEventListener('input', previewPostImage);

document.addEventListener('change', (e) => {
  const targetId = e.target.dataset?.force;
  if (!targetId || !e.target.value) return;
  const name = e.target.selectedOptions[0].textContent;
  void queueAction(
    () => api(`/posts/targets/${targetId}/force`, { method: 'PUT', body: JSON.stringify({ profileId: e.target.value }) }),
    `${name} publiera ce post en premier à son prochain passage.`,
    e.target,
  );
});

function showPostsTab(tab, { fromUrl = false } = {}) {
  state.queue.tab = tab;
  $$('[data-posts-tab]').forEach((b) => b.classList.toggle('active', b.dataset.postsTab === tab));
  $('#posts-queue').classList.toggle('hidden', tab !== 'queue');
  $('#posts-all').classList.toggle('hidden', tab !== 'all');
  view('posts', { fromUrl });
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
  // Activer (la désactivation passe par la fiche, pour le transfert). Le
  // profil peut venir de la fiche sans être sur la page affichée.
  const toggleId = e.target.dataset.toggleProfile;
  if (toggleId) {
    const known = state.profiles.find((x) => x.id === toggleId);
    const next = known && known.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
    api(`/profiles/${toggleId}`, { method: 'PATCH', body: JSON.stringify({ status: next }) })
      .then(() => {
        return load().then(() => (state.profilePage && location.pathname.startsWith('/profils/') ? renderProfilePage(toggleId) : null));
      })
      .then(() => notice(next === 'ACTIVE' ? 'Profil activé : il reprend sa place dans la file.' : 'État du profil modifié.'))
      .catch((x) => notice(x.message, 'error'));
    return;
  }
  const goto = e.target.closest('[data-goto]');
  if (goto) {
    history.pushState({}, '', goto.dataset.goto);
    routeFromUrl();
    return;
  }
  const detail = e.target.closest('[data-profile-detail]');
  if (detail) {
    void openProfileDetail(detail.dataset.profileDetail);
    return;
  }
  if (e.target.dataset.deactivateProfile) {
    // Désactiver passe par la fiche : on voit pourquoi, et à qui confier ses posts.
    void openProfileDetail(e.target.dataset.deactivateProfile, { focusDeactivate: true });
    return;
  }
  if (e.target.dataset.releaseJob) {
    const { releaseJob, profile } = e.target.dataset;
    if (!confirm(`Libérer le lot de ${profile || 'ce profil'} ?\nSes posts pas encore commencés retournent dans la file, et le profil pourra en réserver d’autres. Un post en cours de publication est laissé tel quel.`)) return;
    void queueAction(async () => {
      const r = await api(`/admin/jobs/${releaseJob}/release`, { method: 'POST' });
      return { warning: r.inProgress ? `${r.inProgress} post(s) en cours de publication laissé(s) tel(s) quel(s).` : null };
    }, 'Lot libéré : ses posts sont de retour dans la file.', e.target);
    return;
  }
  if (e.target.dataset.verifyResolve) {
    const { verifyResolve, action } = e.target.dataset;
    if (action === 'republish' && !confirm('Republier dans ce groupe ?\nSi le post défectueux est encore sur Facebook, supprimez-le d’abord : sinon il sera en double.')) return;
    void queueAction(
      () => api(`/admin/verify/targets/${verifyResolve}/resolve`, { method: 'POST', body: JSON.stringify({ action }) }),
      action === 'ok' ? 'Marqué comme vérifié.' : 'Remis dans la file : il sera republié.',
      e.target,
    );
    return;
  }
  if (e.target.dataset.history) {
    void openHistory(e.target.dataset.history);
    return;
  }
  if (e.target.dataset.setUrl) {
    const url = prompt('Adresse du post sur Facebook (ouvrez le post, copiez le lien de sa date) :', e.target.dataset.current || '');
    if (!url) return;
    void queueAction(
      () => api(`/posts/targets/${e.target.dataset.setUrl}/facebook-url`, { method: 'PUT', body: JSON.stringify({ facebookUrl: url.trim() }) }),
      'Adresse enregistrée : elle est gardée dans l’historique.',
      e.target,
    );
    return;
  }
  if (e.target.dataset.markOnline) {
    // L'adresse est facultative, mais c'est elle qu'ouvrira le vérificateur.
    const url = prompt('Il est bien en ligne : collez l’adresse du post Facebook (facultatif, mais utile au vérificateur) :', '');
    if (url == null) return;
    void queueAction(
      () =>
        api(`/posts/targets/${e.target.dataset.markOnline}/published`, {
          method: 'POST',
          body: JSON.stringify(String(url).trim() ? { facebookUrl: String(url).trim() } : {}),
        }),
      'Enregistré comme publié : il ne sera pas republié.',
      e.target,
    );
    return;
  }
  if (e.target.dataset.retry) {
    void queueAction(
      () => api(`/posts/targets/${e.target.dataset.retry}/retry`, { method: 'POST' }),
      'Relancé : la publication repart dans la file.',
      e.target,
    );
    return;
  }
  if (e.target.dataset.unforce) {
    void queueAction(
      () => api(`/posts/targets/${e.target.dataset.unforce}/force`, { method: 'PUT', body: JSON.stringify({ profileId: null }) }),
      'Rendu à la file normale.',
      e.target,
    );
    return;
  }
  if (e.target.dataset.editQueued) {
    void openPostEditor(e.target.dataset.editQueued);
    return;
  }
  if (e.target.dataset.removeTarget) {
    const { removeTarget, title, group } = e.target.dataset;
    if (!confirm(`Retirer « ${title} » du groupe « ${group} » ?\nIl reste dans ses autres groupes ; s’il ne visait que celui-ci, il est supprimé.`)) return;
    void queueAction(async () => {
      const r = await api(`/posts/targets/${removeTarget}`, { method: 'DELETE' });
      return r;
    }, `« ${title} » retiré de « ${group} ».`, e.target);
    return;
  }
  if (e.target.dataset.prio) {
    void movePost(e.target.dataset.prio, e.target.dataset.move, e.target);
    return;
  }
  if (e.target.dataset.markJoined) {
    const { markJoined, group } = e.target.dataset;
    e.target.disabled = true;
    api(`/groups/${group}/profiles/${markJoined}/join-status`, {
      method: 'PATCH',
      body: JSON.stringify({ joinStatus: 'JOINED' }),
    })
      .then(() => notice('Adhésion corrigée : le profil peut maintenant publier dans ce groupe.'))
      .then(load)
      .catch((x) => {
        e.target.disabled = false;
        notice(x.message, 'error');
      });
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
  let p =
    state.profiles.find((x) => x.id === e.target.dataset.editProfile) ||
    state.profileOptions.find((x) => x.id === e.target.dataset.editProfile);
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
    previewPostImage();
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

// L'adresse décide de la rubrique ouverte : /posts ouvre les posts, etc.
load().then(() => {
  routeFromUrl();
  registerAgentTools();
});

/* ── Actions en masse : lier profils ↔ groupes, partager ────────────── */
state.bulk = { profiles: [], groups: [], sites: [], selProfiles: new Set(), selGroups: new Set(), selItems: new Set(), selUsers: new Set(), tab: 'link', loaded: false };

async function loadBulk() {
  const b = state.bulk;
  try {
    const [profiles, groups] = await Promise.all([api('/bulk/profiles'), api('/bulk/groups')]);
    b.profiles = Array.isArray(profiles) ? profiles : [];
    b.groups = Array.isArray(groups) ? groups : [];
    b.sites = state.sites || [];
    b.loaded = true;
  } catch (x) {
    notice(x.message, 'error');
    return;
  }
  const categories =
    '<option value="">Toutes les catégories</option>' +
    (state.categories || []).map((c) => `<option value="${c.id}">${esc(c.name)}</option>`).join('') +
    '<option value="none">Sans catégorie</option>';
  for (const id of ['#bl-group-category', '#bs-category']) {
    const keep = $(id).value;
    $(id).innerHTML = categories;
    $(id).value = keep;
  }
  // Le partage se fait avec des comptes : seuls les administrateurs les voient.
  $('[data-bulk-tab="share"]').hidden = state.me?.role !== 'ADMIN';
  renderBulk();
}

const matches = (text, ...fields) => !text || fields.some((f) => String(f || '').toLowerCase().includes(text));
const inCategory = (cat, item) => !cat || (cat === 'none' ? !item.category : item.category?.id === cat);

function bulkVisible() {
  const b = state.bulk;
  const pText = $('#bl-profile-search').value.trim().toLowerCase();
  const pStatus = $('#bl-profile-status').value;
  const gText = $('#bl-group-search').value.trim().toLowerCase();
  const gCat = $('#bl-group-category').value;
  return {
    profiles: b.profiles.filter((p) => (!pStatus || p.status === pStatus) && matches(pText, p.name, p.externalId)),
    groups: b.groups.filter((g) => inCategory(gCat, g) && matches(gText, g.name, g.url)),
  };
}
function shareVisible() {
  const b = state.bulk;
  const kind = $('#bs-kind').value;
  const text = $('#bs-search').value.trim().toLowerCase();
  const cat = $('#bs-category').value;
  const items =
    kind === 'groups'
      ? b.groups.filter((g) => inCategory(cat, g) && matches(text, g.name, g.url))
      : b.sites.filter((s) => (!cat || (cat === 'none' ? !s.categoryId : s.categoryId === cat)) && matches(text, s.name, s.originUrl));
  return items;
}

function renderBulk() {
  const b = state.bulk;
  $$('[data-bulk-tab]').forEach((t) => t.classList.toggle('active', t.dataset.bulkTab === b.tab));
  $('#bulk-link').classList.toggle('hidden', b.tab !== 'link');
  $('#bulk-share').classList.toggle('hidden', b.tab !== 'share');

  const v = bulkVisible();
  $('#bl-profiles').innerHTML =
    v.profiles
      .map(
        (p) =>
          `<label class="pick ${p.status === 'INACTIVE' ? 'inactive' : ''}"><input type="checkbox" data-bl-profile="${p.id}" ${b.selProfiles.has(p.id) ? 'checked' : ''}>` +
          `<span><b>${esc(p.name)}</b><small>${p._count.profileGroups} groupe(s)${p.status === 'INACTIVE' ? ' · inactif' : ''}</small></span></label>`,
      )
      .join('') || '<div class="empty">Aucun profil pour ce filtre.</div>';
  $('#bl-groups').innerHTML =
    v.groups
      .map(
        (g) =>
          `<label class="pick ${g.status === 'INACTIVE' ? 'inactive' : ''}"><input type="checkbox" data-bl-group="${g.id}" ${b.selGroups.has(g.id) ? 'checked' : ''}>` +
          `<span><b>${esc(g.name)}</b><small>${g.category ? esc(g.category.name) : 'sans catégorie'} · ${g._count.profiles} profil(s)${g.status === 'INACTIVE' ? ' · inactif' : ''}</small></span></label>`,
      )
      .join('') || '<div class="empty">Aucun groupe pour ce filtre.</div>';
  $('#bl-profiles-count').textContent = `${b.selProfiles.size} profil(s) coché(s)`;
  $('#bl-groups-count').textContent = `${b.selGroups.size} groupe(s) coché(s)`;
  const pairs = b.selProfiles.size * b.selGroups.size;
  $('#bl-summary').textContent = pairs
    ? `${b.selProfiles.size} profil(s) × ${b.selGroups.size} groupe(s) = ${pairs} liaison(s).`
    : 'Cochez au moins un profil et un groupe.';
  $('#bl-link').disabled = $('#bl-unlink').disabled = !pairs;
  $('#bl-link').textContent = pairs ? `Lier (${pairs})` : 'Lier';

  const items = shareVisible();
  const kind = $('#bs-kind').value;
  $('#bs-category').hidden = false;
  $('#bs-items').innerHTML =
    items
      .map(
        (i) =>
          `<label class="pick"><input type="checkbox" data-bs-item="${i.id}" ${b.selItems.has(i.id) ? 'checked' : ''}>` +
          `<span><b>${esc(i.name)}</b><small>${kind === 'groups' ? (i.category ? esc(i.category.name) : 'sans catégorie') : esc(i.originUrl || '')}</small></span></label>`,
      )
      .join('') || '<div class="empty">Rien pour ce filtre.</div>';
  const users = (state.users || []).filter((u) => u.role !== 'ADMIN' && u.status === 'ACTIVE');
  $('#bs-users').innerHTML =
    users
      .map((u) => `<label class="pick"><input type="checkbox" data-bs-user="${u.id}" ${b.selUsers.has(u.id) ? 'checked' : ''}><span><b>${esc(u.username)}</b><small>gestionnaire</small></span></label>`)
      .join('') || '<div class="empty">Aucun compte gestionnaire actif : créez-en un dans Comptes.</div>';
  $('#bs-items-count').textContent = `${b.selItems.size} ${kind === 'groups' ? 'groupe(s)' : 'site(s)'} coché(s)`;
  $('#bs-users-count').textContent = `${b.selUsers.size} compte(s) coché(s)`;
  const shares = b.selItems.size * b.selUsers.size;
  $('#bs-summary').textContent = shares ? `${b.selItems.size} × ${b.selUsers.size} = ${shares} partage(s).` : 'Cochez au moins un élément et un compte.';
  $('#bs-grant').disabled = $('#bs-revoke').disabled = !shares;
}

$$('[data-bulk-tab]').forEach((t) => (t.onclick = () => {
  state.bulk.tab = t.dataset.bulkTab;
  renderBulk();
}));
['#bl-profile-search', '#bl-group-search', '#bs-search'].forEach((id) => ($(id).oninput = () => renderBulk()));
['#bl-profile-status', '#bl-group-category', '#bs-category'].forEach((id) => ($(id).onchange = () => renderBulk()));
$('#bs-kind').onchange = () => {
  state.bulk.selItems.clear();
  renderBulk();
};
const toggleIn = (set, id, on) => (on ? set.add(id) : set.delete(id));
$('#bulk').addEventListener('change', (e) => {
  const d = e.target.dataset;
  const b = state.bulk;
  if (d.blProfile) toggleIn(b.selProfiles, d.blProfile, e.target.checked);
  else if (d.blGroup) toggleIn(b.selGroups, d.blGroup, e.target.checked);
  else if (d.bsItem) toggleIn(b.selItems, d.bsItem, e.target.checked);
  else if (d.bsUser) toggleIn(b.selUsers, d.bsUser, e.target.checked);
  else return;
  renderBulk();
});
$('#bulk').addEventListener('click', (e) => {
  const b = state.bulk;
  const d = e.target.dataset;
  if (d.blAll) {
    const v = bulkVisible();
    for (const x of v[d.blAll]) (d.blAll === 'profiles' ? b.selProfiles : b.selGroups).add(x.id);
    renderBulk();
  } else if (d.blNone) {
    (d.blNone === 'profiles' ? b.selProfiles : b.selGroups).clear();
    renderBulk();
  } else if (e.target.hasAttribute('data-bs-all')) {
    for (const x of shareVisible()) b.selItems.add(x.id);
    renderBulk();
  } else if (e.target.hasAttribute('data-bs-none')) {
    b.selItems.clear();
    renderBulk();
  }
});

async function bulkLink(action) {
  const b = state.bulk;
  const pairs = b.selProfiles.size * b.selGroups.size;
  if (action === 'unlink' && !confirm(`Délier ${b.selProfiles.size} profil(s) de ${b.selGroups.size} groupe(s) (${pairs} liaison(s)) ?\nIls ne publieront plus dans ces groupes.`)) return;
  $('#bl-link').disabled = $('#bl-unlink').disabled = true;
  try {
    const r = await api('/bulk/link', {
      method: 'POST',
      body: JSON.stringify({ profileIds: [...b.selProfiles], groupIds: [...b.selGroups], action }),
    });
    const box = $('#bl-result');
    box.hidden = false;
    box.innerHTML =
      action === 'link'
        ? `<b>✓ ${r.created} liaison(s) créée(s)</b>${r.reactivated ? `, ${r.reactivated} réactivée(s)` : ''}, ${r.already} déjà en place.` +
          `<small>Les nouvelles sont « à rejoindre » : l’extension d’adhésion s’en charge.${r.ignored ? ` ${r.ignored} élément(s) hors de votre portée ignoré(s).` : ''}</small>`
        : `<b>✓ ${r.removed} liaison(s) retirée(s).</b>`;
    notice(action === 'link' ? `${r.created + r.reactivated} liaison(s) ajoutée(s).` : `${r.removed} liaison(s) retirée(s).`);
    await Promise.all([loadBulk(), load()]);
  } catch (x) {
    notice(x.message, 'error');
    renderBulk();
  }
}
$('#bl-link').onclick = () => bulkLink('link');
$('#bl-unlink').onclick = () => bulkLink('unlink');

async function bulkShare(action) {
  const b = state.bulk;
  const kind = $('#bs-kind').value;
  if (action === 'revoke' && !confirm(`Retirer le partage de ${b.selItems.size} élément(s) pour ${b.selUsers.size} compte(s) ?`)) return;
  $('#bs-grant').disabled = $('#bs-revoke').disabled = true;
  try {
    const r = await api('/bulk/share', {
      method: 'POST',
      body: JSON.stringify({ kind, ids: [...b.selItems], userIds: [...b.selUsers], action }),
    });
    const names = new Map((state.users || []).map((u) => [u.id, u.username]));
    const box = $('#bs-result');
    box.hidden = false;
    box.innerHTML =
      `<b>✓ ${r.done} ${action === 'grant' ? 'partage(s) fait(s)' : 'partage(s) retiré(s)'}</b> sur ${r.items * r.users}.` +
      (r.failures.length
        ? `<ul>${r.failures.slice(0, 10).map((f) => `<li>${esc(f.item)} → ${esc(names.get(f.userId) || f.userId)} : ${esc(f.reason)}</li>`).join('')}</ul>` +
          (r.failures.length > 10 ? `<small>… et ${r.failures.length - 10} autre(s) refus.</small>` : '')
        : '');
    notice(`${r.done} ${action === 'grant' ? 'partage(s) fait(s)' : 'partage(s) retiré(s)'}${r.failures.length ? `, ${r.failures.length} refus` : ''}.`, r.failures.length ? 'error' : 'success');
  } catch (x) {
    notice(x.message, 'error');
  } finally {
    renderBulk();
  }
}
$('#bs-grant').onclick = () => bulkShare('grant');
$('#bs-revoke').onclick = () => bulkShare('revoke');

/* ── Modérateurs : leur rubrique ───────────────────────────────────── */
const isAdminUser = () => state.me?.role === 'ADMIN';
const MOD_ROWS = [
  ['verified', 'Publications vérifiées'],
  ['ok', '✓ En ligne avec leur lien'],
  ['missingLink', 'Sans le lien de l’article'],
  ['missingPost', 'Introuvables'],
  ['pending', 'En attente de validation'],
  ['unreachable', 'Pages illisibles'],
  ['deleted', 'Supprimées (sans lien)'],
  ['deleteFailed', 'Suppressions impossibles'],
  ['urlFound', 'Adresses retrouvées'],
  ['approved', 'Adhésions acceptées'],
  ['preApproved', 'Profils pré-approuvés'],
  ['memberFailed', 'Adhésions / pré-approbations en échec'],
];
const BAD_ROWS = new Set(['missingLink', 'missingPost', 'deleteFailed', 'memberFailed']);

function modState(settings) {
  return (
    (settings.online
      ? `<span class="chip join-joined" title="Son extension a relu ses réglages ${esc(ago(settings.seenAt))}">● en ligne</span>`
      : `<span class="chip join-not_joined" title="${settings.seenAt ? `Vu ${esc(ago(settings.seenAt))}` : 'Jamais vu : extension ≥ 1.3.0 installée et activée ?'}">○ hors ligne</span>`) +
    (settings.paused ? ' <span class="chip join-failed">suspendu</span>' : '')
  );
}
function modDue(due) {
  return (
    `<article><span>À vérifier</span><strong>${due.verifications}</strong><small>publications en attente du contrôle</small></article>` +
    `<article class="failed-stat"><span>À traiter</span><strong>${due.needsAction}</strong><small>ce qu’il n’a pas pu régler</small></article>` +
    `<article><span>Nos profils</span><strong>${due.members}</strong><small>adhésions / pré-approbations à faire</small></article>`
  );
}

/* ── Contrôle de la pré-approbation : résultats ────────────────────── */
async function loadAudit() {
  let a;
  try {
    a = await api('/moderators/audit');
  } catch (x) {
    return;
  }
  if (!a || !a.summary || !Array.isArray(a.rows)) return;
  state.audit = a;
  const sm = a.summary;
  $('#audit-summary').innerHTML =
    `<article><span>En attente</span><strong>${sm.pending}</strong><small>le modérateur va regarder</small></article>` +
    `<article><span>Déjà faite</span><strong>${sm.preApproved}</strong><small>vu sur Facebook ✓</small></article>` +
    `<article class="failed-stat"><span>Pas faite</span><strong>${sm.notPreApproved}</strong><small>à pré-approuver</small></article>` +
    `<article><span>Impossible</span><strong>${sm.noPermission + sm.notFound}</strong><small>pas l’option, ou introuvable</small></article>`;
  renderAudit();
  // Tant que des contrôles attendent, on relit.
  clearTimeout(loadAudit.timer);
  if (sm.pending && document.querySelector('#moderators.active')) loadAudit.timer = setTimeout(loadAudit, 15000);
}
function renderAudit() {
  const a = state.audit;
  if (!a) return;
  const f = $('#audit-filter').value;
  const text = $('#audit-search').value.trim().toLowerCase();
  const rows = a.rows.filter(
    (r) =>
      (!f || (f === 'pending' ? r.pending : !r.pending && r.state === f)) &&
      (!text || r.profile.name.toLowerCase().includes(text) || r.group.name.toLowerCase().includes(text)),
  );
  $('#audit-rows').innerHTML =
    rows
      .map((r) => {
        const st = AUDIT_STATES[r.state];
        const cell = r.pending
          ? `<span class="chip join-requested">⏳ ${r.mode === 'fix' ? 'contrôle + correction' : 'contrôle'} en attente</span>`
          : st
            ? `<span class="chip ${st[0]}">${st[1]}</span>`
            : '—';
        return `<tr><td><button class="link inline-link" type="button" data-goto="/profils/${r.profile.id}">${esc(r.profile.name)}</button></td>` +
          `<td>${r.group.url ? `<a href="${esc(r.group.url)}" target="_blank" rel="noreferrer">${esc(r.group.name)}</a>` : esc(r.group.name)}</td>` +
          `<td>${cell}</td><td><small>${esc(r.detail || '')}</small></td><td><small>${r.checkedAt ? esc(when(r.checkedAt)) : '—'}</small></td></tr>`;
      })
      .join('') || '<tr><td colspan="5" class="empty">Aucun contrôle pour ce filtre. Lancez un test depuis la page d’un profil, ou « Contrôler tout ».</td></tr>';
}
$('#audit-filter').onchange = () => renderAudit();
$('#audit-search').oninput = () => renderAudit();
$('#audit-panel').addEventListener('click', async (e) => {
  const mode = e.target.dataset.audit;
  if (!mode) return;
  const text = mode === 'check'
    ? 'Contrôler la pré-approbation de TOUS nos profils dans leurs groupes ?\nLe modérateur regarde seulement : rien n’est modifié sur Facebook.'
    : 'Contrôler puis PRÉ-APPROUVER ce qui manque, pour tous nos profils ?\nLe modérateur cliquera « Pré-approuver » là où ce n’est pas fait.';
  if (!confirm(text)) return;
  const r = await requestAudit({ mode }, e.target);
  e.target.disabled = false;
  if (r) await loadAudit();
});

async function loadModerators() {
  void loadAudit();
  let d;
  try {
    d = await api('/moderators');
  } catch (x) {
    notice(x.message, 'error');
    return;
  }
  $('#mod-due').innerHTML = modDue(d.due);
  $('#mod-cards').innerHTML =
    d.moderators
      .map((m) => {
        const t = m.today, w = m.week;
        return (
          `<article class="profile-card moderator-card"><div class="card-head"><button type="button" class="person person-link" data-goto="/moderateurs/${m.id}">` +
          `<span class="avatar moderator-avatar">🛡</span><div><h3>${esc(m.name)}</h3><p>${esc(m.externalId || 'sans identifiant')}</p></div></button>` +
          `<span class="status">${m.status === 'ACTIVE' ? 'ACTIF' : 'INACTIF'}</span></div>` +
          `<p class="profile-health">${modState(m.settings)}</p>` +
          `<div class="metrics profile-stats">` +
          `<div><strong>${t.verified}</strong><span>vérifiées aujourd’hui</span></div>` +
          `<div><strong>${w.verified}</strong><span>vérifiées (7 j)</span></div>` +
          `<div class="${w.missingLink + w.missingPost ? 'bad' : ''}"><strong>${w.missingLink + w.missingPost}</strong><span>en défaut (7 j)</span></div>` +
          `<div><strong>${w.deleted}</strong><span>supprimées (7 j)</span></div>` +
          `<div><strong>${w.approved}</strong><span>adhésions (7 j)</span></div>` +
          `<div><strong>${w.preApproved}</strong><span>pré-approuvés (7 j)</span></div>` +
          `</div><div class="card-actions"><button class="edit" type="button" data-goto="/moderateurs/${m.id}">Ouvrir sa page</button></div></article>`
        );
      })
      .join('') ||
    `<div class="empty">Aucun modérateur.${isAdminUser() ? ' Désignez-en un ci-dessus : un profil administrateur ou modérateur de vos groupes Facebook.' : ''}</div>`;
  // Désigner : un profil qui n'est pas encore modérateur (administrateurs).
  const ids = new Set(d.moderators.map((m) => m.id));
  const candidates = (state.profileOptions || []).filter((p) => !ids.has(p.id) && p.status === 'ACTIVE');
  $('#mod-designate').innerHTML =
    '<option value="">Désigner un modérateur…</option>' + candidates.map((p) => `<option value="${p.id}">${esc(p.name)}</option>`).join('');
  $('#mod-designate-go').disabled = true;
}
$('#mod-designate').onchange = (e) => ($('#mod-designate-go').disabled = !e.target.value);
$('#mod-designate-go').onclick = async () => {
  const id = $('#mod-designate').value;
  const name = $('#mod-designate').selectedOptions[0]?.textContent;
  if (!id || !confirm(`Faire de « ${name} » un modérateur ?\nIl quittera la liste des profils qui publient, et seul un administrateur pourra le modifier.`)) return;
  try {
    await api(`/admin/verify/profiles/${id}`, { method: 'PATCH', body: JSON.stringify({ isModerator: true }) });
    notice(`${name} est maintenant modérateur.`);
    await load();
    await loadModerators();
  } catch (x) {
    notice(x.message, 'error');
  }
};

function moderatorChart(days) {
  const max = Math.max(1, ...days.map((d) => d.ok + d.problems + d.members));
  const bars = days
    .map((d) => {
      const label = new Date(`${d.day}T12:00:00`).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });
      return `<div class="pd-bar" title="${esc(label)} : ${d.ok} en ligne avec lien, ${d.problems} en défaut, ${d.members} adhésion(s)/pré-approbation(s)">` +
        `<div class="pd-bar-stack"><span class="mem" style="height:${(d.members / max) * 100}%"></span><span class="fail" style="height:${(d.problems / max) * 100}%"></span><span class="pub" style="height:${(d.ok / max) * 100}%"></span></div>` +
        `<small>${esc(label.slice(0, 2))}</small></div>`;
    })
    .join('');
  return `<div class="pd-legend"><span class="pub">En ligne avec lien</span><span class="fail">En défaut</span><span class="mem">Adhésions / pré-approbations</span></div><div class="pd-bars">${bars}</div>`;
}

async function renderModeratorPage(id) {
  state.moderatorPage = { id };
  $('#md-title').textContent = 'Chargement…';
  let d;
  try {
    d = await api(`/moderators/${id}`);
  } catch (x) {
    notice(x.message, 'error');
    return;
  }
  state.moderatorPage.data = d;
  const m = d.moderator, s = d.moderator.settings, admin = isAdminUser();
  $('#md-title').textContent = m.name;
  $('#title').textContent = m.name;
  document.title = `PostFlow — ${m.name}`;
  $('#md-sub').innerHTML = `MODÉRATEUR · ${m.status === 'ACTIVE' ? 'ACTIF' : 'INACTIF'} ${modState(s)}${s.agent ? ` <small class="muted">${esc(s.agent)}</small>` : ''}`;
  $('#md-lock').hidden = admin;
  $('#md-due').innerHTML = modDue(d.due);
  $('#md-counts').innerHTML = MOD_ROWS.map(
    ([key, label]) =>
      `<tr><th>${label}</th>` +
      ['today', 'week', 'month', 'total'].map((p) => `<td class="${BAD_ROWS.has(key) && d.counts[p][key] ? 'bad' : ''}">${d.counts[p][key]}</td>`).join('') +
      `</tr>`,
  ).join('');
  const f = $('#md-settings');
  f.elements.batchSize.value = s.batchSize;
  f.elements.everyMinutes.value = s.everyMinutes;
  f.elements.members.checked = s.members;
  [...f.elements].forEach((el) => (el.disabled = !admin));
  $('#md-chart').innerHTML = moderatorChart(d.days);
  $('#md-recent').innerHTML =
    d.recent
      .map((r) => {
        const tone = r.level === 'ERROR' ? 'bad' : r.level === 'WARN' ? 'warn' : 'good';
        return `<li class="${tone}"><b>${esc(r.message)}</b><small>${esc(when(r.at))} · ${esc(r.eventType)}</small>` +
          (r.facebookUrl || r.postTargetId
            ? `<div class="link-actions">${r.facebookUrl ? `<a href="${esc(r.facebookUrl)}" target="_blank" rel="noreferrer">Post Facebook ↗</a>` : ''}${r.postTargetId ? `<button type="button" data-history="${r.postTargetId}">Historique</button>` : ''}</div>`
            : '') +
          `</li>`;
      })
      .join('') || '<li>Aucune action sur 30 jours.</li>';
  $('#md-actions').innerHTML = admin
    ? `<button class="primary" type="button" data-mod-act="run" ${s.paused ? 'disabled title="Suspendu"' : ''}>▶ Lancer un passage</button>` +
      `<button class="edit" type="button" data-mod-act="pause">${s.paused ? 'Reprendre' : 'Suspendre'}</button>` +
      `<button class="edit" type="button" data-mod-act="recheck" ${d.due.needsAction ? '' : 'disabled'} title="Les publications « à traiter » repartent en vérification">↻ Revérifier « à traiter » (${d.due.needsAction})</button>` +
      `<button class="edit" type="button" data-mod-act="retry-members" ${d.due.memberProblems ? '' : 'disabled'}>↻ Relancer les adhésions en échec (${d.due.memberProblems})</button>` +
      `<button class="danger" type="button" data-mod-act="unset">Retirer le rôle</button>`
    : '';
}

$('#md-actions').addEventListener('click', async (e) => {
  const act = e.target.dataset.modAct;
  const mp = state.moderatorPage;
  if (!act || !mp?.data) return;
  const m = mp.data.moderator;
  const calls = {
    run: () => api(`/moderators/${m.id}/run`, { method: 'POST' }),
    pause: () => api(`/moderators/${m.id}/settings`, { method: 'PATCH', body: JSON.stringify({ paused: !m.settings.paused }) }),
    recheck: () => api(`/moderators/${m.id}/recheck`, { method: 'POST' }),
    'retry-members': () => api(`/moderators/${m.id}/retry-members`, { method: 'POST' }),
    unset: () => api(`/admin/verify/profiles/${m.id}`, { method: 'PATCH', body: JSON.stringify({ isModerator: false }) }),
  };
  if (act === 'unset' && !confirm(`Retirer le rôle de modérateur à « ${m.name} » ?\nIl redevient un profil ordinaire.`)) return;
  e.target.disabled = true;
  try {
    const r = await calls[act]();
    notice(
      act === 'run'
        ? r.online
          ? 'Passage demandé : son extension le lance dans la minute.'
          : 'Passage demandé, mais son extension est hors ligne : il partira quand elle se reconnectera.'
        : act === 'pause'
          ? m.settings.paused ? 'Modérateur repris.' : 'Modérateur suspendu : il ne prend plus de tâches.'
          : act === 'recheck'
            ? `${r.requeued} publication(s) remise(s) en vérification.`
            : act === 'retry-members'
              ? `${r.requeued} adhésion(s) / pré-approbation(s) relancée(s).`
              : `${m.name} n’est plus modérateur.`,
    );
    if (act === 'unset') {
      await load();
      history.pushState({}, '', '/moderateurs');
      routeFromUrl();
    } else await renderModeratorPage(m.id);
  } catch (x) {
    notice(x.message, 'error');
    e.target.disabled = false;
  }
});
$('#md-settings').onsubmit = async (e) => {
  e.preventDefault();
  const mp = state.moderatorPage;
  const f = e.target;
  try {
    await api(`/moderators/${mp.id}/settings`, {
      method: 'PATCH',
      body: JSON.stringify({
        batchSize: Number(f.elements.batchSize.value),
        everyMinutes: Number(f.elements.everyMinutes.value),
        members: f.elements.members.checked,
      }),
    });
    notice('Réglages enregistrés : son extension les applique dans la minute.');
    await renderModeratorPage(mp.id);
  } catch (x) {
    notice(x.message, 'error');
  }
};
