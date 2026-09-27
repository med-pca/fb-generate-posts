/**
 * Lit les publications présentes dans l'onglet Facebook.
 *
 * Injecté d'un bloc ; sa dernière expression est ce que
 * `chrome.scripting.executeScript` rapporte — d'où l'appel final.
 *
 * Rien n'est deviné : ce fichier énumère ce qu'il trouve, le popup le
 * montre, vous choisissez. Deux structures très différentes coexistent chez
 * Facebook et il faut savoir lire les deux :
 *
 *   - un post de fil, dont le texte porte `data-ad-preview="message"` ;
 *   - une page photo (/photo/?fbid=...), une visionneuse où ce marqueur
 *     n'existe pas et où la légende est un bloc de texte parmi d'autres.
 *
 * Sur la seconde, on ne cherche pas à reconnaître la légende : on liste les
 * textes de la page et c'est vous qui désignez le bon.
 */
(() => {
  const norm = (s) => (s || '').replace(/ /g, ' ').replace(/[ \t]+/g, ' ').trim();
  // `innerText` rend le texte tel qu'il s'affiche, mais une chaîne vide sur
  // un nœud masqué : `textContent` prend alors le relais.
  const text = (el) => norm(el && (el.innerText || el.textContent));

  // Ces attributs de données ont survécu bien plus longtemps que n'importe
  // quelle classe.
  const MESSAGES = [
    'div[data-ad-preview="message"]',
    'div[data-ad-comet-preview="message"]',
    '[data-testid="post_message"]',
  ].join(',');
  // Facebook rend tout texte saisi par un utilisateur avec `dir="auto"`.
  const USER_TEXT = 'div[dir="auto"], span[dir="auto"]';
  const PERMALINK = /\/(posts|permalink|videos|photos|photo)\/|photo\.php|story_fbid=|multi_permalinks=|fbid=/;
  const IS_COMMENT = /comment|commentaire|تعليق|kommentar|comentario/i;
  const SEE_MORE = /^(see more|voir plus|afficher la suite|ver más|mehr anzeigen|عرض المزيد)$/i;
  // Au-delà, on remonterait dans la charpente de la page, plus dans le post.
  const MAX_CLIMB = 14;
  const MIN_IMAGE_SIDE = 180;
  // En deçà, c'est un nom, une date ou un libellé de bouton, pas une légende.
  const MIN_TEXT = 25;
  const MAX_CANDIDATES = 12;

  // Sur une page photo, l'identité de la publication est DANS la requête
  // (`?fbid=...&set=...`) : tout couper la ferait disparaître. On ne retire
  // donc que le pistage.
  const KEEP_PARAMS = ['fbid', 'set', 'story_fbid', 'multi_permalinks', 'id', 'v'];
  const cleanUrl = (href) => {
    let url;
    try {
      url = new URL(href, location.href);
    } catch {
      return '';
    }
    const kept = new URLSearchParams();
    for (const name of KEEP_PARAMS) {
      const value = url.searchParams.get(name);
      if (value) kept.set(name, value);
    }
    const query = kept.toString();
    return url.origin + url.pathname + (query ? `?${query}` : '');
  };

  const isBoundary = (el) =>
    /^(BODY|MAIN)$/.test(el.tagName) || /^(feed|main)$/.test(el.getAttribute('role') || '');

  const permalinkIn = (el) => {
    for (const a of el.querySelectorAll('a[href]')) {
      if (PERMALINK.test(a.href || '')) return cleanUrl(a.href);
    }
    return '';
  };

  /** La photo, choisie sur sa taille réelle : avatars, réactions et icônes
   * sont petits, la pièce jointe ne l'est pas. Ça survit à un changement de
   * balisage qu'aucun sélecteur ne suivrait. */
  const imageIn = (el) => {
    let url = '';
    let widest = 0;
    for (const img of el.querySelectorAll('img')) {
      const src = img.currentSrc || img.src || '';
      if (!src.startsWith('https:')) continue;
      const box = img.getBoundingClientRect();
      if (Math.min(box.width, box.height) < MIN_IMAGE_SIDE) continue;
      const area = box.width * box.height;
      if (area > widest) { widest = area; url = src; }
    }
    return url;
  };

  /** Le conteneur d'un post de fil, à partir de son texte : on remonte
   * jusqu'à l'ancêtre qui porte son lien ou sa grande image. */
  const containerOf = (message) => {
    let root = message;
    let parent = message.parentElement;
    let climbed = 0;
    while (parent && climbed < MAX_CLIMB && !isBoundary(parent)) {
      root = parent;
      if (permalinkIn(root) || imageIn(root)) break;
      parent = parent.parentElement;
      climbed += 1;
    }
    return root;
  };

  /** Les posts d'un fil, ancrés sur leur texte plutôt que sur
   * `role="article"` : Facebook ne le pose pas partout. Un commentaire
   * remonte au même conteneur que son post, donc les doublons se fondent. */
  const feedPosts = () => {
    const roots = [];
    for (const message of document.querySelectorAll(MESSAGES)) {
      const root = containerOf(message);
      if (roots.some((kept) => kept === root || kept.contains(root))) continue;
      for (let i = roots.length - 1; i >= 0; i -= 1) {
        if (root.contains(roots[i])) roots.splice(i, 1);
      }
      roots.push(root);
    }
    return roots;
  };

  /** Les textes d'une page dont on ne reconnaît pas la structure — une page
   * photo, typiquement. On garde les blocs les plus intérieurs : un ancêtre
   * recopierait le texte de ses enfants. */
  const textBlocks = () => {
    const all = Array.from(document.querySelectorAll(USER_TEXT))
      .filter((el) => !el.closest('[role="button"], nav, header, footer'))
      .filter((el) => text(el).length >= MIN_TEXT);
    const innermost = all.filter((el) => !all.some((other) => other !== el && el.contains(other)));
    const seen = new Set();
    const kept = [];
    for (const el of innermost) {
      const body = text(el);
      if (seen.has(body)) continue;
      seen.add(body);
      kept.push(el);
    }
    return kept.slice(0, MAX_CANDIDATES);
  };

  /** Ce que le popup propose : les posts si la page en montre, sinon les
   * textes qu'elle contient. `kind` dit comment les relire. */
  const candidates = () => {
    const posts = feedPosts();
    if (posts.length) return { kind: 'post', elements: posts };
    const article = Array.from(document.querySelectorAll('div[role="article"]'))
      .filter((el) => !IS_COMMENT.test(el.getAttribute('aria-label') || ''))
      .filter((el) => el.getBoundingClientRect().height >= 120);
    if (article.length) return { kind: 'post', elements: article };
    return { kind: 'text', elements: textBlocks() };
  };

  /** Le texte d'un post : le PREMIER message du conteneur. Les commentaires
   * viennent après dans l'ordre du document, et un commentaire bavard ne
   * doit pas l'emporter sur un post bref. */
  const messageOf = (post) => text(post.querySelector(MESSAGES)) || text(post).slice(0, 400);

  const captionOf = (kind, el) => (kind === 'post' ? messageOf(el) : text(el));

  const api = {
    /** De quoi reconnaître chaque proposition dans le popup. */
    list() {
      const { kind, elements } = candidates();
      // Sur une page photo, la grande image est celle de la visionneuse :
      // elle ne dépend pas du texte choisi.
      const pageImage = kind === 'text' ? imageIn(document) : '';
      return {
        kind,
        blocked: /log in|connectez-vous|s.identifier|تسجيل الدخول/i
          .test(text(document.body).slice(0, 400)),
        // De quoi comprendre une page où rien n'est trouvé, sans ouvrir la
        // console.
        seen: {
          messages: document.querySelectorAll(MESSAGES).length,
          articles: document.querySelectorAll('div[role="article"]').length,
          texts: document.querySelectorAll(USER_TEXT).length,
          images: document.querySelectorAll('img').length,
        },
        posts: elements.map((el, index) => {
          const box = el.getBoundingClientRect();
          return {
            index,
            preview: captionOf(kind, el).slice(0, 120),
            hasImage: Boolean(kind === 'post' ? imageIn(el) : pageImage),
            onScreen: box.top < window.innerHeight && box.bottom > 0,
          };
        }),
      };
    },

    /** La proposition choisie, lue en entier. */
    async read(index) {
      const { kind, elements } = candidates();
      const el = elements[index];
      if (!el) return { error: "cette publication n'est plus sur la page" };
      // « Voir plus » cache la fin d'un texte long : tant qu'on n'a pas
      // cliqué, la suite n'est pas dans le DOM. Sur un post, uniquement
      // dans celui-là ; sur une page photo, le bloc choisi et son voisinage.
      const scope = kind === 'post' ? el : el.parentElement || el;
      for (const button of scope.querySelectorAll('[role="button"], div[tabindex="0"], span')) {
        const label = text(button);
        if (label && label.length < 30 && SEE_MORE.test(label)) button.click();
      }
      // Le dépliage passe par un rendu : lire dans la foulée rendrait le
      // texte encore tronqué.
      await new Promise((resolve) => setTimeout(resolve, 400));
      const fresh = candidates().elements[index] || el;
      return {
        kind,
        caption: captionOf(kind, fresh),
        imageUrl: kind === 'post' ? imageIn(fresh) : imageIn(document),
        facebookUrl: (kind === 'post' ? permalinkIn(fresh) : '') || cleanUrl(location.href),
      };
    },
  };

  // Exposé pour la seconde injection, qui lit la proposition choisie.
  window.__fcpCatch = api;
  return api.list();
})();
