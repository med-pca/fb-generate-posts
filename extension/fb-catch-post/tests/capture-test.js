/**
 * Vérifie l'énumération et la lecture des publications, contre une page qui
 * imite la structure de Facebook. Un double suffit : ce qu'on teste, c'est
 * qu'on rende LA publication demandée et la bonne image, pas le rendu de
 * Facebook. Une vérification sur une vraie page reste nécessaire.
 *
 *   node extension/fb-catch-post/tests/capture-test.js
 */
const path = require('path');
const fs = require('fs');
// jsdom vit dans les dépendances de l'API, à la racine du dépôt.
const { JSDOM } = require(path.join(__dirname, '../../../node_modules/jsdom'));
const CAPTURE = fs.readFileSync(path.join(__dirname, '../capture.js'), 'utf8');

const POT_ROAST = '𝐏𝐋𝐄𝐀𝐒𝐄 𝐒.𝐀.𝐘 𝐒𝟎𝐌𝐄𝐓𝐇𝐥𝐍𝐆 — Classic pot roast 🤤 FULL RECIPE HERE';
const POOL = 'HAS A POOL! | Built in 1933 | 18 Beds | 14 Baths | 5.89 Acres';

/** Une publication telle que Facebook la rend : pas de `role="article"` —
 * beaucoup de pages n'en posent pas, et c'est ce qui cassait tout. Le
 * commentaire est délibérément marqué comme un message sur demande, pour
 * vérifier qu'il ne devient jamais une entrée à part. */
const article = (id, message, opts = {}) => `
  <div class="post-wrapper">
    <div class="header">
      <img alt="avatar-${id}" src="https://scontent.test/${id}-avatar.jpg">
      <a href="https://www.facebook.com/g/posts/${id}?comment_id=9">hier</a>
    </div>
    <div data-ad-preview="message">${message}${opts.seeMore ? '<span class="more">See more</span>' : ''}</div>
    <img alt="photo-${id}" src="https://scontent.test/${id}.jpg">
    <img alt="reaction-${id}" src="https://scontent.test/${id}-like.png">
    <div class="comments">
      <div ${opts.markedComment ? 'data-ad-preview="message"' : 'class="comment-body"'}>Un commentaire qui ne doit jamais être pris</div>
    </div>
  </div>`;

// Un fil : deux publications, celle qu'on veut n'est pas la première.
const FEED = `<!doctype html><html><body>
  ${article('potroast', POT_ROAST, { markedComment: true })}
  ${article('pool', POOL, { seeMore: true })}
</body></html>`;

const SIZES = {
  'photo-potroast': { w: 500, h: 400 }, 'photo-pool': { w: 520, h: 420 },
  'avatar-potroast': { w: 40, h: 40 }, 'avatar-pool': { w: 40, h: 40 },
  'reaction-potroast': { w: 18, h: 18 }, 'reaction-pool': { w: 18, h: 18 },
  _default: { w: 600, h: 500 },
};

function load(html, url = 'https://www.facebook.com/groups/immo/?ref=feed') {
  const dom = new JSDOM(html, {
    url,
    pretendToBeVisual: true,
    runScripts: 'outside-only',
  });
  const { window } = dom;
  // jsdom ne fait pas de mise en page : on donne leurs tailles aux éléments.
  window.Element.prototype.getBoundingClientRect = function () {
    const size = SIZES[this.getAttribute('alt')] || SIZES._default;
    return { width: size.w, height: size.h, top: 0, bottom: size.h, left: 0, right: size.w };
  };
  window.innerHeight = 800;
  // Le clic sur « See more » révèle la suite, comme Facebook le fait.
  for (const more of window.document.querySelectorAll('.more')) {
    more.addEventListener('click', () => {
      const box = more.closest('[data-ad-preview="message"]');
      more.remove();
      box.append(window.document.createTextNode(' … piscine intérieure et 5,89 acres.'));
    });
  }
  return { window, listed: window.eval(CAPTURE) };
}

let ko = 0;
const check = (label, ok, got) => {
  console.log(`${ok ? '  ok  ' : '  KO  '}${label}${ok ? '' : ' → ' + JSON.stringify(got)}`);
  if (!ok) ko += 1;
};

const { window, listed } = load(FEED);
check('les deux publications sont listées', listed.posts.length === 2, listed.posts.length);
check('les commentaires ne sont pas listés',
  !listed.posts.some((p) => p.preview.includes('commentaire')), listed.posts);
check('aucun role="article" n’est nécessaire',
  listed.seen.articles === 0 && listed.posts.length === 2, listed.seen);
check('chaque entrée porte un aperçu reconnaissable',
  listed.posts[0].preview.includes('pot roast') && listed.posts[1].preview.includes('HAS A POOL'),
  listed.posts.map((p) => p.preview.slice(0, 40)));
check('la présence d’une image est signalée', listed.posts.every((p) => p.hasImage), listed.posts);
check('page non bloquée', listed.blocked === false, listed.blocked);

/** Le bug corrigé : la seconde publication doit rendre SON texte, pas celui
 * de la première, qu'une heuristique de position avait ramené. */
(async () => {
  const pool = await window.__fcpCatch.read(1);
  check('la publication choisie rend son propre texte',
    pool.caption.startsWith('HAS A POOL'), pool.caption);
  check('pas le texte de la publication voisine',
    !pool.caption.includes('pot roast'), pool.caption);
  check('« See more » déplié dans cette publication seulement',
    pool.caption.includes('piscine intérieure'), pool.caption);
  check('son image, pas celle de la voisine',
    pool.imageUrl === 'https://scontent.test/pool.jpg', pool.imageUrl);
  check('avatar et réaction écartés',
    !/avatar|like/.test(pool.imageUrl), pool.imageUrl);
  check('permalink de cette publication, sans paramètres',
    pool.facebookUrl === 'https://www.facebook.com/g/posts/pool', pool.facebookUrl);

  const roast = await window.__fcpCatch.read(0);
  check('l’autre publication reste lisible séparément',
    roast.caption.includes('pot roast') && !roast.caption.includes('HAS A POOL'), roast.caption);

  const absent = await window.__fcpCatch.read(9);
  check('un indice hors liste est refusé', Boolean(absent.error), absent);

  // Une permalink : une seule publication, le popup n'a rien à demander.
  const single = load(`<!doctype html><html><body>${article('pool', POOL)}</body></html>`);
  check('une permalink ne liste qu’une publication',
    single.listed.posts.length === 1, single.listed.posts.length);

  // Le commentaire de la première publication est marqué comme un message :
  // il doit se fondre dans son post, pas s'ajouter à la liste.
  check('un commentaire marqué comme message ne crée pas d’entrée',
    listed.posts.length === 2
      && !listed.posts.some((p) => p.preview.includes('commentaire')),
    listed.posts.map((p) => p.preview.slice(0, 30)));

  const wall = load('<!doctype html><html><body><div>Connectez-vous pour continuer</div></body></html>');
  check('mur de connexion signalé', wall.listed.blocked === true, wall.listed);

  // ─── Page photo : la visionneuse ouverte en cliquant sur une image.
  // Aucun `data-ad-preview`, la légende est un bloc de texte parmi d'autres.
  const PHOTO = `<!doctype html><html><body>
    <div class="viewer"><img alt="grande-photo" src="https://scontent.test/grande.jpg"></div>
    <div class="side">
      <div><a href="/profile"><span dir="auto">Immo Deals</span></a></div>
      <div dir="auto">${POOL} — une demeure de 1933 avec piscine intérieure et 5,89 acres de terrain.</div>
      <div role="button"><span dir="auto">J’aime · Commenter · Partager</span></div>
      <div class="comments">
        <div dir="auto">Magnifique maison, quel est le prix demandé exactement ?</div>
      </div>
    </div>
  </body></html>`;
  const photo = load(PHOTO, 'https://web.facebook.com/photo/?fbid=986814304446230&set=gm.288624353434&fbclid=pistage');
  check('page photo : la structure de fil n’est pas reconnue',
    photo.listed.kind === 'text', photo.listed.kind);
  check('page photo : la légende est proposée',
    photo.listed.posts.some((p) => p.preview.includes('HAS A POOL')),
    photo.listed.posts.map((p) => p.preview.slice(0, 40)));
  check('page photo : le nom de l’auteur est trop court pour être proposé',
    !photo.listed.posts.some((p) => p.preview === 'Immo Deals'), photo.listed.posts);
  check('page photo : les libellés de boutons sont écartés',
    !photo.listed.posts.some((p) => p.preview.includes('Partager')), photo.listed.posts);

  const legend = photo.listed.posts.findIndex((p) => p.preview.includes('HAS A POOL'));
  const read = await photo.window.__fcpCatch.read(legend);
  check('page photo : la légende choisie est rendue entière',
    read.caption.includes('piscine intérieure et 5,89 acres'), read.caption);
  check('page photo : la grande image de la visionneuse est retenue',
    read.imageUrl === 'https://scontent.test/grande.jpg', read.imageUrl);
  /** L'identité de la publication vit dans la requête : la couper rendrait
   * le lien inutilisable. Le pistage, lui, doit partir. */
  check('page photo : fbid et set conservés, pistage retiré',
    read.facebookUrl === 'https://web.facebook.com/photo/?fbid=986814304446230&set=gm.288624353434',
    read.facebookUrl);

  process.exit(ko ? 1 : 0);
})();
