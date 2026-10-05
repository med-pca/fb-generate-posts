/**
 * Rend l'interface d'administration dans jsdom et joue le parcours des
 * comptes : qui est connecté, ce qu'un rôle donne à voir, la création d'un
 * compte et l'affichage unique de sa clé.
 *
 * Un double de l'API suffit : ce qu'on teste, c'est ce que l'interface
 * montre et masque, pas ce que le serveur répond — celui-ci a ses propres
 * tests.
 *
 *   node public/admin/tests/ui-test.js
 */
const path = require('path');
const { JSDOM, VirtualConsole } = require(path.join(__dirname, '../../../node_modules/jsdom'));
const fs = require('fs');
const DIR = path.join(__dirname, '..');

const html = fs.readFileSync(`${DIR}/index.html`, 'utf8');
const vc = new VirtualConsole();
vc.on('jsdomError', (e) => console.error('[jsdom]', e.message));
vc.on('error', (...a) => console.error('[page]', ...a));
const dom = new JSDOM(html, { virtualConsole: vc, url: 'http://localhost:3000/', runScripts: 'outside-only', pretendToBeVisual: true });
const { window } = dom;
window.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
window.HTMLDialogElement.prototype.close = function () { this.open = false; };
// Les fenêtres de la plateforme (pfDialog) remplacent confirm()/prompt() :
// le test y répond comme un utilisateur, avec ce que `window.confirm` /
// `window.prompt` (simulés) auraient répondu. Le texte affiché leur est passé.
window.confirm = () => true;
setInterval(() => {
  const d = window.document.getElementById('pf-dialog');
  if (!d || !d.open) return;
  const text = [d.querySelector('#pf-dialog-title').textContent, d.querySelector('#pf-dialog-body').innerText ?? d.querySelector('#pf-dialog-body').textContent].join('\n');
  const field = d.querySelector('#pf-dialog-field');
  let key;
  if (!field.hidden) {
    const v = window.prompt(text);
    if (v === null) key = '__cancel';
    else { d.querySelector('#pf-dialog-input').value = v; key = '__ok'; }
  } else {
    key = window.confirm(text) ? null : '__cancel';
  }
  const buttons = [...d.querySelectorAll('[data-pf-answer]')];
  const target = key === '__cancel' ? buttons.find((b) => b.dataset.pfAnswer === '__cancel' || b.dataset.pfAnswer === 'cancel') : buttons.find((b) => b.type === 'submit');
  if (!target) return;
  if (target.type === 'submit') d.querySelector('form').dispatchEvent(new window.Event('submit', { cancelable: true }));
  else target.click();
}, 5);

const routes = {
  '/me': { id: 'boss', username: 'admin', role: 'ADMIN', status: 'ACTIVE' },
  '/users': [
    { id: 'boss', username: 'admin', role: 'ADMIN', status: 'ACTIVE', createdAt: '2026-09-01' },
    { id: 'u2', username: 'sofia', role: 'MANAGER', status: 'ACTIVE', createdAt: '2026-09-20' },
  ],
  '/sites': [
    { id: 's1', name: 'Tera', originUrl: 'https://tera.test', status: 'ACTIVE', hasOwnKey: true, articles: 0, owner: 'admin',
      categoryId: 'c1', category: 'Recettes', plugin: { state: 'CONNECTED', version: '1.3.0', lastDeliveryAt: '2026-09-28T10:00:00Z' } },
    { id: 's2', name: 'Nord', originUrl: 'https://nord.test', status: 'ACTIVE', hasOwnKey: false, articles: 0, owner: 'admin',
      categoryId: null, category: null, plugin: { state: 'MISSING', message: 'Extension absente' } },
  ],
  '/categories': [{ id: 'c1', name: 'Recettes', groups: 2, sites: 1 }],
  '/settings': { publishingEnabled: true },
};
const empty = { data: [], meta: { page: 1, limit: 12, total: 0, pages: 1 } };
window.fetch = async (url, options = {}) => {
  const path = String(url).replace('/api', '').split('?')[0];
  if (options.method === 'POST' && path === '/users') {
    return { ok: true, status: 201, json: async () => ({ id: 'u3', username: 'nouveau', role: 'MANAGER', status: 'ACTIVE', createdAt: '2026-09-27', automationKey: 'a'.repeat(64) }) };
  }
  const body = routes[path] ?? empty;
  return { ok: true, status: 200, json: async () => body };
};

window.eval(fs.readFileSync(`${DIR}/app.js`, 'utf8'));

setTimeout(async () => {
  const $ = (s) => window.document.querySelector(s);
  const $$q = (s) => [...window.document.querySelectorAll(s)];
  let ko = 0;
  const check = (label, ok, got) => { console.log(`${ok ? '  ok  ' : '  KO  '}${label}${ok ? '' : ' → ' + JSON.stringify(got)}`); if (!ok) ko++; };


  check('l’en-tête dit qui est connecté', /admin.*administrateur/.test($('#whoami').textContent), $('#whoami').textContent);
  check('le corps est marqué administrateur', window.document.body.classList.contains('is-admin'), [...window.document.body.classList]);
  check('la vue Comptes existe dans la navigation', !!$('.nav[data-view="users"]'), null);
  check('elle est réservée aux administrateurs', $('.nav[data-view="users"]').classList.contains('admin-only'), null);

  const sites = $('#site-rows').textContent;
  check('la page Sites dit quel site a l’extension', /Connectée/.test(sites) && /Absente/.test(sites), sites);
  check('et la catégorie de chaque site', /Recettes/.test(sites) && /aucune — pas de post/.test(sites), sites);
  check('les catégories sont listées', /Recettes/.test($('#category-rows').textContent), $('#category-rows').textContent);
  check('le formulaire de site propose les catégories', $('#site-form select[name=categoryId]').options.length === 2, null);
  check('un post ne se lie plus à un profil', !$('#post-form [name=profileId]') && !$('#generate-form [name=profileId]'), null);
  check('ses groupes se choisissent par catégorie', $('#post-category').options.length === 2 && $('#article-category').options.length === 2, null);
  const groupCategory = $('#group-form select[name=categoryId]');
  check('la catégorie d’un groupe est obligatoire', groupCategory.required && groupCategory.value === '' && !groupCategory.checkValidity(), groupCategory.value);
  check('le groupe ne propose pas « Aucune catégorie »', ![...groupCategory.options].some((o) => /Aucune/.test(o.textContent)), null);
  // Retirer les posts d'un groupe : chiffres d'abord, puis la suppression.
  const calls = [];
  const realFetch = window.fetch;
  window.fetch = async (url, options = {}) => {
    calls.push(`${options.method || 'GET'} ${String(url).replace('/api', '')}`);
    if (String(url).includes('/groups/g1/posts')) {
      return { ok: true, status: 200, json: async () => ({ removedFromGroup: 4, deletedPosts: 1, stillInOtherGroups: 3, kept: 2 }) };
    }
    return realFetch(url, options);
  };
  let asked = '';
  window.confirm = (message) => { asked = message; return true; };
  window.eval(`clearGroupPosts({ id: 'g1', name: 'Recettes FR' }, document.createElement('button'))`);
  await new Promise((resolve) => setTimeout(resolve, 50));
  check('retirer les posts compte d’abord à blanc', calls[0] === 'DELETE /groups/g1/posts?dryRun=true', calls);
  check('la confirmation donne les chiffres', /4 post\(s\) en attente/.test(asked) && /1 post\(s\) ne visaient que ce groupe/.test(asked) && /2 publication/.test(asked), asked);
  check('puis supprime pour de bon', calls.includes('DELETE /groups/g1/posts'), calls);
  window.fetch = realFetch;
  window.confirm = () => true;

  // ─── La file d'attente des posts ───────────────────────────────
  const post = (id, priority = 0) => ({ id, title: `Post ${id}`, description: 'Un texte', imageUrl: null, priority });
  const group = { id: 'g1', name: 'Recettes FR', category: { id: 'c1', name: 'Recettes' } };
  const salim = { id: 'p1', name: 'Salim' };
  const queueCalls = [];
  const queueBodies = {};
  const beforeQueue = window.fetch;
  window.fetch = async (url, options = {}) => {
    const path = String(url).replace('/api', '');
    queueCalls.push(`${options.method || 'GET'} ${path}`);
    queueBodies[`${options.method || 'GET'} ${path}`] = options.body;
    if (path === '/posts/targets/t-p/history') {
      return { ok: true, status: 200, json: async () => ({
        id: 't-p', status: 'AVAILABLE', facebookUrl: null, verifyStatus: 'REPUBLISHED', republishCount: 1,
        post: { id: 'p', title: 'Post p', url: 'https://site.test/p' }, group: { id: 'g1', name: 'Recettes FR', url: 'https://facebook.com/groups/g1' },
        attempts: [{ at: '2026-09-30T08:00:00Z', status: 'PUBLISHED', profile: salim, facebookUrl: 'https://www.facebook.com/groups/g1/posts/9', commentId: 'c1' }],
        events: [
          { at: '2026-09-30T08:00:00Z', kind: 'PUBLISHED', label: 'Publié', actor: 'Salim', facebookUrl: 'https://www.facebook.com/groups/g1/posts/9' },
          { at: '2026-09-30T09:00:00Z', kind: 'DELETED', label: 'Supprimé par le vérificateur', actor: 'Modo', detail: 'sans son lien' },
          { at: '2026-09-30T09:00:01Z', kind: 'REQUEUED', label: 'Remis dans la file', actor: 'vérifié par Modo' },
        ],
      }) };
    }
    if (path.startsWith('/posts/targets-by-url')) {
      return { ok: true, status: 200, json: async () => ([{ targetId: 't-p', current: false }]) };
    }
    if (path.startsWith('/posts/queue')) {
      return { ok: true, status: 200, json: async () => ({
        counts: { running: 1, upcoming: 12, published: 1, failed: 1 },
        failed: [{ targetId: 't-f', error: 'Le groupe n’accepte plus les publications', attempts: 2, failedAt: '2026-09-30T07:00:00Z', post: post('f'), group, profile: salim, candidates: [salim] }],
        running: [{ state: 'claimed', since: '2026-09-30T09:00:00Z', expiresAt: '2026-09-30T10:45:00Z', jobId: 'job-bloque', post: post('r'), group, profile: salim }],
        upcoming: [
          { rank: 1, targetId: 't-a', post: post('a', 3), group, candidates: [salim], forcedProfile: salim, forcedAt: '2026-09-30T09:00:00Z' },
          { rank: 2, targetId: 't-b', post: post('b'), group: { ...group, pendingJoins: 8 }, candidates: [] },
        ],
        published: [{ targetId: 't-p', publishedAt: '2026-09-30T08:00:00Z', post: post('p'), group, profile: salim, facebookUrl: 'https://facebook.com/groups/g1/posts/9', link: 'placed', verify: { status: 'REPUBLISHED', detail: 'post introuvable', republishCount: 1 } }],
      }) };
    }
    if (path === '/admin/verify') {
      return { ok: true, status: 200, json: async () => ({ due: 4, verified: 10, republished: 1, needsAction: 1, review: [
        { targetId: 't-v', detail: 'en ligne sans son lien, non supprimé', since: '2026-09-30T09:00:00Z', post: post('v'), group, facebookUrl: 'https://facebook.com/groups/g1/posts/7' },
      ] }) };
    }
    if (path === '/admin/verify/targets/t-v/resolve') return { ok: true, status: 200, json: async () => ({ result: 'verified' }) };
    if (path.includes('/priority')) return { ok: true, status: 200, json: async () => ({ id: 'b', priority: 4 }) };
    if (path === '/admin/jobs/job-bloque/release') return { ok: true, status: 200, json: async () => ({ jobId: 'job-bloque', released: 3, inProgress: 0 }) };
    if (path.startsWith('/posts/targets/')) return { ok: true, status: 200, json: async () => ({ warning: path.endsWith('/force') && options.body.includes('p1') ? 'Salim est à l’arrêt dans le Pilotage.' : null }) };
    if (path === '/posts/f') return { ok: true, status: 200, json: async () => ({ id: 'f', title: 'Post f', description: 'Texte long', url: 'https://site.test/f', imageUrl: 'https://img.test/f.jpg', delay: 20 }) };
    return beforeQueue(url, options);
  };
  window.eval(`showPostsTab('queue')`);
  await new Promise((resolve) => setTimeout(resolve, 50));
  check('la file s’ouvre sur l’onglet Posts', !$('#posts-queue').classList.contains('hidden') && $('#posts-all').classList.contains('hidden'), null);
  check('les compteurs sont affichés', $('#q-upcoming').textContent === '12' && $('#q-running').textContent === '1', $('#q-upcoming').textContent);
  const upcomingRows = $('#queue-upcoming').textContent;
  check('les prochains sont numérotés dans l’ordre', /1.*Post a.*2.*Post b/s.test(upcomingRows), upcomingRows);
  check('la priorité d’un post est visible', /\+3/.test(upcomingRows), upcomingRows);
  check('un groupe sans profil « Rejoint » dit ses demandes en attente', /8 demande\(s\) en attente/.test(upcomingRows), upcomingRows);
  const publishedRows = $('#queue-published').textContent;
  check('un post publié dit par quel profil et dans quel groupe', /Salim/.test(publishedRows) && /Recettes FR/.test(publishedRows), publishedRows);
  check('et le lien Facebook de la publication', !!$('#queue-published a[href="https://facebook.com/groups/g1/posts/9"]'), null);
  check('la vérification d’un post publié est visible', /Republié/.test(publishedRows), publishedRows);
  check('« À traiter » liste ce que le vérificateur n’a pas réglé', !$('#queue-review-panel').hidden && /sans son lien/.test($('#queue-review').textContent), null);
  check('avec le bilan de la vérification', /10 vérifiée/.test($('#verify-summary').textContent), $('#verify-summary').textContent);
  $('[data-verify-resolve="t-v"][data-action="ok"]').click();
  await new Promise((resolve) => setTimeout(resolve, 50));
  check('« C’est bon » tranche la publication', queueCalls.includes('POST /admin/verify/targets/t-v/resolve'), queueCalls);
  check('« en cours » montre le profil qui tient le lot', /Salim/.test($('#queue-running').textContent) && /Réservé/.test($('#queue-running').textContent), null);
  $('[data-release-job="job-bloque"]').click();
  await new Promise((resolve) => setTimeout(resolve, 50));
  check('« Libérer le lot » débloque le profil', queueCalls.includes('POST /admin/jobs/job-bloque/release'), queueCalls);
  check('« voir plus » reste proposé quand il en reste', $('#queue-more').hidden === false, null);
  $('[data-prio="b"][data-move="top"]').click();
  await new Promise((resolve) => setTimeout(resolve, 50));
  check('« En tête » envoie la priorité', queueCalls.includes('PATCH /posts/b/priority'), queueCalls);

  // ─── Échecs, envoi forcé, retrait, modification ──────────────────
  check('les échecs sont listés avec leur raison', /n’accepte plus les publications/.test($('#queue-failed').textContent) && $('#q-failed').textContent === '1', $('#queue-failed').textContent);
  check('un échec dit quel profil a essayé', /par Salim/.test($('#queue-failed').textContent), null);
  $('[data-retry="t-f"]').click();
  await new Promise((resolve) => setTimeout(resolve, 50));
  check('« Relancer » relance l’échec', queueCalls.includes('POST /posts/targets/t-f/retry'), queueCalls);
  window.prompt = () => 'https://www.facebook.com/groups/g1/posts/42';
  $('[data-mark-online="t-f"]').click();
  await new Promise((resolve) => setTimeout(resolve, 50));
  check('« Déjà en ligne » l’enregistre publié sans le republier', queueCalls.includes('POST /posts/targets/t-f/published'), queueCalls);
  check('avec l’adresse du post, pour le vérificateur', /posts\/42/.test(queueBodies['POST /posts/targets/t-f/published'] || ''), queueBodies);

  // ─── Traçabilité ──────────────────────────────────────────────────
  $('[data-set-url="t-p"]').click();
  await new Promise((resolve) => setTimeout(resolve, 50));
  check('« Coller le lien » enregistre l’adresse d’un post publié', queueCalls.includes('PUT /posts/targets/t-p/facebook-url'), queueCalls);
  $('[data-history="t-p"]').click();
  await new Promise((resolve) => setTimeout(resolve, 50));
  const story = $('#history-events').textContent;
  check('l’historique s’ouvre', $('#history-modal').open === true, null);
  check('il dit qui a publié, et à quelle adresse', /Publié/.test(story) && /Salim/.test(story) && !!$('#history-events a[href="https://www.facebook.com/groups/g1/posts/9"]'), story);
  check('le plus récent en premier : supprimé puis remis en file', /Remis dans la file.*Supprimé par le vérificateur.*Publié/s.test(story), story);
  check('les tentatives disent le profil', /Salim/.test($('#history-attempts').textContent), $('#history-attempts').textContent);
  $('#history-modal').close();
  $('#url-search').elements.url.value = 'https://www.facebook.com/groups/g1/posts/9';
  $('#url-search').dispatchEvent(new window.Event('submit', { cancelable: true }));
  await new Promise((resolve) => setTimeout(resolve, 50));
  check('un lien Facebook collé retrouve sa publication', queueCalls.some((c) => c.startsWith('GET /posts/targets-by-url')) && $('#history-modal').open, queueCalls);
  $('#history-modal').close();

  // ─── Organisation : un état à la fois, une adresse par onglet ─────
  check('la file s’ouvre sur « À venir », un seul tableau visible', $('.q-section.active')?.dataset.section === 'upcoming' && $$q('.q-section.active').length === 1, null);
  $('[data-q-section="failed"]').click();
  check('l’onglet « En échec » a son adresse : /posts/echecs', window.location.pathname === '/posts/echecs' && $('.q-section.active').dataset.section === 'failed', window.location.pathname);
  check('et dit quoi faire', /Relancer/.test($('#q-help').textContent), $('#q-help').textContent);
  check('l’onglet est signalé quand il y a des échecs', $('[data-q-section="failed"]').classList.contains('alert'), null);
  const dots = $('#queue-failed [data-row-menu]');
  dots.click();
  check('« ⋯ » ouvre le menu de la ligne', dots.nextElementSibling.hidden === false && /Déjà en ligne/.test(dots.nextElementSibling.textContent), null);
  window.document.body.click();
  check('un clic ailleurs le referme', dots.nextElementSibling.hidden === true, null);
  $('#queue-search').value = 'zzz-introuvable';
  $('#queue-search').dispatchEvent(new window.Event('input'));
  check('la recherche filtre les lignes', /Aucun échec/.test($('#queue-failed').textContent), $('#queue-failed').textContent.slice(0, 60));
  $('#queue-search').value = '';
  $('#queue-search').dispatchEvent(new window.Event('input'));
  $('[data-q-section="upcoming"]').click();
  check('retour à « À venir » : /posts', window.location.pathname === '/posts', window.location.pathname);
  check('un envoi forcé est visible dans la file', /→ Salim/.test($('#queue-upcoming').textContent), null);
  const forceSelect = $('select[data-force="t-f"]');
  forceSelect.value = 'p1';
  forceSelect.dispatchEvent(new window.Event('change', { bubbles: true }));
  await new Promise((resolve) => setTimeout(resolve, 50));
  check('« Envoyer par… » force le profil choisi', queueCalls.includes('PUT /posts/targets/t-f/force'), queueCalls);
  check('et prévient si ce profil est à l’arrêt', /à l’arrêt/.test($('#notice').textContent), $('#notice').textContent);
  check('un groupe sans profil ne propose pas d’envoi', !$('#queue-upcoming tr:nth-child(2) select') && /Aucun profil n’a rejoint ce groupe/.test($('#queue-upcoming tr:nth-child(2)').textContent), null);
  $('[data-unforce="t-a"]').click();
  await new Promise((resolve) => setTimeout(resolve, 50));
  check('« annuler » rend la publication à la file', queueCalls.filter((c) => c === 'PUT /posts/targets/t-a/force').length === 1, queueCalls);

  $('[data-remove-target="t-b"]').click();
  await new Promise((resolve) => setTimeout(resolve, 50));
  check('« Retirer » ne retire que ce groupe', queueCalls.includes('DELETE /posts/targets/t-b'), queueCalls);

  $('[data-edit-queued="f"]').click();
  await new Promise((resolve) => setTimeout(resolve, 50));
  check('« Modifier » ouvre le post complet', $('#post-modal').open && $('#post-form').elements.description.value === 'Texte long', $('#post-form').elements.description.value);
  check('avec l’aperçu de son image', !$('#post-image-preview').hidden && $('#post-image-preview').src === 'https://img.test/f.jpg', null);
  $('#post-modal').close();
  window.fetch = beforeQueue;

  // ─── Journaux séparés par domaine ──────────────────────────────
  const logCalls = [];
  const beforeLogs = window.fetch;
  window.fetch = async (url, options = {}) => {
    const path = String(url).replace('/api', '');
    if (path.startsWith('/admin/logs')) {
      logCalls.push(path);
      if (path.startsWith('/admin/logs/summary')) {
        return { ok: true, status: 200, json: async () => ({
          total: 9, since: '2026-09-30T00:00:00Z', hours: 24, claimLost: 0,
          levels: { DEBUG: 0, INFO: 5, WARN: 3, ERROR: 1 },
          pendingLinkUpdates: { total: 0, pendingSince: null },
          eventTypes: [], profiles: [], incidents: [],
          domains: [
            { domain: 'publication', label: 'Publication', total: 4, errors: 1, warns: 0 },
            { domain: 'capture', label: 'Captures', total: 1, errors: 0, warns: 0 },
            { domain: 'sync', label: 'Synchronisation', total: 3, errors: 0, warns: 3 },
            { domain: 'groups', label: 'Groupes & pilotage', total: 1, errors: 0, warns: 0 },
            { domain: 'other', label: 'Autres', total: 0, errors: 0, warns: 0 },
          ],
        }) };
      }
      if (path.startsWith('/admin/logs/export')) {
        return { ok: true, status: 200, blob: async () => new window.Blob(['date;niveau']), json: async () => ({}) };
      }
      return { ok: true, status: 200, json: async () => ({
        data: [
          { id: 'l1', createdAt: '2026-09-30T08:00:00Z', level: 'WARN', eventType: 'WORDPRESS_ARTICLE_NO_POST', domain: 'sync', message: '« Couscous » reçu de Food Time sans post : le site n’a pas de catégorie', metadata: null },
          { id: 'l2', createdAt: '2026-09-30T09:00:00Z', level: 'ERROR', eventType: 'VERIFY_MISSING_LINK', domain: 'publication', message: '« Tajine » dans « Recettes FR » : en ligne SANS le lien de l’article',
            facebookUrl: 'https://www.facebook.com/groups/1/posts/9', postTargetId: 't-log', metadata: { expectedLink: 'https://site.test/tajine' },
            profile: { id: 'p-modo', name: 'Modo' }, group: { id: 'g1', name: 'Recettes FR', category: { id: 'c1', name: 'Recettes' } }, post: { id: 'post-t', title: 'Tajine' } },
        ],
        meta: { page: 1, limit: 25, total: 2, pages: 1 },
      }) };
    }
    return beforeLogs(url, options);
  };
  window.eval(`view('logs')`);
  await new Promise((resolve) => setTimeout(resolve, 50));
  const tabs = [...window.document.querySelectorAll('[data-log-domain]')].map((b) => b.textContent);
  check('les journaux ont un onglet par domaine', tabs.join('|').includes('Publication') && tabs.join('|').includes('Captures') && tabs.join('|').includes('Synchronisation'), tabs);
  check('un onglet montre ses erreurs', !!$('[data-log-domain="publication"] .badge.error'), null);
  check('et ses avertissements', $('[data-log-domain="sync"] .badge.warn')?.textContent === '3', null);
  $('[data-log-domain="sync"]').click();
  await new Promise((resolve) => setTimeout(resolve, 50));
  check('choisir un domaine filtre la liste et la synthèse',
    logCalls.slice(-2).every((c) => c.includes('domain=sync')), logCalls.slice(-2));
  check('l’onglet explique ce qu’il couvre', /articles reçus de WordPress/.test($('#log-domain-hint').textContent), $('#log-domain-hint').textContent);
  check('chaque ligne porte son domaine', /Synchronisation/.test($('#log-rows').textContent) && !!$('#log-rows .domain-sync'), null);

  // Traçabilité : le lien du post, l'historique, les filtres.
  check('le lien du post Facebook est dans le journal, cliquable', !!$('#log-rows a[href="https://www.facebook.com/groups/1/posts/9"]'), null);
  check('avec l’accès à l’historique de la publication', !!$('#log-rows [data-history="t-log"]'), null);
  $('#log-rows [data-log-filter="groupId"]').click();
  await new Promise((resolve) => setTimeout(resolve, 50));
  check('un clic sur le groupe filtre le journal', logCalls.at(-2).includes('groupId=g1'), logCalls.slice(-2));
  $('#log-rows [data-log-filter="postTargetId"]').click();
  await new Promise((resolve) => setTimeout(resolve, 50));
  check('« Tout sur cette publication » la suit d’un bout à l’autre', logCalls.at(-2).includes('postTargetId=t-log') && /Publication : Tajine/.test($('#log-chips').textContent), $('#log-chips').textContent);
  $('#log-url').value = 'https://www.facebook.com/groups/1/posts/9';
  $('#log-url').dispatchEvent(new window.Event('change'));
  $('#log-with-url').checked = true;
  $('#log-with-url').dispatchEvent(new window.Event('change'));
  await new Promise((resolve) => setTimeout(resolve, 50));
  const lastList = logCalls.filter((c) => !c.includes('summary')).at(-1);
  check('filtre par lien Facebook et « avec lien »', lastList.includes('facebookUrl=') && lastList.includes('withUrl=true'), lastList);
  check('« Effacer les filtres » apparaît', $('#log-reset').hidden === false, null);
  window.URL.createObjectURL = () => 'blob:x';
  window.URL.revokeObjectURL = () => {};
  $('#log-export').click();
  await new Promise((resolve) => setTimeout(resolve, 50));
  const exported = logCalls.find((c) => c.startsWith('/admin/logs/export'));
  check('l’export CSV suit les mêmes filtres', !!exported && exported.includes('postTargetId=t-log') && exported.includes('withUrl=true'), exported);
  $('#log-reset').click();
  await new Promise((resolve) => setTimeout(resolve, 50));
  check('« Effacer les filtres » remet tout à zéro', !logCalls.at(-1).includes('postTargetId') && $('#log-chips').textContent === '', logCalls.at(-1));
  window.fetch = beforeLogs;

  // ─── Profils : filtres, santé, fiche, désactivation avec transfert ──
  const profileCalls = [];
  const beforeProfiles = window.fetch;
  window.fetch = async (url, options = {}) => {
    const full = String(url).replace('/api', '');
    const path = full.split('?')[0];
    if (path === '/profiles') {
      profileCalls.push(full);
      return { ok: true, status: 200, json: async () => ({
        data: [{ id: 'p-bad', name: 'Rihab', externalId: 'ext-r', status: 'ACTIVE', minPostsPerJob: 1, maxPostsPerJob: 3, _count: { profileGroups: 4, posts: 0 },
          health: { score: 22, label: 'bad', labelText: 'Mauvais', suggestDeactivate: true, reasons: ['5 échecs d\'affilée sur ses dernières tentatives'], published: 2, failed: 9, failStreak: 5 } }],
        meta: { page: 1, limit: 12, total: 1, pages: 1 },
      }) };
    }
    if (path === '/profiles/p-bad/health') {
      return { ok: true, status: 200, json: async () => ({
        profile: { id: 'p-bad', name: 'Rihab', status: 'ACTIVE', runner: { mode: 'AUTO' } },
        health: { score: 22, label: 'bad', labelText: 'Mauvais', windowDays: 14, suggestDeactivate: true, successRate: 0.18, verifyRate: null, linkRate: 0.5,
          reasons: ['5 échecs d\'affilée sur ses dernières tentatives', '9 échecs en 14 jours (18 % de réussite)'], input: { failStreak: 5, claimsLost: 0 } },
        totals: { today: 0, week: 2, month: 6, total: 40, failedWeek: 7, failedMonth: 9, failedTotal: 12, lastPublishedAt: '2026-10-01T10:00:00Z', lastFailedAt: '2026-10-03T09:00:00Z' },
        days: Array.from({ length: 14 }, (_, i) => ({ day: `2026-09-${String(20 + i).padStart(2, '0')}`, published: i % 3, failed: i > 10 ? 2 : 0 })),
        groups: [{ id: 'g1', name: 'Recettes FR', published: 2, failed: 7, lastError: 'Le groupe n’accepte plus les publications' }],
        errors: [{ error: 'Le composeur ne s’est pas ouvert', count: 6 }],
        failures: [{ at: '2026-10-03T09:00:00Z', error: 'Le composeur ne s’est pas ouvert', postTargetId: 't-f1', post: 'Tajine', group: 'Recettes FR' }],
        joins: { JOINED: 4 }, preApproved: 1,
        memberships: [
          { linkId: 'pg-link-1', groupId: 'g1', name: 'Recettes FR', url: 'https://facebook.com/groups/1', groupStatus: 'ACTIVE', linkStatus: 'ACTIVE', category: { id: 'c1', name: 'Recettes' }, joinStatus: 'JOINED', preApproved: true, waiting: 4 },
          { linkId: 'pg-link-2', groupId: 'g2', name: 'Cuisine du Maroc', url: 'https://facebook.com/groups/2', groupStatus: 'ACTIVE', linkStatus: 'ACTIVE', category: { id: 'c1', name: 'Recettes' }, joinStatus: 'REQUESTED', preApproved: false, waiting: 1 },
          { linkId: 'pg-link-3', groupId: 'g3', name: 'Desserts maison', url: 'https://facebook.com/groups/3', groupStatus: 'ACTIVE', linkStatus: 'ACTIVE', category: { id: 'c1', name: 'Recettes' }, joinStatus: 'JOINED', preApproved: false, waiting: 2 },
        ],
        transfer: { forcedTargets: 2, ownedPosts: 0, activeJobs: 1, groupsWaiting: 4,
          orphanGroups: [{ id: 'g9', name: 'Cuisine maison', url: 'https://facebook.com/groups/9' }],
          candidates: [
            { id: 'p-good', name: 'Nadia', score: 94, label: 'good', running: true, groupsCovered: 3, coverage: 0.75 },
            { id: 'p-new', name: 'Omar', score: null, label: 'new', running: false, groupsCovered: 1, coverage: 0.25 },
          ], recommendedId: 'p-good' },
      }) };
    }
    if (path === '/bulk/groups') {
      return { ok: true, status: 200, json: async () => ([
        { id: 'g1', name: 'Recettes FR', url: 'https://facebook.com/groups/1', status: 'ACTIVE', category: { id: 'c1', name: 'Recettes' }, _count: { profiles: 3 } },
        { id: 'g9', name: 'Cuisine maison', url: 'https://facebook.com/groups/9', status: 'ACTIVE', category: { id: 'c1', name: 'Recettes' }, _count: { profiles: 0 } },
      ]) };
    }
    if (path === '/bulk/link') {
      profileCalls.push(`POST ${path} ${options.body}`);
      return { ok: true, status: 200, json: async () => ({ action: 'link', created: 1, reactivated: 0, already: 0, removed: 0, ignored: 0, profiles: 1, groups: 1 }) };
    }
    if (path === '/moderators/members') {
      profileCalls.push(`POST ${path} ${options.body}`);
      return { ok: true, status: 200, json: async () => ({ kind: 'preapprove', requested: 1, moderators: 1, moderatorsTotal: 1, blocked: { noFacebookId: 0, profiles: [] } }) };
    }
    if (path === '/moderators/audit') {
      profileCalls.push(`POST ${path} ${options.body}`);
      return { ok: true, status: 200, json: async () => ({ requested: 1, moderators: 1 }) };
    }
    if (path === '/profiles/p-bad/deactivate') {
      profileCalls.push(`POST ${path} ${options.body}`);
      return { ok: true, status: 200, json: async () => ({ released: 2, transferredTo: { id: 'p-good', name: 'Nadia' }, forcedMoved: 2, forcedCleared: 0, postsOpened: 0, prioritised: 0, orphanGroups: [{ id: 'g9', name: 'Cuisine maison' }] }) };
    }
    return beforeProfiles(url, options);
  };
  $('#pf-health').value = 'deactivate';
  $('#pf-health').dispatchEvent(new window.Event('change'));
  await new Promise((resolve) => setTimeout(resolve, 80));
  check('le filtre de santé part à l’API', profileCalls.some((c) => c.includes('health=deactivate')), profileCalls);
  const card = $('#profile-cards').textContent;
  check('la carte montre le score et l’indice « À désactiver ? »', /22\/100/.test(card) && /À désactiver/.test(card), card);
  check('« Effacer les filtres » apparaît sur la page Profils', $('#pf-reset').hidden === false, null);
  $('[data-deactivate-profile="p-bad"]').click();
  await new Promise((resolve) => setTimeout(resolve, 80));
  check('« Désactiver » ouvre la PAGE du profil, avec son adresse', $('#profile-page').classList.contains('active') && window.location.pathname === '/profils/p-bad', window.location.pathname);
  const detailText = $('#profile-page').textContent;
  check('la page donne l’indice et ses raisons', /il vaudrait mieux le désactiver/.test(detailText) && /5 échecs d'affilée/.test(detailText), null);
  check('avec les statistiques détaillées', /échecs \(7 j\)/.test(detailText) && /18 %/.test(detailText) && /Recettes FR/.test($('#pd-groups').textContent), null);
  check('et le graphe des 14 jours', $('#pd-chart').querySelectorAll('.pd-bar').length === 14, null);
  check('ses groupes sont listés, avec adhésion et pré-approbation', /Recettes FR/.test($('#pp-memberships').textContent) && /Demande envoyée/.test($('#pp-memberships').textContent) && /3 groupe\(s\) lié\(s\)/.test($('#pp-groups-title').textContent), $('#pp-groups-title').textContent);
  check('la pré-approbation montre si elle a été vérifiée sur Facebook', /non vérifié sur Facebook/.test($('#pp-memberships').textContent), $('#pp-memberships').textContent.slice(0, 200));
  $('[data-pp-audit="pg-link-1"]').click();
  await new Promise((resolve) => setTimeout(resolve, 60));
  check('« 🔍 Tester » sur UN groupe demande un contrôle sans rien modifier', profileCalls.some((c) => c.startsWith('POST /moderators/audit') && c.includes('"profileGroupIds":["pg-link-1"]') && c.includes('"mode":"check"')), profileCalls);
  check('« ★ Pré-approuver » proposé là où il est membre et pas pré-approuvé', !!$('[data-pp-member="preapprove"][data-link="pg-link-3"]') && !$('[data-pp-member="preapprove"][data-link="pg-link-1"]'), null);
  check('« ✓ Accepter » proposé là où sa demande attend', !!$('[data-pp-member="approve"][data-link="pg-link-2"]'), null);
  $('[data-pp-member="preapprove"][data-link="pg-link-3"]').click();
  await new Promise((resolve) => setTimeout(resolve, 60));
  check('le clic le demande au modérateur pour CE groupe', profileCalls.some((c) => c.startsWith('POST /moderators/members') && c.includes('"profileGroupIds":["pg-link-3"]') && c.includes('"kind":"preapprove"')), profileCalls);
  check('on peut lui ajouter les groupes qu’il n’a pas', /Cuisine maison/.test($('#pp-add-list').textContent) && !/Recettes FR/.test($('#pp-add-list').textContent), $('#pp-add-list').textContent);
  $('[data-pp-add="g9"]').checked = true;
  $('[data-pp-add="g9"]').dispatchEvent(new window.Event('change', { bubbles: true }));
  $('#pp-add').click();
  await new Promise((resolve) => setTimeout(resolve, 80));
  check('« Lier aux groupes cochés » lie le profil en une fois', profileCalls.some((c) => c.startsWith('POST /bulk/link') && c.includes('"profileIds":["p-bad"]') && c.includes('"groupIds":["g9"]') && c.includes('"action":"link"')), profileCalls);
  check('le repreneur recommandé est présélectionné (actif, bon score)', $('#pd-heir').value === 'p-good', $('#pd-heir').value);
  check('les groupes où il était seul sont signalés', /Cuisine maison/.test($('#pd-transfer').textContent), null);
  $('#pd-deactivate').click();
  await new Promise((resolve) => setTimeout(resolve, 80));
  check('désactiver transfère au repreneur choisi', profileCalls.some((c) => c.startsWith('POST /profiles/p-bad/deactivate') && c.includes('"transferTo":"p-good"')), profileCalls);
  $('[data-goto="/profils"]').click();
  await new Promise((resolve) => setTimeout(resolve, 50));
  check('« ← Tous les profils » revient à la liste', $('#profiles').classList.contains('active') && window.location.pathname === '/profils', window.location.pathname);
  $('#pf-reset').click();
  await new Promise((resolve) => setTimeout(resolve, 80));
  check('« Effacer les filtres » rend tous les profils', !profileCalls.at(-1).includes('health='), profileCalls.at(-1));
  window.fetch = beforeProfiles;

  // ─── Actions en masse : lier profils ↔ groupes, partager ───────────
  const bulkCalls = [];
  const beforeBulk = window.fetch;
  window.fetch = async (url, options = {}) => {
    const path = String(url).replace('/api', '').split('?')[0];
    if (path === '/bulk/profiles') {
      return { ok: true, status: 200, json: async () => ([
        { id: 'p1', name: 'Salim', status: 'ACTIVE', externalId: 'x1', _count: { profileGroups: 3 } },
        { id: 'p2', name: 'Nadia', status: 'ACTIVE', externalId: 'x2', _count: { profileGroups: 0 } },
        { id: 'p3', name: 'Ancien', status: 'INACTIVE', externalId: 'x3', _count: { profileGroups: 1 } },
      ]) };
    }
    if (path === '/bulk/groups') {
      return { ok: true, status: 200, json: async () => ([
        { id: 'g1', name: 'Recettes FR', url: 'https://facebook.com/groups/1', status: 'ACTIVE', category: { id: 'c1', name: 'Recettes' }, _count: { profiles: 2 } },
        { id: 'g2', name: 'Recettes MA', url: 'https://facebook.com/groups/2', status: 'ACTIVE', category: { id: 'c1', name: 'Recettes' }, _count: { profiles: 0 } },
        { id: 'g3', name: 'Immobilier', url: 'https://facebook.com/groups/3', status: 'ACTIVE', category: null, _count: { profiles: 1 } },
      ]) };
    }
    if (path === '/bulk/link' || path === '/bulk/share') {
      bulkCalls.push(`${path} ${options.body}`);
      return { ok: true, status: 200, json: async () => (path === '/bulk/link'
        ? { action: 'link', created: 4, reactivated: 0, already: 0, removed: 0, ignored: 0, profiles: 2, groups: 2 }
        : { done: 3, items: 2, users: 2, ignored: 0, failures: [{ item: 'Recettes MA', userId: 'u2', reason: 'Vous n’êtes pas propriétaire' }] }) };
    }
    return beforeBulk(url, options);
  };
  $('.nav[data-view="bulk"]').click();
  await new Promise((resolve) => setTimeout(resolve, 80));
  check('« Actions en masse » a sa page : /actions-en-masse', window.location.pathname === '/actions-en-masse' && $('#bulk').classList.contains('active'), window.location.pathname);
  check('les profils actifs sont listés (les inactifs à part)', /Salim/.test($('#bl-profiles').textContent) && !/Ancien/.test($('#bl-profiles').textContent), $('#bl-profiles').textContent);
  $('[data-bl-all="profiles"]').click();
  $('#bl-group-category').value = 'c1';
  $('#bl-group-category').dispatchEvent(new window.Event('change'));
  check('filtrer les groupes par catégorie', !/Immobilier/.test($('#bl-groups').textContent) && /Recettes MA/.test($('#bl-groups').textContent), $('#bl-groups').textContent);
  $('[data-bl-all="groups"]').click();
  check('le résumé compte les liaisons', /2 profil\(s\) × 2 groupe\(s\) = 4 liaison/.test($('#bl-summary').textContent), $('#bl-summary').textContent);
  $('#bl-link').click();
  await new Promise((resolve) => setTimeout(resolve, 80));
  const linked = bulkCalls.find((c) => c.startsWith('/bulk/link'));
  check('« Lier » envoie tous les profils × groupes cochés', !!linked && linked.includes('"profileIds":["p1","p2"]') && linked.includes('"groupIds":["g1","g2"]') && linked.includes('"action":"link"'), linked);
  check('et dit ce qui a été fait', /4 liaison\(s\) créée/.test($('#bl-result').textContent), $('#bl-result').textContent);
  $('[data-bulk-tab="share"]').click();
  $('[data-bs-all]').click();
  [...window.document.querySelectorAll('[data-bs-user]')].forEach((u) => { u.checked = true; u.dispatchEvent(new window.Event('change', { bubbles: true })); });
  $('#bs-grant').click();
  await new Promise((resolve) => setTimeout(resolve, 80));
  const shared = bulkCalls.find((c) => c.startsWith('/bulk/share'));
  check('« Partager » envoie les groupes × comptes cochés', !!shared && shared.includes('"kind":"groups"') && shared.includes('"userIds":["u2"]') && shared.includes('"action":"grant"'), shared);
  check('les refus sont détaillés', /pas propriétaire/.test($('#bs-result').textContent), $('#bs-result').textContent);
  window.fetch = beforeBulk;

  // ─── Rubrique Modérateurs ───────────────────────────────────────
  const modCalls = [];
  const beforeMods = window.fetch;
  const counts = (n) => ({ verified: n, ok: n - 1, missingPost: 0, missingLink: 1, pending: 0, unreachable: 0, deleted: 1, deleteFailed: 0, urlFound: 0, approved: 2, preApproved: 3, memberFailed: 0 });
  const modSettings = { paused: false, batchSize: 5, everyMinutes: 10, members: true, seenAt: new Date().toISOString(), online: true, agent: 'checker 1.3.0' };
  window.fetch = async (url, options = {}) => {
    const path = String(url).replace('/api', '').split('?')[0];
    if (path === '/moderators') {
      return { ok: true, status: 200, json: async () => ({ due: { verifications: 7, needsAction: 2, members: 4 },
        moderators: [{ id: 'mod-000001', name: 'Modo Karim', status: 'ACTIVE', externalId: 'ext-m', settings: modSettings, today: counts(3), week: counts(20) }] }) };
    }
    if (path === '/moderators/mod-000001') {
      return { ok: true, status: 200, json: async () => ({
        moderator: { id: 'mod-000001', name: 'Modo Karim', status: 'ACTIVE', externalId: 'ext-m', settings: modSettings },
        counts: { today: counts(3), week: counts(20), month: counts(50), total: counts(120) },
        days: Array.from({ length: 14 }, (_, i) => ({ day: `2026-09-${String(20 + (i % 10)).padStart(2, '0')}`, ok: i, problems: 1, members: 2 })),
        due: { verifications: 7, needsAction: 2, members: 4, memberProblems: 1 },
        recent: [{ at: new Date().toISOString(), level: 'ERROR', eventType: 'VERIFY_MISSING_LINK', message: '« Tajine » dans « Recettes FR » : en ligne SANS le lien', facebookUrl: 'https://www.facebook.com/groups/1/posts/9', postTargetId: 't1' }],
      }) };
    }
    if (path === '/moderators/members' && options.method === 'POST') {
      modCalls.push(`POST /moderators/members ${options.body}`);
      return { ok: true, status: 200, json: async () => ({ kind: 'preapprove', requested: 6, moderators: 1, moderatorsTotal: 1, blocked: { noFacebookId: 2, profiles: ['Nadia'] } }) };
    }
    if (path === '/moderators/members') {
      return { ok: true, status: 200, json: async () => ({ approve: 3, approveBlocked: 0, preapprove: 8, preapproveBlocked: 2, requested: 0, preApproved: 5 }) };
    }
    if (path === '/moderators/audit' && options.method === 'POST') {
      modCalls.push(`POST /moderators/audit ${options.body}`);
      return { ok: true, status: 200, json: async () => ({ requested: 1, moderators: 1 }) };
    }
    if (path === '/moderators/audit') {
      return { ok: true, status: 200, json: async () => ({
        summary: { pending: 1, preApproved: 1, notPreApproved: 1, noPermission: 0, notFound: 0 },
        rows: [
          { taskId: 'pg1', profile: { id: 'p1', name: 'Salim' }, group: { id: 'g1', name: 'Recettes FR', url: 'https://facebook.com/groups/1' }, pending: false, state: 'PREAPPROVED', checkedAt: new Date().toISOString(), detail: 'menu : « Retirer la pré-approbation »' },
          { taskId: 'pg2', profile: { id: 'p2', name: 'Nadia' }, group: { id: 'g2', name: 'Cuisine MA', url: null }, pending: false, state: 'NOT_PREAPPROVED', checkedAt: new Date().toISOString(), detail: 'menu : « Pré-approuver les publications » proposé, non cliqué' },
          { taskId: 'pg3', profile: { id: 'p3', name: 'Omar' }, group: { id: 'g3', name: 'Desserts', url: null }, pending: true, mode: 'check', state: null },
        ],
      }) };
    }
    if (path.startsWith('/moderators/mod-000001/')) {
      modCalls.push(`${options.method} ${path} ${options.body || ''}`);
      return { ok: true, status: 200, json: async () => ({ requeued: 2, online: true }) };
    }
    return beforeMods(url, options);
  };
  $('.nav[data-view="moderators"]').click();
  await new Promise((resolve) => setTimeout(resolve, 80));
  check('les modérateurs ont leur rubrique : /moderateurs', window.location.pathname === '/moderateurs' && /Modo Karim/.test($('#mod-cards').textContent), window.location.pathname);
  check('avec leur état (en ligne) et ce qui attend', /en ligne/.test($('#mod-cards').textContent) && /7/.test($('#mod-due').textContent), null);
  check('« Désigner un modérateur » est réservé aux administrateurs', $('#mod-designate').closest('.admin-only') !== null, null);
  // Demander au modérateur : accepter les adhésions, pré-approuver.
  const actionsText = $('#member-actions').textContent;
  check('les deux actions sont proposées avec leur nombre', /Accepter les adhésions en attente \(3\)/.test(actionsText) && /Pré-approuver nos profils membres \(8\)/.test(actionsText), actionsText);
  check('et dit ce qui est impossible (compte Facebook inconnu)', /2 impossible\(s\) : compte Facebook inconnu/.test(actionsText), actionsText);
  $('[data-member-request="preapprove"]').click();
  await new Promise((resolve) => setTimeout(resolve, 60));
  check('« Pré-approuver nos profils membres » le demande au modérateur', modCalls.some((c) => c.startsWith('POST /moderators/members') && c.includes('"kind":"preapprove"')), modCalls);
  check('le résultat nomme les profils bloqués', /Nadia/.test($('#member-result').textContent) && /6 pré-approbation/.test($('#member-result').textContent), $('#member-result').textContent);
  // Contrôle de la pré-approbation : déjà faite ou pas, avec ce qui a été vu.
  const auditText = $('#audit-rows').textContent;
  check('les constats disent « déjà faite » / « pas faite », avec ce que le modérateur a vu', /déjà faite/.test(auditText) && /pas faite/.test(auditText) && /Retirer la pré-approbation/.test(auditText) && /en attente/.test(auditText), auditText.slice(0, 200));
  check('le bilan des contrôles est affiché', /Déjà faite\s*1/.test($('#audit-summary').textContent.replace(/\s+/g, ' ')), $('#audit-summary').textContent);
  $('#audit-filter').value = 'NOT_PREAPPROVED';
  $('#audit-filter').dispatchEvent(new window.Event('change'));
  check('on filtre ce qui n’est pas fait', /Nadia/.test($('#audit-rows').textContent) && !/Salim/.test($('#audit-rows').textContent), $('#audit-rows').textContent);
  $('[data-audit="check"]').click();
  await new Promise((resolve) => setTimeout(resolve, 60));
  check('« Contrôler tout (sans rien modifier) » demande un contrôle en mode check', modCalls.some((c) => c.startsWith('POST /moderators/audit') && c.includes('"mode":"check"')), modCalls);
  $('#mod-cards [data-goto="/moderateurs/mod-000001"]').click();
  await new Promise((resolve) => setTimeout(resolve, 80));
  check('chaque modérateur a sa page', window.location.pathname === '/moderateurs/mod-000001' && $('#moderator-page').classList.contains('active'), window.location.pathname);
  check('avec ses chiffres : aujourd’hui, 7 j, 30 j, total', /Publications vérifiées\s*3\s*20\s*50\s*120/.test($('#md-counts').textContent.replace(/\s+/g, ' ')), $('#md-counts').textContent.slice(0, 120));
  check('et ses dernières actions, avec le lien du post', !!$('#md-recent a[href="https://www.facebook.com/groups/1/posts/9"]'), null);
  $('[data-mod-act="run"]').click();
  await new Promise((resolve) => setTimeout(resolve, 60));
  check('l’admin lance la vérification des POSTS', modCalls.some((c) => c.startsWith('POST /moderators/mod-000001/run') && c.includes('"kind":"posts"')), modCalls);
  $('[data-mod-act="run-members"]').click();
  await new Promise((resolve) => setTimeout(resolve, 60));
  check('… et, séparément, les tâches « nos profils »', modCalls.some((c) => c.startsWith('POST /moderators/mod-000001/run') && c.includes('"kind":"members"')), modCalls);
  check('chiffres et historiques séparés : posts / profils', /Adhésions acceptées/.test($('#md-counts-members').textContent) && !/Adhésions acceptées/.test($('#md-counts').textContent), null);
  $('[data-mod-act="pause"]').click();
  await new Promise((resolve) => setTimeout(resolve, 60));
  check('l’admin suspend le modérateur', modCalls.some((c) => c.includes('/settings') && c.includes('"paused":true')), modCalls);
  $('#md-settings').elements.batchSize.value = '8';
  $('#md-settings').dispatchEvent(new window.Event('submit', { cancelable: true }));
  await new Promise((resolve) => setTimeout(resolve, 60));
  check('et règle ses lots', modCalls.some((c) => c.includes('/settings') && c.includes('"batchSize":8')), modCalls);
  check('la page n’est pas en lecture seule pour un admin', $('#md-lock').hidden === true, null);
  window.fetch = beforeMods;

  // ─── Pré-approbations ──────────────────────────────────────────
  const paCalls = [];
  const beforePa = window.fetch;
  window.fetch = async (url, options = {}) => {
    const full = String(url).replace('/api', '');
    const path = full.split('?')[0];
    if (path === '/moderators/preapprovals') {
      paCalls.push(full);
      return { ok: true, status: 200, json: async () => ({
        state: 'todo', total: 3,
        counts: { todo: 3, requested: 1, failed: 1, done: 9, blocked: 2 },
        profiles: [
          { id: 'p-new', name: 'Lina', createdAt: '2026-10-03T08:00:00Z', facebookKnown: true, todo: 2 },
          { id: 'p-old', name: 'Salim', createdAt: '2026-09-01T08:00:00Z', facebookKnown: true, todo: 1 },
        ],
        rows: [
          { linkId: 'l1', profile: { id: 'p-new', name: 'Lina', createdAt: '2026-10-03T08:00:00Z', facebookKnown: true }, group: { id: 'g1', name: 'Recettes FR', url: 'https://facebook.com/groups/1', category: { id: 'c1', name: 'Recettes' } }, state: 'todo' },
          { linkId: 'l2', profile: { id: 'p-new', name: 'Lina', createdAt: '2026-10-03T08:00:00Z', facebookKnown: true }, group: { id: 'g2', name: 'Cuisine MA', url: null, category: null }, state: 'failed', error: 'option introuvable', errorAt: '2026-10-03T09:00:00Z', attempts: 2 },
          { linkId: 'l3', profile: { id: 'p-old', name: 'Salim', createdAt: '2026-09-01T08:00:00Z', facebookKnown: true }, group: { id: 'g3', name: 'Desserts', url: null, category: null }, state: 'todo' },
        ],
      }) };
    }
    if (path === '/moderators/members/manual') {
      paCalls.push(`POST ${path} ${options.body}`);
      return { ok: true, status: 200, json: async () => ({ updated: 1, state: 'preapproved' }) };
    }
    if (path === '/moderators/members') {
      paCalls.push(`POST ${path} ${options.body}`);
      return { ok: true, status: 200, json: async () => ({ kind: 'preapprove', requested: 2, moderators: 1, moderatorsTotal: 1, blocked: { noFacebookId: 0, profiles: [] } }) };
    }
    return beforePa(url, options);
  };
  $('.nav[data-view="preapprovals"]').click();
  await new Promise((resolve) => setTimeout(resolve, 80));
  check('« Pré-approbations » a sa page : /pre-approbations', window.location.pathname === '/pre-approbations' && $('#preapprovals').classList.contains('active'), window.location.pathname);
  check('par défaut : ce qui reste à pré-approuver', paCalls[0].includes('state=todo'), paCalls);
  const paText = $('#pa-rows').textContent;
  check('les profils les plus récents d’abord, groupés par profil', paText.indexOf('Lina') < paText.indexOf('Salim') && $('#pa-rows').querySelectorAll('tr.pa-profile').length === 2, paText.slice(0, 120));
  check('chaque état est compté dans les onglets', /En échec\s*1/.test($('#pa-states').textContent.replace(/\s+/g, ' ')), $('#pa-states').textContent);
  check('le filtre profil propose les profils récents d’abord, avec ce qui reste', /Lina — ajouté le 03\/10\/26 · 2 à faire/.test($('#pa-profile').textContent), $('#pa-profile').textContent);
  $('[data-pa-profile="p-new"]').checked = true;
  $('[data-pa-profile="p-new"]').dispatchEvent(new window.Event('change', { bubbles: true }));
  check('cocher un profil coche tous ses groupes', /2 sélectionné/.test($('#pa-selected').textContent), $('#pa-selected').textContent);
  $('#pa-go').click();
  await new Promise((resolve) => setTimeout(resolve, 80));
  const paAsked = paCalls.find((c) => c.startsWith('POST /moderators/members'));
  check('« Pré-approuver la sélection » envoie exactement ces liaisons', !!paAsked && paAsked.includes('"profileGroupIds":["l1","l2"]') && paAsked.includes('"kind":"preapprove"'), paAsked);
  $('[data-pa-manual="l3"]').click();
  await new Promise((resolve) => setTimeout(resolve, 80));
  const manual = paCalls.find((c) => c.startsWith('POST /moderators/members/manual'));
  check('« Fait à la main » marque cette ligne pré-approuvée (fait sur Facebook par l’admin)', !!manual && manual.includes('"profileGroupIds":["l3"]') && manual.includes('"state":"preapproved"'), manual);
  $('#pa-profile').value = 'p-old';
  $('#pa-profile').dispatchEvent(new window.Event('change'));
  await new Promise((resolve) => setTimeout(resolve, 60));
  check('filtrer par profil', paCalls.at(-1).includes('profileId=p-old'), paCalls.at(-1));
  $('[data-pa-state="done"]').click();
  await new Promise((resolve) => setTimeout(resolve, 60));
  check('filtrer par état (déjà pré-approuvé)', paCalls.at(-1).includes('state=done'), paCalls.at(-1));
  window.fetch = beforePa;

  // ─── Extensions : téléchargement et historique ───────────────────
  const extCalls = [];
  const beforeExt = window.fetch;
  const rel = (v, extra = {}) => ({ id: v, version: v, sha256: 'abcdef0123456789', size: 50000, fileCount: 12, notes: null, pinned: false, createdAt: '2026-10-03T10:00:00Z', ...extra });
  window.fetch = async (url, options = {}) => {
    const full = String(url).replace('/api', '');
    const path = full.split('?')[0];
    if (path === '/extensions') {
      const releases = [rel('1.9.0'), rel('1.8.0')];
      return { ok: true, status: 200, json: async () => ([
        { key: 'moderateur', name: 'Modérateur · PostFlow', letter: 'M', color: '#7c3aed', role: 'Vérifie', installOn: 'Le profil modérateur', preconfigurable: true, pinned: false, current: releases[0], releases },
        { key: 'adhesion', name: 'Adhésion aux groupes · PostFlow', letter: 'A', color: '#17803d', role: 'Rejoint', installOn: 'Les profils', preconfigurable: true, nstKey: 'required', nstKeyWhy: 'L’extension ne détectera pas le profil NSTBrowser.', pinned: false, current: rel('1.5.0'), releases: [rel('1.5.0')] },
      ]) };
    }
    if (path.startsWith('/extensions/')) {
      extCalls.push(`${options.method || 'GET'} ${full} ${options.body || ''}`);
      if (path.endsWith('/download')) return { ok: true, status: 200, headers: { get: () => 'attachment; filename="moderateur-1.9.0-preconfiguree.zip"' }, blob: async () => new window.Blob(['PK']) };
      return { ok: true, status: 200, json: async () => ({}) };
    }
    return beforeExt(url, options);
  };
  window.URL.createObjectURL = () => 'blob:x';
  window.URL.revokeObjectURL = () => {};
  $('.nav[data-view="extensions"]').click();
  await new Promise((resolve) => setTimeout(resolve, 80));
  check('les extensions ont leur page : /extensions', window.location.pathname === '/extensions' && /Modérateur · PostFlow/.test($('#ext-cards').textContent), window.location.pathname);
  check('dans le menu « Suivi & réglages »', $('.nav[data-view="extensions"]').closest('.nav-group').dataset.group === 'admin', null);
  check('la release actuelle en haut, les anciennes versions dans les archives', /Release actuelle/.test($('.ext-current').textContent) && /1\.9\.0/.test($('.ext-current').textContent) && $$q('.ext-table tbody tr').length === 1 && /Archives · 1/.test($('.ext-history summary').textContent), null);
  $('.ext-actions [data-preset="1"]').click();
  await new Promise((resolve) => setTimeout(resolve, 60));
  check('« Télécharger (préconfigurée) » demande la version avec la clé du compte', extCalls.some((c) => c.startsWith('GET /extensions/moderateur/1.9.0/download?preset=1')), extCalls);
  $('[data-ext-pin="moderateur"][data-version="1.8.0"]').click();
  await new Promise((resolve) => setTimeout(resolve, 60));
  // Avant le téléchargement : ce qui ne marchera pas à l'installation.
  let shown = '';
  const confirmBefore = window.confirm;
  window.confirm = (text) => { shown += text + '\n'; return true; };
  const before = extCalls.length;
  $('[data-ext-download="adhesion"][data-preset="1"]').click();
  await new Promise((resolve) => setTimeout(resolve, 80));
  check('sans clé NSTBrowser sur le compte : prévenu avant de télécharger Adhésion', /clé NSTBrowser/.test(shown) && /ne détectera pas le profil/.test(shown), shown);
  check('et invité à l’ajouter (pas de téléchargement)', $('#nst-modal').open && extCalls.length === before, extCalls.slice(before));
  $('#nst-modal').close();
  shown = '';
  $('[data-ext-download="moderateur"][data-preset=""]').click();
  await new Promise((resolve) => setTimeout(resolve, 80));
  check('« Sans clé » : prévenu que l’extension ne pourra pas se connecter', /ne pourra pas se connecter/.test(shown), shown);
  check('le bouton principal propose la préconfigurée (puis rappelle de ne pas la partager)', /contient vos clés/.test(shown) && extCalls.some((c) => c.includes('/moderateur/1.9.0/download?preset=1')), shown);
  check('la fenêtre est celle de la plateforme, pas une alerte du navigateur', $('#pf-dialog').classList.contains('tone-warn') || /pf-dialog/.test($('#pf-dialog').className), $('#pf-dialog').className);
  window.confirm = confirmBefore;
  check('« ↩︎ » revient à une ancienne version (admin)', extCalls.some((c) => c.startsWith('POST /extensions/moderateur/pin') && c.includes('"version":"1.8.0"')), extCalls);
  window.fetch = beforeExt;

  // ─── Duplication des contenus ──────────────────────────────────
  const repCalls = [];
  const beforeRep = window.fetch;
  window.fetch = async (url, options = {}) => {
    const full = String(url).replace('/api', '');
    const path = full.split('?')[0];
    if ((path === '/settings' && options.method === 'PATCH') || path === '/posts/bulk-repeat') {
      repCalls.push(`${options.method || 'GET'} ${path} ${options.body || ''}`);
      const body = JSON.parse(options.body || '{}');
      return { ok: true, status: 200, json: async () => (path === '/settings' ? { publishingEnabled: true, ...body } : { updated: 1 }) };
    }
    return beforeRep(url, options);
  };
  $('[data-posts-tab="repeat"]').click();
  await new Promise((resolve) => setTimeout(resolve, 40));
  check('la duplication a son onglet : /posts/duplication', window.location.pathname === '/posts/duplication' && !$('#posts-repeat').classList.contains('hidden'), window.location.pathname);
  check('par défaut : une seule publication par groupe', /Une seule publication/.test($('#repeat-summary').textContent) && $('#repeat-form').elements.times.value === '1', $('#repeat-summary').textContent);
  $('[data-repeat-preset="3,72"]').click();
  check('« 3 fois en une semaine » se lit en clair', /3 publications .* tous les 3 jours .* 6 jours après/.test($('#repeat-summary').textContent), $('#repeat-summary').textContent);
  $('#repeat-form').dispatchEvent(new window.Event('submit', { cancelable: true }));
  await new Promise((resolve) => setTimeout(resolve, 40));
  check('enregistrer envoie N fois et l’écart en heures', repCalls.some((c) => c.startsWith('PATCH /settings') && c.includes('"repeatTimes":3') && c.includes('"repeatEveryHours":72')), repCalls);
  const postForm = $('#post-form');
  postForm.elements.repeatTimes.value = '';
  postForm.elements.repeatEveryDays.value = '';
  postForm.elements.repeatTimes.dispatchEvent(new window.Event('input', { bubbles: true }));
  check('le post sans règle suit le réglage global', /global/.test($('#post-repeat-help').textContent) && /3 publications/.test($('#post-repeat-help').textContent), $('#post-repeat-help').textContent);
  window.fetch = beforeRep;

  // ─── Filtres du Pilotage ───────────────────────────────────────
  const now = new Date().toISOString();
  const runner = (over) => ({ profileId: over.name, externalId: `ext-${over.name}`, status: 'ACTIVE', mode: 'AUTO', shouldRun: false, reason: 'hors fenêtre',
    window: '09:00–18:00', timezone: 'Europe/Paris', atWork: false, running: false, pairedAt: now, browserState: 'STOPPED',
    published: 0, failed: 0, links: 0, lastSeenAt: now, browserSeenAt: now, ...over });
  const patched = [];
  const memberCalls = [];
  const beforeRunners = window.fetch;
  window.fetch = async (url, options = {}) => {
    const path = String(url).replace('/api', '');
    if (path === '/runners') {
      return { ok: true, status: 200, json: async () => ({ publishingEnabled: true, profiles: [
        runner({ name: 'Salim', shouldRun: true, atWork: true, running: true, browserState: 'RUNNING', facebookUserId: '100011', facebookName: 'Salim B.' }),
        runner({ name: 'Nadia', shouldRun: true }),
        runner({ name: 'Omar', mode: 'OFF', pairedAt: null }),
        runner({ name: 'Yasmine', browserState: 'ERROR' }),
        runner({ name: 'Désactivée', status: 'INACTIVE', mode: 'OFF' }),
      ] }) };
    }
    if (path === '/admin/verify') {
      return { ok: true, status: 200, json: async () => ({ due: 0, verified: 0, republished: 0, review: [], members: {
        due: 3, approved: 2, preApproved: 5, unknownIdentity: 3,
        problems: [{ taskId: 'pg-x', kind: 'preapprove', error: 'le vérificateur n’a pas cette option : il doit y être administrateur ou modérateur', at: '2026-10-03T08:00:00Z', attempts: 6, gaveUp: true, profile: { id: 'Nadia', name: 'Nadia' }, group: { id: 'g1', name: 'Recettes FR', url: 'https://facebook.com/groups/1' } }],
      } }) };
    }
    if (path === '/admin/verify/members/pg-x/retry') {
      memberCalls.push(path);
      return { ok: true, status: 200, json: async () => ({ result: 'queued' }) };
    }
    if (path.startsWith('/runners/') && options.method === 'PATCH') {
      patched.push(path);
      return { ok: true, status: 200, json: async () => ({ run: false, reason: 'ok' }) };
    }
    return beforeRunners(url, options);
  };
  window.eval(`view('runners')`);
  await new Promise((resolve) => setTimeout(resolve, 50));
  const runnerNames = () => [...window.document.querySelectorAll('#runner-rows tr td:first-child strong')].map((el) => el.textContent);
  check('le Pilotage liste les profils actifs, pas les désactivés', runnerNames().length === 4 && !runnerNames().includes('Désactivée'), runnerNames());
  check('il dit combien de désactivés sont masqués', /1 désactivé\(s\) masqué\(s\)/.test($('#runner-count').textContent), $('#runner-count').textContent);
  $('[data-runner-inactive]').click();
  check('un clic les montre (pour en réactiver un)', runnerNames().join() === 'Désactivée' && $('#runner-state-filter').value === 'inactive', runnerNames());
  $('#runner-filters-reset').click();
  check('effacer le filtre les masque de nouveau', runnerNames().length === 4, runnerNames());
  const fbRows = $('#runner-rows').textContent;
  check('l’identifiant Facebook d’un profil est affiché', /Facebook 100011/.test(fbRows), fbRows);
  check('un profil sans compte Facebook connu est signalé', /compte Facebook inconnu/.test(fbRows), null);
  check('le suivi des adhésions et pré-approbations est visible', !$('#members-panel').hidden && /5 pré-approuvé/.test($('#members-summary').textContent), $('#members-summary').textContent);
  check('avec ce qui a échoué et pourquoi', /administrateur ou modérateur/.test($('#members-problems').textContent), null);
  $('[data-member-retry="pg-x"]').click();
  await new Promise((resolve) => setTimeout(resolve, 50));
  check('« Relancer » remet la tâche en route', memberCalls.includes('/admin/verify/members/pg-x/retry'), memberCalls);
  check('le compteur signale les profils à vérifier', /2 à vérifier/.test($('#runner-count').textContent), $('#runner-count').textContent);
  // ─── Pilotage organisé : filtres rapides, sous-onglets, menu « ⋯ » ──
  check('les filtres rapides comptent chaque état', /À vérifier\s*2/.test($('#pil-quick').textContent.replace(/\s+/g, ' ')), $('#pil-quick').textContent);
  $('[data-pil-quick="off"]').click();
  check('« Arrêtés » filtre d’un clic', $('#runner-mode-filter').value === 'OFF' && /Omar/.test($('#runner-rows').textContent) && !/Salim/.test($('#runner-rows').textContent), $('#runner-rows').textContent.slice(0, 80));
  $('[data-pil-quick="all"]').click();
  check('« Tous » efface le filtre', /Salim/.test($('#runner-rows').textContent), null);
  check('les actions secondaires sont dans « ⋯ » (appairer, identifiant Facebook)', !!$('#runner-rows .row-menu [data-runner-pair]') && !!$('#runner-rows .row-menu [data-fb-id]'), null);
  $('[data-pil-tab="objective"]').click();
  check('« Objectif du jour » a son adresse', window.location.pathname === '/pilotage/objectif' && !$('#pil-objective').classList.contains('hidden') && $('#pil-profiles').classList.contains('hidden'), window.location.pathname);
  $('[data-pil-tab="members"]').click();
  check('« Nos profils dans les groupes » a son adresse', window.location.pathname === '/pilotage/adhesions' && !$('#pil-members').classList.contains('hidden'), window.location.pathname);
  $('[data-pil-tab="profiles"]').click();
  check('retour aux profils : /pilotage', window.location.pathname === '/pilotage', window.location.pathname);
  // ─── Menu groupé par tâche ─────────────────────────────────────────
  check('le menu est groupé par tâche', [...window.document.querySelectorAll('.nav-group .nav-head')].map((h) => h.textContent.replace('▾', '').trim()).join('|') === 'Publication|Profils Facebook|Modération|Suivi & réglages', null);
  check('la section de la rubrique ouverte est dépliée', !$('.nav[data-view="runners"]').closest('.nav-group').classList.contains('collapsed'), null);
  $('.nav-group[data-group="moderation"] .nav-head').click();
  check('une section se replie d’un clic', $('.nav-group[data-group="moderation"]').classList.contains('collapsed'), null);
  $('.nav-group[data-group="moderation"] .nav-head').click();
  check('et se déplie', !$('.nav-group[data-group="moderation"]').classList.contains('collapsed'), null);
  $('#runner-search').value = 'nad';
  $('#runner-search').dispatchEvent(new window.Event('input'));
  check('la recherche filtre par nom', runnerNames().join() === 'Nadia', runnerNames());
  $('#runner-filters-reset').click();
  $('#runner-mode-filter').value = 'OFF';
  $('#runner-mode-filter').dispatchEvent(new window.Event('change'));
  check('le filtre de mode', runnerNames().join() === 'Omar', runnerNames());
  $('#runner-filters-reset').click();
  $('[data-runner-check]').click();
  check('« à vérifier » : doit publier sans travailler, ou navigateur en erreur', runnerNames().sort().join() === 'Nadia,Yasmine', runnerNames());
  check('les boutons de masse ne visent que les profils affichés', $('#runners-all-off').textContent === 'Arrêter (2)', $('#runners-all-off').textContent);
  $('#runners-all-off').click();
  await new Promise((resolve) => setTimeout(resolve, 50));
  check('« Arrêter » ne touche que ces profils-là', patched.sort().join() === '/runners/Nadia,/runners/Yasmine', patched);
  $('#runner-filters-reset').click();
  check('sans filtre, les boutons retrouvent leur sens global', $('#runners-all-off').textContent === 'Tout arrêter', $('#runners-all-off').textContent);
  window.fetch = beforeRunners;

  // ─── L'état réel des appairages ────────────────────────────────
  const pairingCalls = [];
  const beforePairing = window.fetch;
  window.fetch = async (url, options = {}) => {
    const path = String(url).replace('/api', '');
    if (path === '/runners') {
      return { ok: true, status: 200, json: async () => ({ publishingEnabled: true, profiles: [
        runner({ name: 'Salim', pairing: { state: 'confirmed', detail: 'Confirmé par un battement récent', broken: false } }),
        runner({ name: 'Nadia', pairing: { state: 'key_changed', detail: 'La clé du compte a changé depuis l’appairage : ré-appairer', broken: true } }),
        runner({ name: 'Omar', pairing: { state: 'unconfirmed', detail: 'Appairé, mais aucun battement depuis', broken: false } }),
      ] }) };
    }
    if (path === '/runners/pairing-check') {
      pairingCalls.push(options.method);
      return { ok: true, status: 200, json: async () => ({
        checked: 3, byState: { confirmed: 1, key_changed: 1, unconfirmed: 1 },
        broken: [{ name: 'Nadia', state: 'key_changed', detail: 'La clé du compte a changé depuis l’appairage : ré-appairer', broken: true }],
        unconfirmed: [{ name: 'Omar', state: 'unconfirmed' }],
      }) };
    }
    return beforePairing(url, options);
  };
  window.eval(`loadRunners()`);
  await new Promise((resolve) => setTimeout(resolve, 50));
  const rowsText = $('#runner-rows').textContent;
  check('un appairage cassé s’affiche « à ré-appairer », pas « appairé »', /à ré-appairer/.test(rowsText) && /La clé du compte a changé/.test(rowsText), rowsText);
  check('un appairage non confirmé est distingué', /non confirmé/.test(rowsText), null);
  check('un appairage confirmé porte sa coche', /appairé ✓/.test(rowsText), null);
  check('un appairage cassé compte « à vérifier »', /1 à vérifier/.test($('#runner-count').textContent), $('#runner-count').textContent);
  $('#runners-pairing-check').click();
  await new Promise((resolve) => setTimeout(resolve, 50));
  check('« Vérifier les appairages » interroge l’API', pairingCalls[0] === 'POST', pairingCalls);
  check('le résultat dit ce qui est à refaire, et pourquoi', !$('#pairing-report').hidden && /1 à refaire/.test($('#pairing-report').textContent) && /Nadia/.test($('#pairing-report').textContent), $('#pairing-report').textContent);
  check('puis ne montre que les appairages à refaire', [...window.document.querySelectorAll('#runner-rows tr td:first-child strong')].map((el) => el.textContent).join() === 'Nadia', null);
  $('#runner-filters-reset').click();
  window.fetch = beforePairing;

  // ─── Compteurs du menu, groupes, profils, objectif, remise à zéro ──
  const extraCalls = [];
  const resetBodies = [];
  const beforeExtra = window.fetch;
  window.fetch = async (url, options = {}) => {
    const path = String(url).replace('/api', '').split('?')[0];
    extraCalls.push(`${options.method || 'GET'} ${path}`);
    if (path === '/insights/counters') {
      return { ok: true, status: 200, json: async () => ({ profiles: 18, groups: 11, categories: 3, sites: 4, sitesAlert: 1, articles: 42, posts: 58, postsFailed: 2, logErrors: 3, users: 2, publishedToday: 86, dailyTarget: 200 }) };
    }
    if (path === '/insights/objective') {
      return { ok: true, status: 200, json: async () => ({
        settings: { dailyTarget: 200, objectiveStart: 480, objectiveEnd: 1320, objectiveTimezone: 'Europe/Paris' },
        serverTime: '2026-09-30T13:00:00Z',
        pace: { status: 'late', target: 200, published: 86, expected: 102, delta: -16, remaining: 114, minutesLeft: 420, ratePerHour: 14, neededPerHour: 17, projection: 184 },
        hourly: Array.from({ length: 24 }, (_, h) => (h === 10 ? 12 : 0)),
        stock: { publishable: 58, blocked: 25, deficit: 56 }, articles: { today: 3, needed: 12, postsPerArticle: 4.7 },
        profiles: { participating: 2, atWork: 1, share: 100, rows: [{ id: 'a', name: 'Salim', mode: 'AUTO', joinedGroups: 2, publishedToday: 60, share: 100, atWork: true, participating: true }] },
        categories: [{ id: 'c1', name: 'Recettes', groups: 3, publishableGroups: 2, publishedToday: 86, stock: 83, stockPublishable: 58, articlesNeeded: 28 }],
        groups: [{ id: 'g3', name: 'Groupe vide', category: { name: 'Recettes' }, publishedToday: 0, stock: 25, participants: [], blocked: 'no_profile' }],
        advice: [{ level: 'error', text: 'Stock insuffisant : il manque 56 post(s), soit environ 12 article(s) à importer.' }],
      }) };
    }
    if (path === '/admin/reset') {
      const body = JSON.parse(options.body || '{}');
      resetBodies.push(body);
      const plan = {
        posts: body.posts ? 143 : body.articlePosts === 'delete' ? 98 : 0,
        articles: body.articles ? 42 : 0,
        postsDetached: body.articles && !body.posts && body.articlePosts === 'keep' ? 98 : 0,
        articlesUnarchived: body.posts && !body.articles && body.unarchive ? 12 : 0,
      };
      if (body.dryRun) return { ok: true, status: 200, json: async () => ({ dryRun: true, posts: 143, postsFromArticles: 98, standalonePosts: 45, articles: 42, archivedArticles: 12, jobs: 64, published: 211, activeJobs: 0, plan }) };
      return { ok: true, status: 200, json: async () => ({ dryRun: false, deleted: plan }) };
    }
    if (path === '/settings') {
      if (options.method === 'PATCH') objectiveBody = JSON.parse(options.body || '{}');
      return { ok: true, status: 200, json: async () => ({}) };
    }
    return beforeExtra(url, options);
  };
  let objectiveBody = null;
  window.eval(`loadCounters()`);
  await new Promise((resolve) => setTimeout(resolve, 50));
  const badge = (v) => window.document.querySelector(`.nav[data-view="${v}"] .nav-count`);
  check('le menu montre le nombre de posts en attente et d’échecs', badge('posts')?.textContent === '58 · 2✕' && badge('posts').classList.contains('alert'), badge('posts')?.textContent);
  check('le menu montre le nombre d’articles', badge('articles')?.textContent === '42', badge('articles')?.textContent);
  check('le Pilotage affiche publiés / objectif', badge('runners')?.textContent === '86/200', badge('runners')?.textContent);
  check('les sites non prêts sont signalés', badge('sites')?.textContent === '1/4' && badge('sites').classList.contains('alert'), badge('sites')?.textContent);

  window.eval(`view('runners')`);
  await new Promise((resolve) => setTimeout(resolve, 80));
  check('l’objectif du jour s’affiche', /86 \/ 200 publications/.test($('#obj-title').textContent), $('#obj-title').textContent);
  check('il dit si l’on est en retard, et de combien', /En retard/.test($('#obj-status').textContent) && /102 \(-16\)/.test($('#obj-status').textContent), $('#obj-status').textContent);
  check('il chiffre les articles à importer', /12/.test($('#obj-kpis').textContent) && /articles à importer/.test($('#obj-kpis').textContent), null);
  check('il signale un groupe bloqué', /aucun profil/.test($('#obj-groups').textContent), null);
  check('le graphique a une barre par heure', window.document.querySelectorAll('#obj-chart .bar-col').length === 24, null);
  const of = $('#objective-form');
  of.elements.dailyTarget.value = '250';
  of.elements.objectiveStart.value = '09:00';
  of.elements.objectiveEnd.value = '21:30';
  check('le fuseau de la plage est affiché (Paris par défaut), avec l’heure qu’il y est', of.elements.objectiveTimezone.value === 'Europe/Paris' && /il y est \d\d:\d\d/.test($('#objective-tz-now').textContent), [of.elements.objectiveTimezone.value, $('#objective-tz-now').textContent]);
  of.elements.objectiveTimezone.value = 'Africa/Casablanca';
  of.dispatchEvent(new window.Event('submit', { cancelable: true }));
  await new Promise((resolve) => setTimeout(resolve, 50));
  check('régler l’objectif l’enregistre', extraCalls.includes('PATCH /settings'), extraCalls.slice(-5));
  check('avec le pays choisi pour la plage horaire', objectiveBody && objectiveBody.objectiveTimezone === 'Africa/Casablanca', objectiveBody);

  window.eval(`view('settings')`);
  await new Promise((resolve) => setTimeout(resolve, 50));
  check('la zone dangereuse compte avant d’effacer', /143/.test($('#reset-counts').textContent) && /42/.test($('#reset-counts').textContent), $('#reset-counts').textContent);
  $('#reset-open').click();
  await new Promise((resolve) => setTimeout(resolve, 50));
  const rf = $('#reset-form').elements;
  const tick = async (el, value = true) => {
    if (el.type === 'radio') el.checked = true; else el.checked = value;
    el.dispatchEvent(new window.Event('change', { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 50));
  };
  check('rien n’est coché d’office, le bouton attend un choix', $('#reset-modal').open && !rf.posts.checked && !rf.articles.checked && $('#reset-submit').disabled, null);
  // Les articles seulement : la question sur leurs posts apparaît.
  await tick(rf.articles);
  check('articles seuls : il demande quoi faire de leurs posts', !$('#reset-article-posts').hidden && /98 post\(s\) viennent de ces articles/.test($('#reset-article-posts').textContent) && $('#reset-submit').disabled, null);
  await tick(window.document.querySelector('#reset-form input[name="articlePosts"][value="keep"]'));
  check('« les garder » : aucun post supprimé, 98 gardés sans article', /98<\/b> post\(s\) gardé/.test($('#reset-summary').innerHTML) && /Aucun post supprimé/.test($('#reset-summary').textContent) && !$('#reset-submit').disabled, $('#reset-summary').textContent);
  rf.confirm.value = 'EFFACER';
  $('#reset-form').dispatchEvent(new window.Event('submit', { cancelable: true }));
  await new Promise((resolve) => setTimeout(resolve, 80));
  const sent = resetBodies.filter((b) => !b.dryRun).pop();
  check('il envoie exactement ce choix', sent.articles === true && sent.posts === false && sent.articlePosts === 'keep' && sent.confirm === 'EFFACER', sent);
  check('puis dit ce qui a été fait', /42 article\(s\) supprimé\(s\) · 98 post\(s\) gardé\(s\) sans article/.test($('#notice').textContent), $('#notice').textContent);
  // Les posts seulement : on propose de désarchiver les articles.
  $('#reset-open').click();
  await new Promise((resolve) => setTimeout(resolve, 80));
  await tick(rf.posts);
  check('posts seuls : pas de question sur les articles, mais le désarchivage proposé', $('#reset-article-posts').hidden && !$('#reset-unarchive-row').hidden, null);
  check('posts seuls : les articles restent', /143<\/b> post\(s\) supprimé/.test($('#reset-summary').innerHTML) && /Les articles restent/.test($('#reset-summary').textContent), $('#reset-summary').textContent);
  $('#reset-modal').close();
  window.fetch = beforeExtra;

  // ─── Groupes : corriger une adhésion à la main ─────────────────
  const joinCalls = [];
  const beforeJoin = window.fetch;
  window.fetch = async (url, options = {}) => {
    const path = String(url).replace('/api', '').split('?')[0];
    if (path === '/groups') {
      return { ok: true, status: 200, json: async () => ({ data: [{ id: 'g9', name: 'Garden', externalId: 'garden', url: 'https://fb/g9', status: 'ACTIVE', category: { name: 'Garden' },
        profiles: [
          { profileId: 'p1', status: 'ACTIVE', joinStatus: 'JOINED', profile: { name: 'Nihad' } },
          { profileId: 'p2', status: 'ACTIVE', joinStatus: 'REQUESTED', profile: { name: 'Hafsa' } },
        ], _count: { targets: 0 }, availablePosts: 0 }], meta: { page: 1, limit: 12, total: 1, pages: 1 } }) };
    }
    if (path.includes('/join-status')) {
      joinCalls.push(`${options.method} ${path} ${options.body}`);
      return { ok: true, status: 200, json: async () => ({ joinStatus: 'JOINED' }) };
    }
    return beforeJoin(url, options);
  };
  window.eval(`load()`);
  await new Promise((resolve) => setTimeout(resolve, 120));
  const groupCell = $('#group-rows').textContent;
  check('le groupe résume ses adhésions', /1 rejoint/.test(groupCell) && /1 demande envoyée/.test(groupCell), groupCell);
  check('un profil rejoint n’a pas de bouton, une demande en attente si', !$('[data-mark-joined="p1"]') && !!$('[data-mark-joined="p2"]'), null);
  $('[data-mark-joined="p2"]').click();
  await new Promise((resolve) => setTimeout(resolve, 50));
  check('« ✓ rejoint » corrige l’adhésion', joinCalls[0] === 'PATCH /groups/g9/profiles/p2/join-status {"joinStatus":"JOINED"}', joinCalls);
  window.fetch = beforeJoin;

  check('la fenêtre d’appairage a les marges des autres', !!$('#pair-modal > .modal-body'), null);

  const rows = $('#user-rows').textContent;
  check('les comptes sont listés', rows.includes('admin') && rows.includes('sofia'), rows.slice(0, 80));
  check('aucune clé n’apparaît dans la liste', !/[0-9a-f]{64}/.test($('#user-rows').innerHTML), null);
  check('on ne peut pas se supprimer soi-même', !$('#user-rows').innerHTML.includes('data-delete-user="boss"'), null);
  check('mais on peut supprimer un autre compte', $('#user-rows').innerHTML.includes('data-delete-user="u2"'), null);

  check('les sites offrent le partage', $('#site-rows').innerHTML.includes('data-share-site="s1"'), null);

  // ─── Une adresse par rubrique, une session sans jeton ──────────────
  check('aucun jeton gardé dans le navigateur', window.localStorage.getItem('postflow_token') === null, null);
  const routeCalls = [];
  const beforeRoutes = window.fetch;
  window.fetch = async (url, options = {}) => {
    routeCalls.push(options);
    return beforeRoutes(url, options);
  };
  $('.nav[data-view="runners"]').click();
  await new Promise((resolve) => setTimeout(resolve, 30));
  check('Pilotage a son adresse : /pilotage', window.location.pathname === '/pilotage', window.location.pathname);
  check('le titre de l’onglet suit la rubrique', /Pilotage/.test(window.document.title), window.document.title);
  check('les appels passent par le cookie, sans jeton', routeCalls.length > 0 && routeCalls.every((o) => o.credentials === 'same-origin' && !(o.headers || {}).Authorization), routeCalls[0]);
  check('et portent l’en-tête anti-CSRF', routeCalls.every((o) => (o.headers || {})['X-Requested-With'] === 'PostFlow'), routeCalls[0]?.headers);
  window.eval(`showPostsTab('all')`);
  check('Posts › tous : /posts/tous', window.location.pathname === '/posts/tous', window.location.pathname);
  $('.nav[data-view="articles"]').click();
  check('Articles : /articles', window.location.pathname === '/articles', window.location.pathname);
  window.history.pushState({}, '', '/journaux');
  window.dispatchEvent(new window.PopStateEvent('popstate'));
  await new Promise((resolve) => setTimeout(resolve, 30));
  check('une adresse ouvre sa rubrique (Précédent/Suivant, lien partagé)', $('#logs').classList.contains('active'), null);
  window.history.pushState({}, '', '/');
  window.dispatchEvent(new window.PopStateEvent('popstate'));
  check('la racine ouvre la vue d’ensemble', $('#dashboard').classList.contains('active'), null);
  window.fetch = beforeRoutes;

  // Création d'un compte : la clé doit s'afficher une fois, avec l'avertissement.
  const form = $('#user-form');
  form.elements.username.value = 'nouveau';
  form.elements.password.value = 'un-mot-de-passe-long';
  form.dispatchEvent(new window.Event('submit', { cancelable: true, bubbles: true }));

  setTimeout(() => {
    check('la clé est montrée après création', $('#key-value').textContent.length === 64, $('#key-value').textContent.length);
    check('avec l’avertissement qu’on ne la reverra pas', /ne sera plus jamais affichée/.test($('#key-modal .warn').textContent), null);
    check('la modale de clé est ouverte', $('#key-modal').open === true, null);
    manager(ko);
  }, 120);
}, 250);


/** Le même écran vu par un gestionnaire : la section des comptes ne doit
 * pas lui être offerte, et rien ne doit échouer parce qu'il n'y a pas
 * accès. */
function manager(failures) {
  const dom2 = new JSDOM(html, { virtualConsole: vc, url: 'http://localhost:3000/', runScripts: 'outside-only', pretendToBeVisual: true });
  const w = dom2.window;
  w.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  w.HTMLDialogElement.prototype.close = function () { this.open = false; };
  w.fetch = async (url) => {
    const p = String(url).replace('/api', '').split('?')[0];
    if (p === '/users') return { ok: false, status: 403, json: async () => ({ message: 'Réservé aux administrateurs' }) };
    const body = p === '/me'
      ? { id: 'u2', username: 'sofia', role: 'MANAGER', status: 'ACTIVE' }
      : (routes[p] ?? empty);
    return { ok: true, status: 200, json: async () => body };
  };
  w.eval(fs.readFileSync(`${DIR}/app.js`, 'utf8'));

  setTimeout(() => {
    let ko = failures;
    const $ = (s) => w.document.querySelector(s);
    const check = (label, ok, got) => { console.log(`${ok ? '  ok  ' : '  KO  '}${label}${ok ? '' : ' → ' + JSON.stringify(got)}`); if (!ok) ko++; };
    console.log('\n  — vu par un gestionnaire —');
    check('l’en-tête le dit gestionnaire', /sofia.*gestionnaire/.test($('#whoami').textContent), $('#whoami').textContent);
    check('le corps n’est pas marqué administrateur', !w.document.body.classList.contains('is-admin'), [...w.document.body.classList]);
    // La classe `admin-only` est masquée par la feuille de style : ce qui
    // compte ici est que le corps ne porte pas `is-admin`.
    check('la liste des comptes reste vide', $('#user-rows').textContent.includes('Aucun compte'), $('#user-rows').textContent.slice(0, 60));
    check('le chargement n’a pas échoué', !$('#notice').className.includes('error'), $('#notice').textContent);
    process.exit(ko ? 1 : 0);
  }, 250);
}
