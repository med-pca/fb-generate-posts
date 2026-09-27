/**
 * Lit les publications présentes dans l'onglet Facebook.
 *
 * Injecté d'un bloc ; sa dernière expression est ce que
 * `chrome.scripting.executeScript` rapporte — d'où l'appel final.
 *
 * Le popup ne devine PAS quelle publication vous visez : ce fichier les
 * énumère, le popup les montre, vous choisissez. Deviner à partir de la
 * position à l'écran s'est trompé de post, et rien dans la page ne dit
 * laquelle intéresse l'utilisateur.
 *
 * Facebook renomme ses classes à chaque déploiement, donc rien ici n'en
 * dépend : le texte est cherché là où Facebook n'a pas bougé depuis des
 * années, et l'image est choisie sur sa taille à l'écran — ce qui survit à
 * un changement de balisage qu'aucun sélecteur ne suivrait.
 */
(() => {
  const norm = (s) => (s || '').replace(/ /g, ' ').replace(/[ \t]+/g, ' ').trim();
  // `innerText` rend le texte tel qu'il s'affiche, mais une chaîne vide sur
  // un nœud masqué : `textContent` prend alors le relais.
  const text = (el) => norm(el && (el.innerText || el.textContent));

  const MESSAGE_SELECTORS = [
    'div[data-ad-preview="message"]',
    'div[data-ad-comet-preview="message"]',
    '[data-testid="post_message"]',
  ];
  const IS_COMMENT = /comment|commentaire|تعليق|kommentar|comentario/i;
  const SEE_MORE = /^(see more|voir plus|afficher la suite|ver más|mehr anzeigen|عرض المزيد)$/i;
  const MIN_IMAGE_SIDE = 180;

  /** Les publications de la page, de haut en bas.
   *
   * Les commentaires sont eux aussi des `role="article"`, et ils sont
   * imbriqués dans la publication : on ne garde que les plus extérieurs qui
   * ne s'annoncent pas comme des commentaires. */
  function posts() {
    const all = Array.from(document.querySelectorAll('div[role="article"]'))
      .filter((el) => !IS_COMMENT.test(el.getAttribute('aria-label') || ''))
      .filter((el) => el.getBoundingClientRect().height >= 120);
    return all.filter((el) => !all.some((other) => other !== el && other.contains(el)));
  }

  function messageOf(post) {
    let best = '';
    for (const selector of MESSAGE_SELECTORS) {
      const found = text(post.querySelector(selector));
      if (found.length > best.length) best = found;
    }
    return best;
  }

  /** La photo de la publication, choisie sur sa taille réelle : avatars,
   * réactions et icônes sont petits, la pièce jointe ne l'est pas. */
  function imageOf(post) {
    let url = '';
    let widest = 0;
    for (const img of post.querySelectorAll('img')) {
      const src = img.currentSrc || img.src || '';
      if (!src.startsWith('https:')) continue;
      const box = img.getBoundingClientRect();
      if (Math.min(box.width, box.height) < MIN_IMAGE_SIDE) continue;
      const area = box.width * box.height;
      if (area > widest) { widest = area; url = src; }
    }
    return url;
  }

  function permalinkOf(post) {
    for (const a of post.querySelectorAll('a[href]')) {
      const href = a.href || '';
      if (/\/(posts|permalink|videos|photos)\/|story_fbid=|multi_permalinks=/.test(href)) {
        return href.split('?')[0];
      }
    }
    return location.href.split('?')[0];
  }

  const api = {
    /** De quoi reconnaître chaque publication dans le popup. */
    list() {
      const found = posts();
      return {
        blocked: /log in|connectez-vous|s.identifier|تسجيل الدخول/i
          .test(text(document.body).slice(0, 400)),
        posts: found.map((post, index) => {
          const message = messageOf(post) || text(post);
          const box = post.getBoundingClientRect();
          return {
            index,
            preview: message.slice(0, 120),
            hasImage: Boolean(imageOf(post)),
            // Ce qui est à l'écran en ce moment : le popup s'en sert pour
            // proposer d'abord la publication que vous regardez.
            onScreen: box.top < window.innerHeight && box.bottom > 0,
          };
        }),
      };
    },

    /** La publication choisie, lue en entier. */
    async read(index) {
      const post = posts()[index];
      if (!post) return { error: "cette publication n'est plus sur la page" };
      // « Voir plus » cache la fin d'un texte long : tant qu'on n'a pas
      // cliqué, la suite n'est pas dans le DOM. Uniquement dans CETTE
      // publication : déplier toute la page en toucherait d'autres.
      for (const el of post.querySelectorAll('[role="button"], div[tabindex="0"], span')) {
        const label = text(el);
        if (label && label.length < 30 && SEE_MORE.test(label)) el.click();
      }
      // Le dépliage passe par un rendu : lire dans la foulée rendrait le
      // texte encore tronqué.
      await new Promise((resolve) => setTimeout(resolve, 400));
      return {
        caption: messageOf(post),
        imageUrl: imageOf(post),
        facebookUrl: permalinkOf(post),
      };
    },
  };

  // Exposé pour la seconde injection, qui lit la publication choisie.
  window.__fcpCatch = api;
  return api.list();
})();
