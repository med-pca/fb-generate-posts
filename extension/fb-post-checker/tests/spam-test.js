/**
 * Le « Spam potentiel » : le modérateur ne clique « Publish » que sous les
 * posts dont l'AUTEUR est un de nos profils (identifiant exact) — jamais
 * sous ceux d'inconnus, jamais « Decline ».
 *
 *   node extension/fb-post-checker/tests/spam-test.js
 */
const path = require('path');
const fs = require('fs');
const { JSDOM } = require(path.join(__dirname, '../../../node_modules/jsdom'));
const src = (f) => fs.readFileSync(path.join(__dirname, `../${f}`), 'utf8');
const HUMAN = src('human.js'), CHECK = src('check.js'), MEMBERS = src('members.js');

let ko = 0;
const check = (label, ok, got) => {
  console.log(`${ok ? '  ok  ' : '  KO  '}${label}${ok ? '' : ' → ' + JSON.stringify(got)}`);
  if (!ok) ko++;
};

/** Un post en spam : en-tête (auteur), texte, et ses boutons. Le texte cite
 * un autre membre : seul l'auteur (premier lien) compte. */
const item = (key, authorId, author, text) =>
  `<div class="item" data-key="${key}"><div><a href="/groups/1/user/${authorId}/">${author}</a> · <a href="/groups/1/posts/4242${key.charCodeAt(0)}/">2 h</a></div>` +
  `<p>${text} <a href="/groups/1/user/100055555/">Tagged Friend</a></p>` +
  `<div><div role="button" class="publish">Publish</div><div role="button" class="decline">Decline</div><div role="button">…</div></div></div>`;

function spamPage(items, url = 'https://www.facebook.com/groups/1/spam') {
  const dom = new JSDOM(`<!doctype html><body><div role="main"><h1>Potential spam · 75</h1>${items}</div></body>`, { url, runScripts: 'outside-only' });
  const w = dom.window;
  Object.defineProperty(w.HTMLElement.prototype, 'innerText', { get() { return this.textContent; } });
  w.scrollBy = () => {};
  w.eval(HUMAN);
  w.eval(CHECK);
  w.eval(MEMBERS);
  const log = [];
  w.document.querySelectorAll('.publish').forEach((b) => b.addEventListener('click', () => {
    const it = b.closest('.item');
    log.push(`publish:${it.dataset.key}`);
    it.remove();
  }));
  w.document.querySelectorAll('.decline').forEach((b) => b.addEventListener('click', () => log.push(`decline:${b.closest('.item').dataset.key}`)));
  return { w, log };
}

const task = { members: [{ facebookUserId: '100011111', name: 'Salim Bennani' }], max: 8 };

(async () => {
  {
    const { w, log } = spamPage(item('a', '100099999', 'Inconnu', 'Why putting salt in your toilet') + item('b', '100011111', 'Salim Bennani', 'Creamy tomato tortellini'));
    const r = await w.FPM.releaseSpam(task);
    check('publie le post de NOTRE profil', log.includes('publish:b'), log);
    check('ne touche pas au post d’un inconnu', !log.includes('publish:a'), log);
    check('ne clique jamais « Decline »', !log.some((l) => l.startsWith('decline')), log);
    check('rapporte l’auteur et l’adresse du post', r.outcome === 'done' && r.released.length === 1 && r.released[0].facebookUserId === '100011111' && /posts\/424298/.test(r.released[0].postUrl) && !/Publish|Decline/.test(r.released[0].text), r);
  }
  {
    // Un inconnu qui CITE notre profil dans son texte : pas l'auteur, pas touché.
    const { w, log } = spamPage(`<div class="item" data-key="c"><div><a href="/groups/1/user/100099999/">Inconnu</a></div><p>merci <a href="/groups/1/user/100011111/">Salim Bennani</a></p><div><div role="button" class="publish">Publish</div><div role="button" class="decline">Decline</div></div></div>`);
    const r = await w.FPM.releaseSpam(task);
    check('notre profil seulement cité : rien publié', !log.length && r.outcome === 'nothing', { log, r });
  }
  {
    const { w } = spamPage('');
    const r = await w.FPM.releaseSpam(task);
    check('file vide : rien à faire', r.outcome === 'nothing' && /vide/.test(r.detail), r);
  }
  {
    const { w } = spamPage(item('d', '100011111', 'Salim', 'x'), 'https://www.facebook.com/groups/1/pending_posts');
    const r = await w.FPM.releaseSpam(task);
    check('pas sur la page spam : rien cliqué', r.outcome === 'unreachable', r);
  }
  {
    // Arabe : « نشر ».
    const { w, log } = spamPage(item('e', '100011111', 'Salim', 'x').replace('>Publish<', '>نشر<'));
    await w.FPM.releaseSpam(task);
    check('arabe « نشر »', log.includes('publish:e'), log);
  }
  console.log(ko ? `\n${ko} échec(s).` : '\nTout est bon.');
  process.exit(ko ? 1 : 0);
})();
