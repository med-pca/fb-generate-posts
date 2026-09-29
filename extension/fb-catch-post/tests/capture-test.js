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
  'grande-photo': { w: 700, h: 900 },
  '👇': { w: 16, h: 16 }, '💬': { w: 16, h: 16 },
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
    const left = size.left || 0;
    const top = size.top || 0;
    return { width: size.w, height: size.h, top, bottom: top + size.h, left, right: left + size.w };
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

  // ─── Le cas réel : une page photo dont le texte porte des emojis rendus
  // en <img alt> et dont la grande photo doit être retrouvée.
  const EMOJI = `<!doctype html><html><body>
    <div class="viewer"><img alt="grande-photo" src="https://scontent.test/hopital.jpg"></div>
    <div class="side">
      <div dir="auto">Can You Spot the Hidden Mistake in This Hospital Picture?....<img alt="👇" src="https://static.test/e1.png"><img alt="👇" src="https://static.test/e2.png"><img alt="💬" src="https://static.test/e3.png"></div>
    </div>
  </body></html>`;
  const emoji = load(EMOJI, 'https://web.facebook.com/photo/?fbid=122298425180017077&set=gm.161286034371921');
  const emojiIndex = emoji.listed.posts.findIndex((p) => p.preview.includes('Hidden Mistake'));
  const withEmoji = await emoji.window.__fcpCatch.read(emojiIndex);
  /** Facebook rend les emojis en <img alt> : `innerText` les perd, et la
   * légende repartait amputée de sa ponctuation expressive. */
  check('les emojis rendus en images sont conservés',
    withEmoji.caption === 'Can You Spot the Hidden Mistake in This Hospital Picture?....👇👇💬',
    withEmoji.caption);
  check('la grande photo est retrouvée sur une page photo',
    withEmoji.imageUrl === 'https://scontent.test/hopital.jpg', withEmoji.imageUrl);
  check('les petites images d’emoji ne sont pas prises pour la photo',
    !withEmoji.imageUrl.includes('static.test'), withEmoji.imageUrl);
  check('la liste annonce bien une image',
    emoji.listed.posts[emojiIndex].hasImage === true, emoji.listed.posts[emojiIndex]);
  check('le diagnostic montre les plus grandes images',
    Array.isArray(emoji.listed.seen.biggest) && emoji.listed.seen.biggest.length > 0,
    emoji.listed.seen);

  /** Le cas vécu : le panneau de notifications était dans la page, et
   * « John McCormick a signalé un contenu… » s'est retrouvé proposé comme
   * légende — puis publié. L'interface de Facebook n'est pas du contenu. */
  const AVEC_NOTIFS = `<!doctype html><html><body>
    <div role="banner">
      <div role="navigation" aria-label="Notifications">
        <div dir="auto">Unread</div>
        <div dir="auto">John McCormick, Ashley Fernandez and Audrey Dunsing McKinnon reported some content in The Storytellers</div>
      </div>
      <div role="menu"><div dir="auto">Paramètres et confidentialité, plus toutes les options du compte</div></div>
    </div>
    <div class="viewer"><img alt="grande-photo" src="https://scontent.test/mudra.jpg"></div>
    <div class="side">
      <div dir="auto">${POOL} — la légende véritable de la publication affichée.</div>
    </div>
  </body></html>`;
  const notifs = load(AVEC_NOTIFS, 'https://web.facebook.com/photo/?fbid=99&set=gm.1');
  const previews = notifs.listed.posts.map((p) => p.preview);
  check('le panneau de notifications n’est pas proposé',
    !previews.some((p) => p.includes('McCormick')), previews);
  check('les menus de l’interface ne sont pas proposés',
    !previews.some((p) => p.includes('Paramètres et confidentialité')), previews);
  check('la vraie légende, elle, est proposée',
    previews.some((p) => p.includes('HAS A POOL')), previews);

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

  // ─── Le vrai fil : l'en-tête et le texte sont dans un bloc, la photo dans
  // un bloc VOISIN. L'ancienne remontée s'arrêtait au lien de l'en-tête et
  // ne voyait jamais la photo : « texte relevé, aucune image ».
  const unit = (id, message, photos) => `
    <div class="unit-${id}">
      <div class="top">
        <div class="head"><a href="https://www.facebook.com/groups/g/posts/${id}/?__cft__=x">il y a 2 h</a></div>
        <div data-ad-preview="message">${message}</div>
      </div>
      <div class="media">
        ${photos.map((p) => `<a href="/photo/?fbid=${p}"><img alt="${p}" src="https://scontent.test/${p}.jpg"></a>`).join('')}
      </div>
      <div role="button"><span dir="auto">J’aime · Commenter · Partager</span></div>
    </div>`;
  SIZES['p1-a'] = { w: 480, h: 400, left: 0, top: 100 };
  SIZES['p1-b'] = { w: 480, h: 400, left: 500, top: 100 };
  SIZES['p2-a'] = { w: 480, h: 400, left: 0, top: 900 };
  const REAL = `<!doctype html><html><body><div role="feed">
    ${unit('p1', 'Le gratin dauphinois de ma grand-mère, le vrai 😋', ['p1-a', 'p1-b'])}
    ${unit('p2', 'Tarte au citron meringuée, la recette inratable', ['p2-a'])}
  </div></body></html>`;
  const real = load(REAL);
  const doc = real.window.document;
  check('fil réel : deux posts', real.listed.posts.length === 2, real.listed.posts.length);
  const listedFirst = await real.window.__fcpCatch.read(0);
  check('fil réel : la photo voisine du texte est retrouvée',
    listedFirst.imageUrl.startsWith('https://scontent.test/p1-'), listedFirst.imageUrl);

  // Cliquer sur le texte du 2e post.
  const onText = await real.window.__fcpCatch.readAt(
    doc.querySelector('.unit-p2 [data-ad-preview]'), null);
  check('clic sur le texte : son propre post', onText.caption.startsWith('Tarte au citron'), onText.caption);
  check('clic sur le texte : sa photo, pas celle du voisin',
    onText.imageUrl === 'https://scontent.test/p2-a.jpg', onText.imageUrl);
  check('clic sur le texte : son lien, sans pistage',
    onText.facebookUrl === 'https://www.facebook.com/groups/g/posts/p2/', onText.facebookUrl);

  // Cliquer sur la 2e photo d'un post à plusieurs photos : c'est celle-là.
  const onPhoto = await real.window.__fcpCatch.readAt(
    doc.querySelector('img[alt="p1-b"]'), { x: 700, y: 300 });
  check('clic sur une photo : c’est cette photo qui est prise',
    onPhoto.imageUrl === 'https://scontent.test/p1-b.jpg', onPhoto.imageUrl);
  check('clic sur une photo : avec le texte de son post',
    onPhoto.caption.startsWith('Le gratin'), onPhoto.caption);

  // Cliquer sur « J'aime » du post désigne encore le post.
  const onButton = real.window.__fcpCatch.pickAt(doc.querySelector('.unit-p1 [role="button"] span'));
  check('clic sur un bouton du post : le post est désigné',
    onButton && onButton.el.classList.contains('unit-p1'), onButton && onButton.el.className);

  // Un post photo sans texte marqué : le texte de l'auteur, pas les boutons.
  const noMarker = load(`<!doctype html><html><body><div role="feed">
    <div role="article" aria-label="Publication">
      <a href="https://www.facebook.com/groups/g/posts/9/">hier</a>
      <div dir="auto">Poulet rôti au citron et au thym, prêt en 45 minutes</div>
      <img alt="grande-photo" src="https://scontent.test/poulet.jpg">
      <div role="button"><span dir="auto">J’aime · Commenter · Partager tout de suite</span></div>
    </div></div></body></html>`);
  const plain = await noMarker.window.__fcpCatch.readAt(
    noMarker.window.document.querySelector('img'), { x: 10, y: 10 });
  check('post sans texte marqué : le texte de l’auteur',
    plain.caption.startsWith('Poulet rôti'), plain.caption);
  check('post sans texte marqué : pas les libellés des boutons',
    !plain.caption.includes('Commenter'), plain.caption);

  process.exit(ko ? 1 : 0);
})();
