/* Ce que le vérificateur lit sur la page d'un post publié.
 *
 * Injecté dans l'onglet du post (chrome.scripting), il expose self.FPC :
 *   - inspect(task) : le post est-il là, et porte-t-il notre lien ?
 *   - remove()      : supprimer le post (le vérificateur est admin du groupe).
 *
 * Règle de prudence : on ne conclut « introuvable » que sur un message
 * explicite de Facebook (contenu indisponible). Une page qu'on ne sait pas
 * lire donne « injoignable » : on réessaie plus tard, on ne republie pas un
 * post qui est peut-être bien en ligne.
 */
(() => {
  if (self.FPC) return;

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  // Mêmes règles que l'extension de publication : Facebook remplace les
  // emojis par des images et stylise les lettres (𝐏 → P par NFKC).
  const lettersOnly = (s) =>
    String(s || '').normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
  const KEY_LENGTH = 40;

  /** Une URL réduite à ce qui l'identifie : hôte sans www, chemin sans
   * barre finale. Les paramètres (utm…) varient, on les ignore. */
  function normalizeUrl(raw) {
    try {
      const u = new URL(String(raw).trim());
      const path = u.pathname.replace(/\/+$/, '');
      return `${u.hostname.replace(/^www\./, '').toLowerCase()}${path.toLowerCase()}`;
    } catch {
      return '';
    }
  }

  /** Facebook fait passer les liens sortants par l.facebook.com/l.php?u=… */
  function unwrap(href) {
    try {
      const u = new URL(href, location.href);
      if (/(^|\.)facebook\.com$/.test(u.hostname) && u.pathname === '/l.php' && u.searchParams.get('u')) {
        return u.searchParams.get('u');
      }
      return u.href;
    } catch {
      return '';
    }
  }

  // Les voyelles arabes (« حذفُ ») et le tatweel ne changent pas un libellé :
  // on les retire avant de comparer, comme dans l'extension de publication.
  const unmark = (s) =>
    String(s || '').replace(/[\u064b-\u065f\u0670\u0640\u200c-\u200f]/g, '').replace(/[\u0622\u0623\u0625]/g, '\u0627');
  const textOf = (el) => unmark(el ? el.innerText || el.textContent || '' : '');

  const UNAVAILABLE = [
    /this content isn.?t available/i,
    /content isn.?t available right now/i,
    /the link you followed may be broken/i,
    /this page isn.?t available/i,
    /ce contenu n.?est pas disponible/i,
    /contenu (actuellement )?indisponible/i,
    /le lien que vous avez suivi est peut-être rompu/i,
    /هذا المحتوى غير متاح/,
    /المحتوى غير متوفر/,
  ];
  const PENDING = [
    /pending (approval|review)/i,
    /your post is pending/i,
    /en attente (d.?approbation|de validation|d.?examen)/i,
    /قيد المراجعة|في انتظار الموافقة/,
  ];
  const MORE_COMMENTS = [
    /view (more|previous|all) comments/i,
    /see more comments/i,
    /afficher (plus de|les) commentaires/i,
    /voir (plus de|les) commentaires/i,
    /عرض (المزيد من )?التعليقات/,
  ];

  function loginWall() {
    if (/\/login|\/checkpoint/.test(location.pathname)) return true;
    return Boolean(document.querySelector('form#login_form, form[action*="/login"] input[name="pass"]'));
  }

  /** La zone du post : sur un permalien, la région principale. */
  function postScope() {
    return document.querySelector('[role="main"]') || document.body;
  }

  /** Le post est-il affiché ? Reconnu par le début de son texte. */
  function findPost(scope, task) {
    const key = lettersOnly(task.postText || task.postTitle).slice(0, KEY_LENGTH);
    if (!key) return { found: Boolean(scope.querySelector('[role="article"]')), keyed: false };
    return { found: lettersOnly(textOf(scope)).includes(key), keyed: true };
  }

  /** Notre lien est-il posé, en lien cliquable ou en texte ? */
  function hasLink(scope, linkUrl) {
    const wanted = normalizeUrl(linkUrl);
    if (!wanted) return false;
    for (const a of scope.querySelectorAll('a[href]')) {
      if (normalizeUrl(unwrap(a.getAttribute('href'))) === wanted) return true;
    }
    // Un lien non transformé en ancre : on compare sans la ponctuation.
    return lettersOnly(textOf(scope)).includes(lettersOnly(wanted));
  }

  /** Les liens sortants de la page (hors Facebook), sans doublon. */
  function outboundLinks(scope) {
    const seen = new Set();
    for (const a of scope.querySelectorAll('a[href]')) {
      const target = unwrap(a.getAttribute('href'));
      try {
        const host = new URL(target).hostname;
        if (/(^|\.)(facebook\.com|fb\.com|fb\.me|messenger\.com|instagram\.com)$/.test(host)) continue;
      } catch {
        continue;
      }
      seen.add(normalizeUrl(target));
    }
    return [...seen].filter(Boolean);
  }

  /** Pourquoi le post est incomplet, en clair pour le journal : le premier
   * commentaire « . » posé mais jamais remplacé par le lien, ou aucun
   * commentaire du tout (photo et texte seuls). */
  const COMMENT_LABEL = /comment|commentaire|comentario|kommentar|تعليق/i;
  function incompleteReason(scope) {
    // Exactement « . » (le commentaire d'attente de l'extension de
    // publication), hors boutons : le menu « … » du post n'en est pas un.
    const placeholder = [...scope.querySelectorAll('div, span')].some(
      (el) => el.children.length === 0 && textOf(el).trim() === '.' && !el.closest('[role="button"], button'),
    );
    if (placeholder) return 'post incomplet : premier commentaire « . » jamais remplacé par le lien';
    const comments = [...scope.querySelectorAll('[role="article"][aria-label]')].filter((el) =>
      COMMENT_LABEL.test(el.getAttribute('aria-label') || ''),
    );
    if (!comments.length) return 'post incomplet : aucun commentaire vu sous le post (photo et texte seuls)';
    return '';
  }

  /** Les commentaires repliés : on les déplie une fois. */
  async function expandComments(scope) {
    const buttons = [...scope.querySelectorAll('[role="button"], button, span')].filter((el) =>
      MORE_COMMENTS.some((re) => re.test(textOf(el).trim())),
    );
    for (const b of buttons.slice(0, 3)) {
      b.click();
      await sleep(1500);
    }
    return buttons.length > 0;
  }

  async function inspect(task, { settleMs = 0 } = {}) {
    if (settleMs) await sleep(settleMs);
    if (loginWall()) return { outcome: 'unreachable', detail: 'le vérificateur n’est pas connecté à Facebook' };
    const page = textOf(document.body);
    if (UNAVAILABLE.some((re) => re.test(page))) {
      return { outcome: 'missing_post', detail: 'Facebook dit le contenu indisponible' };
    }
    const scope = postScope();
    const post = findPost(scope, task);
    if (!post.found) {
      if (PENDING.some((re) => re.test(page))) return { outcome: 'pending', detail: 'en attente de validation' };
      return {
        outcome: 'unreachable',
        detail: post.keyed ? 'page ouverte, mais le texte du post n’y est pas reconnu' : 'page ouverte, post non reconnu',
      };
    }
    if (!task.linkUrl) return { outcome: 'ok', detail: 'en ligne (post sans lien d’article)' };
    if (hasLink(scope, task.linkUrl)) return { outcome: 'ok', detail: 'en ligne, avec son lien' };
    // Les commentaires sont peut-être repliés : on déplie, puis on relit.
    if (await expandComments(scope)) {
      await sleep(2000);
      if (hasLink(postScope(), task.linkUrl)) return { outcome: 'ok', detail: 'en ligne, avec son lien' };
    }
    if (PENDING.some((re) => re.test(page))) return { outcome: 'pending', detail: 'en attente de validation' };
    // Ce qui est posé à la place (un autre article, un lien tronqué) : c'est
    // ce qui permet de comprendre l'erreur depuis le journal.
    const others = outboundLinks(postScope()).slice(0, 3);
    const why = others.length ? '' : incompleteReason(postScope());
    return {
      outcome: 'missing_link',
      detail:
        (why ? `${why} — ` : '') +
        `en ligne sans le lien attendu ${task.linkUrl}${others.length ? ` — liens vus : ${others.join(', ')}` : ' — aucun lien d’article sous le post'}`,
    };
  }

  /* ── Retrouver un post publié sans adresse ─────────────────────────── */

  // Les liens d'un post vers lui-même (sa date, son permalien).
  const PERMALINK = /\/groups\/[^/]+\/(posts|permalink)\/[^/?#]+|story_fbid=|\/posts\/pfbid/;

  /** Les blocs de publication du fil : `role="article"` hors commentaires,
   * ou, à défaut, les parents des messages. */
  function feedPosts() {
    const articles = [...document.querySelectorAll('[role="feed"] > *, [role="article"]')];
    return articles.filter((el) => !el.parentElement?.closest('[role="article"]'));
  }

  /** Facebook ne remplit le vrai lien d'une date qu'au survol. */
  function permalinkIn(container) {
    for (const a of container.querySelectorAll('a[href]')) {
      if (!PERMALINK.test(a.getAttribute('href') || '')) {
        a.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
        a.dispatchEvent(new FocusEvent('focus'));
      }
    }
    for (const a of container.querySelectorAll('a[href]')) {
      const href = a.getAttribute('href') || '';
      if (PERMALINK.test(href) && !/comment_id=/.test(href)) {
        try {
          const u = new URL(href, location.href);
          u.search = u.searchParams.get('story_fbid') ? `?story_fbid=${u.searchParams.get('story_fbid')}&id=${u.searchParams.get('id') || ''}` : '';
          return u.href;
        } catch {
          /* lien illisible : on passe au suivant */
        }
      }
    }
    return null;
  }

  /** Chercher le post dans le fil du groupe, par son texte (et son auteur
   * quand il est connu), en descendant quelques écrans. */
  async function locate(task, { settleMs = 0, scrolls = 8 } = {}) {
    if (settleMs) await sleep(settleMs);
    if (loginWall()) return { found: false, detail: 'le vérificateur n’est pas connecté à Facebook' };
    const key = lettersOnly(task.postText || task.postTitle).slice(0, KEY_LENGTH);
    if (!key) return { found: false, detail: 'post sans texte : impossible de le reconnaître dans le groupe' };
    const author = lettersOnly(task.author);
    for (let i = 0; i <= scrolls; i += 1) {
      const hit = feedPosts().find((el) => {
        const text = lettersOnly(textOf(el));
        return text.includes(key) && (!author || text.includes(author));
      });
      if (hit) {
        const url = permalinkIn(hit);
        if (url) return { found: true, url };
        return { found: false, detail: 'post trouvé dans le groupe, mais pas son lien' };
      }
      window.scrollBy(0, window.innerHeight * 1.5);
      await sleep(1800);
    }
    return { found: false, detail: 'post non trouvé dans les premiers écrans du groupe' };
  }

  /* ── Suppression ───────────────────────────────────────────────────── */

  const MENU_BUTTON = [
    /actions for this post/i,
    /actions pour cette publication/i,
    /إجراءات لهذا المنشور/,
    /plus d.?options|more options/i,
  ];
  const DELETE_ITEM = [
    /^delete post$/i,
    /^remove post$/i,
    /^move to (trash|recycle bin)$/i,
    /^supprimer (la publication|le post)$/i,
    /^retirer (la publication|le post)$/i,
    /^déplacer vers la corbeille$/i,
    /^حذف المنشور$/,
    /^ازالة المنشور$/,
    /^نقل إلى سلة المهملات$/,
  ];
  const CONFIRM = [/^delete$/i, /^remove$/i, /^confirm$/i, /^move$/i, /^supprimer$/i, /^retirer$/i, /^confirmer$/i, /^déplacer$/i, /^حذف$/, /^ازالة$/, /^تأكيد$/, /^نقل$/];

  const label = (el) => unmark(el.getAttribute('aria-label') || textOf(el)).trim();

  async function waitFor(find, timeoutMs = 5000) {
    const end = Date.now() + timeoutMs;
    while (Date.now() < end) {
      const hit = find();
      if (hit) return hit;
      await sleep(250);
    }
    return null;
  }

  async function remove() {
    const scope = postScope();
    const menuButton = [...scope.querySelectorAll('[aria-label][role="button"], [aria-haspopup="menu"]')].find((el) =>
      MENU_BUTTON.some((re) => re.test(unmark(el.getAttribute('aria-label')))),
    );
    if (!menuButton) return { deleted: false, detail: 'menu du post introuvable' };
    menuButton.click();
    const item = await waitFor(() =>
      [...document.querySelectorAll('[role="menuitem"]')].find((el) => DELETE_ITEM.some((re) => re.test(label(el)))),
    );
    if (!item) {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      return { deleted: false, detail: 'pas d’option de suppression : le vérificateur est-il administrateur du groupe ?' };
    }
    item.click();
    const confirm = await waitFor(() => {
      const dialogs = [...document.querySelectorAll('[role="dialog"]')];
      for (const d of dialogs.reverse()) {
        const b = [...d.querySelectorAll('[role="button"], button')].find(
          (el) => CONFIRM.some((re) => re.test(label(el))) && el.getAttribute('aria-disabled') !== 'true',
        );
        if (b) return b;
      }
      return null;
    });
    if (!confirm) return { deleted: false, detail: 'fenêtre de confirmation introuvable' };
    confirm.click();
    await sleep(3000);
    return { deleted: true, detail: 'supprimé' };
  }

  self.FPC = { inspect, remove, locate, normalizeUrl, unwrap, lettersOnly, hasLink };
})();
