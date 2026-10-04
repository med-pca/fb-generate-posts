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
  /** Le texte tel qu'il s'affiche, emojis compris.
   *
   * Facebook rend les emojis en `<img alt="👇">` : `innerText` les laisse
   * tomber, et la légende repart amputée de sa ponctuation expressive. On
   * parcourt donc les nœuds, en rendant l'`alt` des images et en ouvrant
   * une ligne à chaque bloc. */
  const text = (el) => {
    if (!el) return '';
    let out = '';
    const walk = (node) => {
      for (const child of node.childNodes) {
        if (child.nodeType === 3) {
          out += child.nodeValue;
        } else if (child.nodeType === 1) {
          if (child.tagName === 'IMG') {
            out += child.getAttribute('alt') || '';
          } else if (child.tagName === 'BR') {
            out += '\n';
          } else {
            const display = getComputedStyle(child).display || '';
            const block = /block|flex|grid|list-item|table/.test(display);
            if (block) out += '\n';
            walk(child);
            if (block) out += '\n';
          }
        }
      }
    };
    walk(el);
    const built = norm(out).replace(/ *\n */g, '\n').replace(/\n{3,}/g, '\n\n');
    return built || norm(el.innerText || el.textContent);
  };

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
  // Les libellés de Facebook suivent la langue du compte. On les compare
  // « repliés » : sans accents, sans voyelles arabes ni tatweel, une seule
  // forme de alef / ya / ta marbuta. Sans ça, « عرض المزيد » écrit avec ses
  // voyelles, ou un compte en espagnol, n'étaient pas reconnus.
  const fold = (s) =>
    String(s || '')
      .normalize('NFKD')
      .replace(/[\u0300-\u036f\u064b-\u065f\u0670\u0640\u200c-\u200f\u202a-\u202e]/g, '')
      .replace(/[\u0622\u0623\u0625\u0671]/g, '\u0627')
      .replace(/\u0649/g, '\u064a')
      .replace(/\u0629/g, '\u0647')
      .replace(/\u2026/g, '...')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
  const phrases = (list, exact = false) => {
    const folded = list.map(fold);
    return {
      test: (value) => {
        const f = fold(value).replace(/\.+$/, '');
        return Boolean(f) && (exact ? folded.includes(f) : folded.some((p) => f.includes(p)));
      },
    };
  };
  const IS_COMMENT = phrases(['comment', 'commentaire', 'comentario', 'kommentar', 'commento', 'yorum', 'komentarz', 'تعليق', 'رد']);
  const SEE_MORE = phrases(
    ['see more', 'voir plus', 'afficher la suite', 'en voir plus', 'ver más', 'ver mais', 'mehr anzeigen',
      'altro', 'mostra altro', 'devamını gör', 'zobacz więcej', 'عرض المزيد', 'رؤية المزيد', 'المزيد'],
    true,
  );
  // L'en-tête d'un groupe (« Private group · 311.1K members ») : jamais une
  // légende, même quand c'est le seul texte proche du clic.
  const GROUP_META = /\b(private|public) group\b|\bgroupe (privé|public)\b|\bgrupo (privado|público)\b|\d[\d.,\s]*[kKmM]?\s*(members|membres|miembros|membros|Mitglieder)\b|مجموعة (خاصة|عامة)|[\d.,]+\s*(ألف\s*)?عضو/i;
  const isGroupMeta = (value) => GROUP_META.test(String(value || '')) && String(value || '').length < 160;
  // La page d'une photo seule (visionneuse) : là, sans post reconnu, le texte
  // le plus proche est bien sa légende. Ailleurs (fil d'un groupe), cliquer
  // hors d'un post ne doit rien désigner.
  const PHOTO_PAGE = /\/photo(\.php|s?\/)|[?&]fbid=/;
  // Au-delà, on remonterait dans la charpente de la page, plus dans le post.
  const MAX_CLIMB = 14;
  // L'élargissement jusqu'au bloc complet du post (texte + photo) : plus
  // profond que la première remontée, mais borné par les posts voisins.
  const MAX_EXPAND = 25;
  // Ce que Facebook pose sur une publication entière du fil.
  const POST_UNIT = '[aria-posinset], [data-pagelet^="FeedUnit"]';
  const MIN_IMAGE_SIDE = 180;
  // Plancher du repli : en deçà, c'est une icône.
  const FALLBACK_IMAGE_SIDE = 90;
  // En deçà, c'est un nom, une date ou un libellé de bouton, pas une légende.
  const MIN_TEXT = 25;
  const MAX_CANDIDATES = 12;
  // Ce qui appartient à l'interface de Facebook, jamais à une publication.
  const CHROME =
    '[role="button"], [role="navigation"], [role="menu"], [role="menuitem"],' +
    '[role="banner"], [role="complementary"], [role="listbox"], [role="tablist"],' +
    'nav, header, footer';
  const LOGIN_WORDS = phrases(['log in', 'connectez-vous', "s'identifier", 'se connecter', 'iniciar sesion', 'anmelden', 'تسجيل الدخول']);
  const NOTIFICATIONS = phrases(['notification', 'notificacion', 'benachrichtigung', 'notifica', 'bildirim', 'powiadomien', 'إشعار', 'اشعار', 'الإشعارات']);

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
  /** Toutes les images d'un élément, avec leur taille à l'écran. Les fonds
   * CSS comptent : la visionneuse photo n'expose pas toujours un `<img>`. */
  const imagesIn = (el) => {
    const found = [];
    for (const img of el.querySelectorAll('img')) {
      const src = img.currentSrc || img.src || '';
      if (!src.startsWith('https:')) continue;
      const box = img.getBoundingClientRect();
      found.push({ src, box, side: Math.min(box.width, box.height), area: box.width * box.height });
    }
    for (const node of el.querySelectorAll('[style*="background-image"]')) {
      const match = /url\(["']?(https:[^"')]+)/.exec(getComputedStyle(node).backgroundImage || '');
      if (!match) continue;
      const box = node.getBoundingClientRect();
      found.push({ src: match[1], box, side: Math.min(box.width, box.height), area: box.width * box.height });
    }
    return found.sort((a, b) => b.area - a.area);
  };

  /** La photo de la publication, choisie sur sa taille réelle : avatars,
   * réactions et icônes sont petits, la pièce jointe ne l'est pas.
   *
   * Si rien n'atteint le seuil, on retient quand même la plus grande au
   *-dessus d'un plancher : mieux vaut une image à vérifier dans l'aperçu
   * que pas d'image du tout. */
  const imageIn = (el) => {
    const images = imagesIn(el);
    const big = images.find((image) => image.side >= MIN_IMAGE_SIDE);
    return (big || images.find((image) => image.side >= FALLBACK_IMAGE_SIDE) || {}).src || '';
  };

  /** Le premier ancêtre du texte qui porte un lien ou une image : de quoi
   * reconnaître le post, et fondre un commentaire marqué dans son post. Ce
   * n'est pas encore le post entier — chez Facebook, l'en-tête et le texte
   * sont d'un côté, la photo d'un autre. */
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

  const isPostArticle = (el) =>
    el.getAttribute('role') === 'article' && !IS_COMMENT.test(el.getAttribute('aria-label') || '');

  /** Le post entier, à partir de son premier conteneur : on élargit tant que
   * l'on n'englobe pas le conteneur d'un AUTRE post. S'arrêter plus tôt
   * laissait la photo dehors — c'était « texte relevé, aucune image ». */
  const expand = (root, others) => {
    let climbed = 0;
    while (climbed < MAX_EXPAND) {
      if (root.matches(POST_UNIT) || isPostArticle(root)) break;
      const parent = root.parentElement;
      if (!parent || isBoundary(parent)) break;
      if (others.some((other) => other !== root && !root.contains(other) && parent.contains(other))) break;
      root = parent;
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
    return roots.map((root) => expand(root, roots));
  };

  /** Les textes d'une page dont on ne reconnaît pas la structure — une page
   * photo, typiquement. On garde les blocs les plus intérieurs : un ancêtre
   * recopierait le texte de ses enfants. */
  const textBlocks = () => {
    const all = Array.from(document.querySelectorAll(USER_TEXT))
      // La barre du haut, les menus et surtout le panneau de notifications
      // sont pleins de phrases : sans les écarter, « John McCormick a
      // signalé un contenu… » se retrouve proposé comme légende.
      .filter((el) => !el.closest(CHROME))
      .filter((el) => !NOTIFICATIONS.test(el.closest('[aria-label]')?.getAttribute('aria-label') || ''))
      .filter((el) => text(el).length >= MIN_TEXT)
      .filter((el) => !isGroupMeta(text(el)));
    const innermost = all.filter((el) => !all.some((other) => other !== el && el.contains(other)));
    const seen = new Set();
    const kept = [];
    for (const el of innermost) {
      const body = text(el);
      if (seen.has(body)) continue;
      seen.add(body);
      kept.push(el);
    }
    // Ce qu'on regarde d'abord : un bloc à l'écran a bien plus de chances
    // d'être la légende visée qu'un texte resté hors champ.
    const visible = (el) => {
      const box = el.getBoundingClientRect();
      return box.top < window.innerHeight && box.bottom > 0 ? 0 : 1;
    };
    return kept.sort((a, b) => visible(a) - visible(b)).slice(0, MAX_CANDIDATES);
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
  const inComment = (el) => {
    const article = el.closest('div[role="article"]');
    return Boolean(article && IS_COMMENT.test(article.getAttribute('aria-label') || ''));
  };

  /** Sans texte marqué (post photo, partage), le premier bloc de texte
   * saisi par l'auteur : ni l'interface, ni un commentaire, ni un nom. Le
   * texte brut du conteneur ramenait « J'aime · Commenter · Partager ». */
  const authorTextIn = (post) => {
    const blocks = Array.from(post.querySelectorAll(USER_TEXT))
      .filter((el) => !el.closest(CHROME) && !inComment(el))
      .filter((el) => text(el).length >= MIN_TEXT);
    const innermost = blocks.filter((el) => !blocks.some((other) => other !== el && el.contains(other)));
    return innermost.length ? text(innermost[0]) : '';
  };

  const messageOf = (post) => text(post.querySelector(MESSAGES)) || authorTextIn(post);

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
        // Le mur de connexion se reconnaît à son formulaire, pas à ses mots :
        // chercher « تسجيل الدخول » dans le texte de la page bloquait des
        // comptes arabes pourtant connectés.
        // Les mots ne comptent que sur une page vide : un compte connecté
        // voit toujours des publications.
        blocked:
          /\/login|\/checkpoint/.test(location.pathname) ||
          Boolean(document.querySelector('form#login_form, form[action*="/login"], input[name="pass"]')) ||
          (!elements.length && LOGIN_WORDS.test(text(document.body).slice(0, 400))),
        // De quoi comprendre une page où rien n'est trouvé, sans ouvrir la
        // console.
        seen: {
          messages: document.querySelectorAll(MESSAGES).length,
          articles: document.querySelectorAll('div[role="article"]').length,
          texts: document.querySelectorAll(USER_TEXT).length,
          images: document.querySelectorAll('img').length,
          // Les trois plus grandes de la page, retenues ou non : de quoi
          // comprendre un « aucune image » sans ouvrir la console.
          biggest: imagesIn(document)
            .slice(0, 3)
            .map((image) => `${Math.round(image.side)}px ${image.src.slice(0, 60)}`),
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

    /** Ce que désigne un élément de la page — celui qu'on survole ou sur
     * lequel on clique : le post qui le contient, ou, sur une page photo, le
     * bloc de texte visé. `null` si rien d'exploitable. */
    pickAt(target) {
      if (!target || target.nodeType !== 1 || target.closest(CHROME + ', [data-fcp-ui]')) {
        // Un clic sur un bouton du post (J'aime…) désigne quand même le post.
        const post = target?.nodeType === 1 && feedPosts().find((el) => el.contains(target));
        return post ? { kind: 'post', el: post } : null;
      }
      const post = feedPosts().find((el) => el.contains(target));
      if (post) return { kind: 'post', el: post };
      let article = target.closest('div[role="article"]');
      while (article && !isPostArticle(article)) {
        article = article.parentElement?.closest('div[role="article"]') || null;
      }
      if (article && article.getBoundingClientRect().height >= 120) {
        return { kind: 'post', el: article };
      }
      // Page photo : le bloc de texte cliqué, sinon le premier de la page —
      // on a cliqué sur la photo, la légende reste à vérifier dans le popup.
      const block = target.closest(USER_TEXT);
      if (!PHOTO_PAGE.test(location.href)) {
        // Fil d'un groupe ou d'une page : un clic hors d'une publication
        // (couverture, en-tête, menu) ne désigne rien. Prendre le premier
        // texte venu donnait « Private group · 311.1K members ».
        return null;
      }
      if (block && text(block).length >= 15 && !isGroupMeta(text(block))) return { kind: 'text', el: block };
      const [first] = textBlocks();
      return first ? { kind: 'text', el: first } : null;
    },

    /** La publication désignée par un clic, lue en entier. Le point du clic
     * choisit l'image : cliquer sur une photo d'un post à plusieurs photos
     * prend celle-là. */
    async readAt(target, point) {
      const picked = api.pickAt(target);
      if (!picked) return { error: 'Ce n’est pas une publication : cliquez sur le texte ou la photo d’un post (pas sur la couverture ni l’en-tête du groupe)' };
      return readElement(picked.kind, picked.el, point);
    },

    /** La proposition choisie, lue en entier. */
    async read(index) {
      const { kind, elements } = candidates();
      const el = elements[index];
      if (!el) return { error: "cette publication n'est plus sur la page" };
      return readElement(kind, el, null, index);
    },
  };

  /** L'image sous le point cliqué, si elle est assez grande pour être une
   * photo et pas une icône. */
  const imageAtPoint = (scope, point) => {
    if (!point) return '';
    const hit = imagesIn(scope).find(
      (image) =>
        image.side >= FALLBACK_IMAGE_SIDE &&
        point.x >= image.box.left && point.x <= image.box.right &&
        point.y >= image.box.top && point.y <= image.box.bottom,
    );
    return hit ? hit.src : '';
  };

  /** Lit une proposition : texte déplié, image, lien. `point` (un clic)
   * désigne l'image voulue ; `index` (la liste du popup) permet de
   * retrouver la proposition si Facebook a remplacé ses nœuds. */
  const readElement = async (kind, el, point, index) => {
    // « Voir plus » cache la fin d'un texte long : tant qu'on n'a pas
    // cliqué, la suite n'est pas dans le DOM. Sur un post, uniquement dans
    // celui-là ; sur une page photo, le bloc choisi et son voisinage.
    const unfold = kind === 'post' ? el : el.parentElement || el;
    for (const button of unfold.querySelectorAll('[role="button"], div[tabindex="0"], span')) {
      const label = text(button);
      if (label && label.length < 30 && SEE_MORE.test(label)) button.click();
    }
    // Le dépliage passe par un rendu : lire dans la foulée rendrait le
    // texte encore tronqué.
    await new Promise((resolve) => setTimeout(resolve, 400));
    let fresh = el;
    if (index !== undefined) fresh = candidates().elements[index] || el;
    else if (!el.isConnected && point) {
      fresh = api.pickAt(document.elementFromPoint(point.x, point.y))?.el || el;
    }
    const scope = kind === 'post' ? fresh : document;
    return {
      kind,
      caption: captionOf(kind, fresh),
      imageUrl: imageAtPoint(scope, point) || imageIn(scope),
      facebookUrl: (kind === 'post' ? permalinkIn(fresh) : '') || cleanUrl(location.href),
    };
  };

  // Exposé pour la seconde injection, qui lit la proposition choisie.
  window.__fcpCatch = api;
  return api.list();
})();
