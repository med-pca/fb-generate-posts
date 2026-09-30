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
const dom = new JSDOM(html, { virtualConsole: vc, url: 'http://localhost:3000/admin/', runScripts: 'outside-only', pretendToBeVisual: true });
const { window } = dom;
window.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
window.HTMLDialogElement.prototype.close = function () { this.open = false; };
window.localStorage.setItem('postflow_token', 'jeton');
window.confirm = () => true;

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
  const beforeQueue = window.fetch;
  window.fetch = async (url, options = {}) => {
    const path = String(url).replace('/api', '');
    queueCalls.push(`${options.method || 'GET'} ${path}`);
    if (path.startsWith('/posts/queue')) {
      return { ok: true, status: 200, json: async () => ({
        counts: { running: 1, upcoming: 12, published: 1, failed: 1 },
        failed: [{ targetId: 't-f', error: 'Le groupe n’accepte plus les publications', attempts: 2, failedAt: '2026-09-30T07:00:00Z', post: post('f'), group, profile: salim, candidates: [salim] }],
        running: [{ state: 'publishing', since: '2026-09-30T09:00:00Z', post: post('r'), group, profile: salim }],
        upcoming: [
          { rank: 1, targetId: 't-a', post: post('a', 3), group, candidates: [salim], forcedProfile: salim, forcedAt: '2026-09-30T09:00:00Z' },
          { rank: 2, targetId: 't-b', post: post('b'), group, candidates: [] },
        ],
        published: [{ publishedAt: '2026-09-30T08:00:00Z', post: post('p'), group, profile: salim, facebookUrl: 'https://facebook.com/groups/g1/posts/9', link: 'placed' }],
      }) };
    }
    if (path.includes('/priority')) return { ok: true, status: 200, json: async () => ({ id: 'b', priority: 4 }) };
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
  check('un groupe sans profil est signalé', /aucun profil/.test(upcomingRows), upcomingRows);
  const publishedRows = $('#queue-published').textContent;
  check('un post publié dit par quel profil et dans quel groupe', /Salim/.test(publishedRows) && /Recettes FR/.test(publishedRows), publishedRows);
  check('et le lien Facebook de la publication', !!$('#queue-published a[href="https://facebook.com/groups/g1/posts/9"]'), null);
  check('« en cours » montre le profil qui publie', /Salim/.test($('#queue-running').textContent) && /Publication en cours/.test($('#queue-running').textContent), null);
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

  check('un envoi forcé est visible dans la file', /→ Salim/.test($('#queue-upcoming').textContent), null);
  const forceSelect = $('select[data-force="t-f"]');
  forceSelect.value = 'p1';
  forceSelect.dispatchEvent(new window.Event('change', { bubbles: true }));
  await new Promise((resolve) => setTimeout(resolve, 50));
  check('« Envoyer par… » force le profil choisi', queueCalls.includes('PUT /posts/targets/t-f/force'), queueCalls);
  check('et prévient si ce profil est à l’arrêt', /à l’arrêt/.test($('#notice').textContent), $('#notice').textContent);
  check('un groupe sans profil ne propose pas d’envoi', $('#queue-upcoming tr:nth-child(2) select').disabled, null);
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
      return { ok: true, status: 200, json: async () => ({
        data: [{ id: 'l1', createdAt: '2026-09-30T08:00:00Z', level: 'WARN', eventType: 'WORDPRESS_ARTICLE_NO_POST', domain: 'sync', message: '« Couscous » reçu de Food Time sans post : le site n’a pas de catégorie', metadata: null }],
        meta: { page: 1, limit: 25, total: 1, pages: 1 },
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
  window.fetch = beforeLogs;

  // ─── Filtres du Pilotage ───────────────────────────────────────
  const now = new Date().toISOString();
  const runner = (over) => ({ profileId: over.name, externalId: `ext-${over.name}`, status: 'ACTIVE', mode: 'AUTO', shouldRun: false, reason: 'hors fenêtre',
    window: '09:00–18:00', timezone: 'Europe/Paris', atWork: false, running: false, pairedAt: now, browserState: 'STOPPED',
    published: 0, failed: 0, links: 0, lastSeenAt: now, browserSeenAt: now, ...over });
  const patched = [];
  const beforeRunners = window.fetch;
  window.fetch = async (url, options = {}) => {
    const path = String(url).replace('/api', '');
    if (path === '/runners') {
      return { ok: true, status: 200, json: async () => ({ publishingEnabled: true, profiles: [
        runner({ name: 'Salim', shouldRun: true, atWork: true, running: true, browserState: 'RUNNING' }),
        runner({ name: 'Nadia', shouldRun: true }),
        runner({ name: 'Omar', mode: 'OFF', pairedAt: null }),
        runner({ name: 'Yasmine', browserState: 'ERROR' }),
      ] }) };
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
  check('le Pilotage liste tous les profils', runnerNames().length === 4, runnerNames());
  check('le compteur signale les profils à vérifier', /2 à vérifier/.test($('#runner-count').textContent), $('#runner-count').textContent);
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
      if (body.dryRun) return { ok: true, status: 200, json: async () => ({ dryRun: true, posts: 143, articles: 42, jobs: 64, published: 211, activeJobs: 0 }) };
      return { ok: true, status: 200, json: async () => ({ dryRun: false, deleted: { posts: 143, articles: 42 } }) };
    }
    if (path === '/settings') return { ok: true, status: 200, json: async () => ({}) };
    return beforeExtra(url, options);
  };
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
  of.dispatchEvent(new window.Event('submit', { cancelable: true }));
  await new Promise((resolve) => setTimeout(resolve, 50));
  check('régler l’objectif l’enregistre', extraCalls.includes('PATCH /settings'), extraCalls.slice(-5));

  window.eval(`view('settings')`);
  await new Promise((resolve) => setTimeout(resolve, 50));
  check('la zone dangereuse compte avant d’effacer', /143/.test($('#reset-counts').textContent) && /42/.test($('#reset-counts').textContent), $('#reset-counts').textContent);
  $('#reset-open').click();
  await new Promise((resolve) => setTimeout(resolve, 50));
  check('effacer demande une confirmation écrite', $('#reset-modal').open && $('#reset-form').elements.confirm.required, null);
  $('#reset-form').elements.confirm.value = 'EFFACER';
  $('#reset-form').dispatchEvent(new window.Event('submit', { cancelable: true }));
  await new Promise((resolve) => setTimeout(resolve, 80));
  check('puis efface', /143 post\(s\) et 42 article\(s\) supprimés/.test($('#notice').textContent), $('#notice').textContent);
  window.fetch = beforeExtra;

  check('la fenêtre d’appairage a les marges des autres', !!$('#pair-modal > .modal-body'), null);

  const rows = $('#user-rows').textContent;
  check('les comptes sont listés', rows.includes('admin') && rows.includes('sofia'), rows.slice(0, 80));
  check('aucune clé n’apparaît dans la liste', !/[0-9a-f]{64}/.test($('#user-rows').innerHTML), null);
  check('on ne peut pas se supprimer soi-même', !$('#user-rows').innerHTML.includes('data-delete-user="boss"'), null);
  check('mais on peut supprimer un autre compte', $('#user-rows').innerHTML.includes('data-delete-user="u2"'), null);

  check('les sites offrent le partage', $('#site-rows').innerHTML.includes('data-share-site="s1"'), null);

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
  const dom2 = new JSDOM(html, { virtualConsole: vc, url: 'http://localhost:3000/admin/', runScripts: 'outside-only', pretendToBeVisual: true });
  const w = dom2.window;
  w.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  w.HTMLDialogElement.prototype.close = function () { this.open = false; };
  w.localStorage.setItem('postflow_token', 'jeton');
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
