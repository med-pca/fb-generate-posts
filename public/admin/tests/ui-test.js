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

setTimeout(() => {
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
  check('un post peut être créé sans profil', $('#post-profile').options[0].textContent.includes('post ouvert') && !$('#post-profile').required, null);

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
    check('avec l’avertissement qu’on ne la reverra pas', /ne sera plus jamais affichée/.test($('.warn').textContent), null);
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
