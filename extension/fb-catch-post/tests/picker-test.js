/**
 * Le mode sélection et le popup, contre une page et une API simulées :
 * survoler encadre le post, cliquer le capture dans le stockage, et le
 * popup ne laisse choisir qu'un site prêt.
 *
 *   node extension/fb-catch-post/tests/picker-test.js
 */
const path = require('path');
const fs = require('fs');
const { JSDOM } = require(path.join(__dirname, '../../../node_modules/jsdom'));
const read = (file) => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');

let ko = 0;
const check = (label, ok, got) => {
  console.log(`${ok ? '  ok  ' : '  KO  '}${label}${ok ? '' : ' → ' + JSON.stringify(got)}`);
  if (!ok) ko += 1;
};
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Un faux `chrome` : le stockage est un objet, les messages sont notés. */
function fakeChrome(store = {}) {
  const sent = [];
  return {
    store,
    sent,
    storage: {
      local: {
        // Comme chrome.storage : une clé ou une liste de clés.
        get: async (keys) => Object.fromEntries([].concat(keys).filter((k) => k in store).map((k) => [k, store[k]])),
        set: async (items) => Object.assign(store, items),
        remove: async (keys) => [].concat(keys).forEach((k) => delete store[k]),
      },
    },
    runtime: { sendMessage: async (message) => sent.push(message) },
    action: { setBadgeText: () => {} },
  };
}

(async () => {
  // ─── Le mode sélection dans la page ───────────────────────────────
  const page = new JSDOM(
    `<!doctype html><html><body><div role="feed">
      <div class="unit">
        <div><a href="https://www.facebook.com/groups/g/posts/1/">hier</a>
          <div data-ad-preview="message">Gâteau au chocolat fondant, sans farine et sans beurre</div></div>
        <div><img alt="photo" src="https://scontent.test/gateau.jpg"></div>
      </div>
    </div></body></html>`,
    { url: 'https://www.facebook.com/groups/g', pretendToBeVisual: true, runScripts: 'outside-only' },
  );
  const { window } = page;
  window.Element.prototype.getBoundingClientRect = function () {
    const photo = this.getAttribute('alt') === 'photo';
    return photo
      ? { width: 500, height: 400, top: 50, bottom: 450, left: 0, right: 500 }
      : { width: 600, height: 500, top: 0, bottom: 500, left: 0, right: 600 };
  };
  window.chrome = fakeChrome();
  window.eval(read('capture.js'));
  window.eval(read('picker.js'));
  const doc = window.document;

  check('une bannière guide la sélection', /Cliquez sur la publication/.test(doc.body.parentElement.textContent), null);
  const img = doc.querySelector('img[alt="photo"]');
  img.dispatchEvent(new window.MouseEvent('mousemove', { bubbles: true }));
  const frame = doc.querySelector('[data-fcp-ui]');
  check('survoler le post l’encadre', frame.style.display === 'block', frame.style.display);

  // Le clic ne doit pas atteindre Facebook (qui ouvrirait la visionneuse).
  let reachedPage = false;
  img.addEventListener('click', () => (reachedPage = true));
  img.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true, clientX: 100, clientY: 100 }));
  await wait(600);
  const captured = window.chrome.store['fcp.capture'];
  check('le clic capture le texte', captured?.caption?.startsWith('Gâteau au chocolat'), captured);
  check('et l’image cliquée', captured?.imageUrl === 'https://scontent.test/gateau.jpg', captured?.imageUrl);
  check('et le lien du post', captured?.facebookUrl === 'https://www.facebook.com/groups/g/posts/1/', captured?.facebookUrl);
  check('Facebook ne reçoit pas le clic', reachedPage === false, reachedPage);
  check('le popup est prévenu', window.chrome.sent.some((m) => m.type === 'fcp:captured'), window.chrome.sent);
  check('la bannière confirme', /capturés/.test(doc.documentElement.textContent), null);

  // ─── Le popup : la capture retrouvée, et seuls les sites prêts ────
  const popup = new JSDOM(read('popup.html').replace(/<script[^>]*><\/script>/g, ''), {
    url: 'chrome-extension://fcp/popup.html',
    runScripts: 'outside-only',
  });
  const pw = popup.window;
  pw.chrome = fakeChrome({ 'fcp.capture': { ...captured, capturedAt: Date.now() } });
  pw.chrome.tabs = { query: async () => [] };
  pw.fetch = async () => ({
    ok: true,
    json: async () => ({
      sites: [
        { name: 'Food Time', siteUrl: 'https://foodtime.test', ready: false, reason: 'extension WordPress à mettre à jour (1.3.0)', category: null },
        { name: 'Tera', siteUrl: 'https://tera.test', ready: true, category: 'Recettes', languages: [{ code: 'fr', name: 'French', groups: 3 }, { code: 'ar', name: 'Arabic', groups: 2 }] },
        { name: 'Nord', siteUrl: 'https://nord.test', ready: false, reason: 'sans catégorie : aucun post', category: null },
      ],
    }),
  });
  pw.eval(read('config.js'));
  // Le paquet préconfiguré porte la clé ; le dossier du dépôt, non.
  pw.FCP_CONFIG.apiKey = 'cle-de-test';
  pw.eval(read('popup.js'));
  await wait(50);
  const $ = (id) => pw.document.getElementById(id);
  check('la capture s’affiche à la réouverture', $('caption').value.startsWith('Gâteau'), $('caption').value);
  check('avec son image', $('preview').getAttribute('src') === 'https://scontent.test/gateau.jpg', null);
  const options = [...$('site').options].filter((o) => o.value);
  check('les sites prêts d’abord', options[0].textContent.includes('Tera'), options.map((o) => o.textContent));
  check('seul le site prêt est sélectionnable',
    options.filter((o) => !o.disabled).map((o) => o.value).join() === 'https://tera.test',
    options.map((o) => [o.value, o.disabled]));
  check('un site non prêt dit pourquoi', options.some((o) => /Food Time — extension WordPress à mettre à jour/.test(o.textContent)), null);
  check('l’unique site prêt est présélectionné', $('site').value === 'https://tera.test', $('site').value);
  check('la catégorie de destination est annoncée', /groupes « Recettes »/.test($('site-note').textContent), $('site-note').textContent);
  check('l’envoi attend l’URL de l’article', $('send').disabled === true, null);
  $('source').value = 'https://exemple.com/gateau';
  $('source').dispatchEvent(new pw.Event('input'));
  check('puis s’active', $('send').disabled === false, null);

  // ─── Le brouillon survit à la fermeture du popup ──────────────────
  // On corrige le texte, on colle l'URL, on change de site… puis le popup se
  // ferme (clic dans un autre onglet pour copier). À la réouverture, tout est là.
  $('caption').value = 'Gâteau au chocolat fondant — texte corrigé à la main';
  $('caption').dispatchEvent(new pw.Event('input'));
  await wait(10);
  const reopened = new JSDOM(read('popup.html').replace(/<script[^>]*><\/script>/g, ''), {
    url: 'chrome-extension://fcp/popup.html',
    runScripts: 'outside-only',
  });
  const rw = reopened.window;
  rw.chrome = fakeChrome(pw.chrome.store);
  rw.chrome.tabs = { query: async () => [] };
  rw.fetch = pw.fetch;
  rw.eval(read('config.js'));
  rw.FCP_CONFIG.apiKey = 'cle-de-test';
  rw.eval(read('popup.js'));
  await wait(50);
  const r = (id) => rw.document.getElementById(id);
  check('réouverture : le texte corrigé est gardé', r('caption').value === 'Gâteau au chocolat fondant — texte corrigé à la main', r('caption').value);
  check('réouverture : l’URL collée est gardée', r('source').value === 'https://exemple.com/gateau', r('source').value);
  check('réouverture : le site choisi est gardé, l’envoi prêt', r('site').value === 'https://tera.test' && r('send').disabled === false, [r('site').value, r('send').disabled]);
  check('réouverture : le brouillon est signalé', /Brouillon retrouvé/.test(r('status').textContent), r('status').textContent);

  // ─── Mode « news » : notre article depuis l'image, sans site source ──
  const news = rw.document.querySelector('input[name="mode"][value="news"]');
  news.checked = true;
  news.dispatchEvent(new rw.Event('change'));
  r('source').value = '';
  r('source').dispatchEvent(new rw.Event('input'));
  check('mode actualité : pas d’URL à donner, le champ disparaît', r('source-block').classList.contains('hidden') && !r('news-hint').classList.contains('hidden'), null);
  check('mode actualité : l’envoi est prêt avec l’image seule', r('send').disabled === false && /Créer notre article/.test(r('send').textContent), r('send').textContent);
  let sentBody = null;
  rw.fetch = async (url, options = {}) => {
    if (String(url).includes('/scrape/capture')) {
      sentBody = JSON.parse(options.body);
      return { ok: true, status: 201, text: async () => JSON.stringify({ ingestId: 'ing_news' }) };
    }
    return pw.fetch(url, options);
  };
  r('send').click();
  await wait(50);
  check('mode actualité : envoyé en « news », en anglais, sans URL source', sentBody && sentBody.mode === 'news' && sentBody.language === 'en' && !('sourceUrl' in sentBody), sentBody);

  // ─── Mode « engagement » : une langue, image traduite, sans lien ──────
  const eng = rw.document.querySelector('input[name="mode"][value="engagement"]');
  eng.checked = true;
  eng.dispatchEvent(new rw.Event('change'));
  check('engagement : les langues des groupes de la catégorie sont proposées', /French — 3 groupe/.test(r('language').textContent) && /Arabic — 2 groupe/.test(r('language').textContent), r('language').textContent);
  check('engagement : il faut choisir la langue avant d’envoyer', r('send').disabled === true, null);
  r('language').value = 'ar';
  r('language').dispatchEvent(new rw.Event('change'));
  check('engagement : langue choisie, l’envoi est prêt', r('send').disabled === false && /engagement/.test(r('send').textContent), r('send').textContent);
  sentBody = null;
  r('send').click();
  await wait(50);
  check('engagement : envoyé avec la langue cible, sans URL source', sentBody && sentBody.mode === 'engagement' && sentBody.targetLanguage === 'ar' && !('sourceUrl' in sentBody), sentBody);

  process.exit(ko ? 1 : 0);
})();
