/**
 * Lecture d'une page de post par le vérificateur, contre des pages qui
 * imitent Facebook. Une vérification sur une vraie page reste nécessaire.
 *
 *   node extension/fb-post-checker/tests/check-test.js
 */
const path = require('path');
const fs = require('fs');
const { JSDOM } = require(path.join(__dirname, '../../../node_modules/jsdom'));
const CHECK = fs.readFileSync(path.join(__dirname, '../check.js'), 'utf8');

let ko = 0;
const check = (label, ok, got) => {
  console.log(`${ok ? '  ok  ' : '  KO  '}${label}${ok ? '' : ' → ' + JSON.stringify(got)}`);
  if (!ok) ko++;
};

function page(body, url = 'https://www.facebook.com/groups/1/posts/9') {
  const dom = new JSDOM(`<!doctype html><body>${body}</body>`, { url, runScripts: 'outside-only' });
  const w = dom.window;
  // jsdom n'a pas innerText.
  Object.defineProperty(w.HTMLElement.prototype, 'innerText', { get() { return this.textContent; } });
  w.eval(CHECK);
  return w;
}

const task = {
  postText: '𝐓𝐚𝐣𝐢𝐧𝐞 au poulet 🍗 et citron confit, la vraie recette de grand-mère',
  linkUrl: 'https://food.test/tajine-poulet/?utm_source=fb',
};
const post = (comments) => `<div role="main"><div role="article">
  <div>Tajine au poulet et citron confit, la vraie recette de grand-mère</div>
  <div aria-label="Actions for this post" role="button">…</div>
  ${comments}</div></div>`;

(async () => {
  let w = page(post('<a href="https://l.facebook.com/l.php?u=https%3A%2F%2Ffood.test%2Ftajine-poulet%2F&h=x">food.test</a>'));
  check('lien posé (via l.facebook.com) → ok', (await w.FPC.inspect(task)).outcome === 'ok', null);

  w = page(post('<div>food.test/tajine-poulet</div>'));
  check('lien en texte brut → ok', (await w.FPC.inspect(task)).outcome === 'ok', null);

  w = page(post('<div>.</div>'));
  let r = await w.FPC.inspect(task);
  check('commentaire « . » sans URL → missing_link', r.outcome === 'missing_link', r);

  w = page(post('<a href="https://food.test/autre-recette/">autre</a>'));
  r = await w.FPC.inspect(task);
  check('un autre lien du même site ne compte pas', r.outcome === 'missing_link', r);
  check('et le constat dit quel lien était posé à la place', /liens vus : food\.test\/autre-recette/.test(r.detail), r.detail);

  w = page('<div role="main"><span>Ce contenu n’est pas disponible pour le moment</span></div>');
  check('contenu indisponible → missing_post', (await w.FPC.inspect(task)).outcome === 'missing_post', null);

  w = page('<div role="main"><div role="article">Un tout autre post</div></div>');
  r = await w.FPC.inspect(task);
  check('post non reconnu → injoignable, jamais republié', r.outcome === 'unreachable', r);

  w = page('<form id="login_form"><input name="pass"></form>', 'https://www.facebook.com/login/');
  check('mur de connexion → injoignable', (await w.FPC.inspect(task)).outcome === 'unreachable', null);

  w = page(post('<div role="button">Afficher plus de commentaires</div>'));
  w.document.querySelector('[role="main"] [role="button"]:last-child').addEventListener('click', (e) => {
    e.target.insertAdjacentHTML('afterend', '<a href="https://food.test/tajine-poulet">lien</a>');
  });
  r = await w.FPC.inspect(task);
  check('commentaires repliés : dépliés, puis lien trouvé', r.outcome === 'ok', r);

  // Suppression : menu du post → « Supprimer la publication » → confirmer.
  w = page(post('<div>.</div>'));
  const d = w.document;
  let confirmed = false;
  d.querySelector('[aria-label="Actions for this post"]').addEventListener('click', () => {
    d.body.insertAdjacentHTML('beforeend', '<div role="menu"><div role="menuitem">Modifier</div><div role="menuitem">Supprimer la publication</div></div>');
    d.querySelectorAll('[role="menuitem"]')[1].addEventListener('click', () => {
      d.body.insertAdjacentHTML('beforeend', '<div role="dialog"><div role="button">Annuler</div><div role="button" id="ok">Supprimer</div></div>');
      d.getElementById('ok').addEventListener('click', () => (confirmed = true));
    });
  });
  r = await w.FPC.remove();
  check('suppression : menu, option, confirmation', r.deleted && confirmed, r);

  w = page(post('<div>.</div>'));
  w.document.querySelector('[aria-label="Actions for this post"]').addEventListener('click', () => {
    w.document.body.insertAdjacentHTML('beforeend', '<div role="menu"><div role="menuitem">Enregistrer</div></div>');
  });
  r = await w.FPC.remove();
  check('pas d’option de suppression → non supprimé, dit pourquoi', !r.deleted && /administrateur/.test(r.detail), r);

  // Publié sans adresse : retrouver le post dans le fil du groupe.
  const feed = `<div role="feed">
    <div><div>Salim</div><a href="#">2 h</a><div>Un autre post sans rapport</div></div>
    <div><div>Salim</div><a class="date" href="#">1 h</a><div>Tajine au poulet et citron confit, la vraie recette de grand-mère</div>
      <div role="article"><a href="https://www.facebook.com/groups/1/posts/9/?comment_id=5">commentaire</a></div></div>
  </div>`;
  w = page(feed, 'https://www.facebook.com/groups/1');
  w.scrollBy = () => {};
  // Le vrai lien n'apparaît qu'au survol de la date.
  w.document.querySelector('a.date').addEventListener('mouseover', (e) => {
    e.target.setAttribute('href', 'https://www.facebook.com/groups/1/posts/77/?__cft__[0]=abc&__tn__=R');
  });
  r = await w.FPC.locate({ ...task, author: 'Salim' }, { scrolls: 0 });
  check('post sans adresse : retrouvé dans le groupe, lien nettoyé', r.found && r.url === 'https://www.facebook.com/groups/1/posts/77/', r);

  w = page(feed, 'https://www.facebook.com/groups/1');
  w.scrollBy = () => {};
  r = await w.FPC.locate({ ...task, author: 'Nadia' }, { scrolls: 0 });
  check('même texte d’un autre auteur : pas confondu', !r.found, r);

  console.log(ko ? `\n${ko} échec(s)` : '\nTout est bon.');
  process.exit(ko ? 1 : 0);
})();
