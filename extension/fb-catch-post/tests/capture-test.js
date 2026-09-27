/**
 * Vérifie la lecture d'une publication contre une page qui imite la
 * structure de Facebook. Un double suffit : ce qu'on teste, c'est le choix
 * du bon article, de la bonne image et du bon texte, pas le rendu de
 * Facebook. Une vérification sur une vraie page reste nécessaire.
 *
 *   node extension/fb-catch-post/tests/capture-test.js
 */
const path = require('path');
const fs = require('fs');
// jsdom vit dans les dépendances de l'API, à la racine du dépôt.
const { JSDOM } = require(path.join(__dirname, '../../../node_modules/jsdom'));
const CAPTURE = fs.readFileSync(path.join(__dirname, '../capture.js'), 'utf8');

// Une page qui imite la structure de Facebook : le post, ses commentaires,
// un avatar, des icônes, et un « Voir plus » qui cache la fin du texte.
const page = (opts = {}) => `<!doctype html><html><body>
  <div role="article" aria-label="Publication de Cuisine du Maghreb">
    <img src="https://scontent.test/avatar.jpg" alt="avatar">
    <div data-ad-preview="message">${opts.text || 'Le secret du tajine de ma grand-mère 🥘 Une cuisson lente et des épices généreuses.'}
      ${opts.seeMore ? '<span id="more">Voir plus</span>' : ''}</div>
    <img id="photo" src="https://scontent.test/tajine.jpg" alt="photo du plat">
    <img src="https://scontent.test/reaction.png" alt="j-aime">
    <a href="https://www.facebook.com/CuisineDuMaghreb/posts/998877?comment_id=1">28 septembre</a>
  </div>
  <div role="article" aria-label="Commentaire de Untel">
    <div data-ad-preview="message">Super recette, merci !</div>
  </div>
</body></html>`;

function run(html, sizes) {
  const dom = new JSDOM(html, { url: 'https://www.facebook.com/CuisineDuMaghreb/posts/998877?foo=1', pretendToBeVisual: true, runScripts: 'outside-only' });
  const { window } = dom;
  // jsdom ne fait pas de mise en page : on donne leurs tailles aux images.
  window.Element.prototype.getBoundingClientRect = function () {
    const s = sizes[this.id] || sizes[this.getAttribute('alt')] || sizes._default || { w: 0, h: 0, top: 0 };
    return { width: s.w, height: s.h, top: s.top || 0, left: 0, right: s.w, bottom: s.h };
  };
  window.innerHeight = 800;
  // Le clic sur « Voir plus » révèle la suite, comme Facebook le fait.
  const more = window.document.getElementById('more');
  if (more) more.addEventListener('click', () => {
    const box = window.document.querySelector('[data-ad-preview="message"]');
    more.remove();
    box.append(window.document.createTextNode(' Et cette odeur qui remplit la maison.'));
  });
  return window.eval(CAPTURE);
}

const sizes = {
  photo: { w: 500, h: 400, top: 200 },
  avatar: { w: 40, h: 40, top: 100 },
  'j-aime': { w: 18, h: 18, top: 500 },
  _default: { w: 600, h: 500, top: 150 },
};

let ko = 0;
const check = (label, cond, got) => { console.log(`${cond ? '  ok  ' : '  KO  '}${label}${cond ? '' : ' → ' + JSON.stringify(got)}`); if (!cond) ko++; };

let r = run(page(), sizes);
check('texte du post lu', r.caption.startsWith('Le secret du tajine'), r.caption);
check('commentaire ignoré', !r.caption.includes('Super recette'), r.caption);
check('photo retenue, pas l’avatar ni la réaction', r.imageUrl === 'https://scontent.test/tajine.jpg', r.imageUrl);
check('permalink sans paramètres', r.facebookUrl === 'https://www.facebook.com/CuisineDuMaghreb/posts/998877', r.facebookUrl);
check('un seul post détecté', r.postsOnPage === 1, r.postsOnPage);
check('non bloqué', r.blocked === false, r.blocked);

r = run(page({ seeMore: true }), sizes);
check('« Voir plus » déplié avant lecture', r.caption.includes('odeur qui remplit la maison'), r.caption);

r = run('<!doctype html><html><body><div>Connectez-vous pour continuer</div></body></html>', sizes);
check('mur de connexion signalé', r.blocked === true, r);

r = run(page({ text: 'Trop court' }), sizes);
check('texte trop court rendu tel quel (le popup refusera)', r.caption === 'Trop court', r.caption);

process.exit(ko ? 1 : 0);
