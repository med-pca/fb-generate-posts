/* Where things are on a Facebook page.
 *
 * Direct port of the JavaScript that app/facebook/composer.py injected over
 * CDP: every lookup here was checked against the live page, so the comments
 * explaining *why* a selector looks the way it does are kept as they were.
 * The only change is that these are real functions now instead of strings
 * interpolated in Python.
 */
(() => {
  'use strict';
  const F = (globalThis.FBX = globalThis.FBX || {});
  if (F.dom) return; // the manifest injects once; the fallback injection may repeat

  const norm = (s) => (s || '').replace(/\s+/g, ' ').trim();
  const lower = (s) => norm(s).toLowerCase();

  // Profiles do not share one interface language: the same group shows
  // "Write something..." to one account, "Exprimez-vous..." to another and
  // "اكتب شيئًا..." to a third. Two things broke non-French/English profiles:
  //   - the labels were compared character for character, and Arabic writes
  //     vowel marks the patterns did not have (« شيئًا » is not « شيئا ») --
  //     the composer was never found and nothing started;
  //   - languages missing from the lists simply never matched.
  // So every label is FOLDED before comparing (no accents, no Arabic vowel
  // marks or tatweel, one form of alef / ya / ta marbuta, lower case), the
  // lists cover the usual languages, and the steps fall back on page
  // structure when no label matches at all (see steps.js).
  const fold = (s) =>
    String(s || '')
      .normalize('NFKD')
      .replace(/[\u0300-\u036f\u064b-\u065f\u0670\u0640\u200c-\u200f\u202a-\u202e]/g, '')
      .replace(/[\u0622\u0623\u0625\u0671]/g, '\u0627')
      .replace(/\u0649/g, '\u064a')
      .replace(/\u0629/g, '\u0647')
      .replace(/[\u2019\u2018`´]/g, "'")
      .replace(/\u2026/g, '...')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();

  // A label CONTAINS one of these phrases.
  const phrases = (list) => {
    const folded = list.map(fold);
    const test = (s) => {
      const f = fold(s);
      return Boolean(f) && folded.some((p) => f.includes(p));
    };
    return { test, includes: test, list: folded };
  };
  // A label IS one of these words (a button reading "Post", not "Posts").
  const exactly = (list) => {
    const folded = list.map(fold);
    const test = (s) => folded.includes(fold(s));
    return { test, includes: test, list: folded };
  };

  const COMPOSER_ENTRY = phrases([
    'write something', "what's on your mind", 'anything on your mind', 'create a public post',
    'exprimez-vous', 'écrivez quelque chose', 'quoi de neuf', 'créer une publication publique',
    'escribe algo', 'qué estás pensando', 'escreva algo', 'no que você está pensando',
    'schreib etwas', 'was machst du gerade', 'scrivi qualcosa', 'a cosa stai pensando',
    'bir şeyler yaz', 'napisz coś', 'schrijf iets',
    'اكتب شيئا', 'اكتب شيئاً', 'بم تفكر', 'ماذا يدور في ذهنك', 'انشئ منشورا', 'إنشاء منشور عام',
  ]);
  const SUBMIT_LABELS = exactly([
    'post', 'publier', 'publicar', 'posten', 'veröffentlichen', 'pubblica', 'paylaş', 'opublikuj', 'plaatsen',
    'نشر', 'انشر', 'نشر المنشور',
  ]);
  const COMMENT_BUTTON_LABELS = exactly([
    'comment', 'leave a comment', 'write a comment', 'commenter', 'écrire un commentaire', 'comentar',
    'kommentieren', 'commenta', 'yorum yap', 'skomentuj', 'reageren',
    'تعليق', 'علق', 'اكتب تعليقا', 'اكتب تعليقًا',
  ]);
  const COMMENT_FIELD = phrases([
    'comment', 'commentaire', 'comentario', 'comentar', 'kommentar', 'commento', 'yorum', 'komentarz', 'reactie',
    'تعليق', 'علق',
  ]);
  const CREATE_POST = phrases([
    'create post', 'créer une publication', 'crear publicación', 'criar publicação', 'beitrag erstellen',
    'crea post', 'gönderi oluştur', 'utwórz post', 'bericht maken',
    'إنشاء منشور', 'انشاء منشور',
  ]);
  const PENDING = phrases([
    'pending', 'approval', 'en attente', 'pendiente', 'pendente', 'ausstehend', 'in attesa', 'onay bekliyor',
    'قيد المراجعة', 'بانتظار', 'في انتظار', 'بانتظار الموافقة',
  ]);
  const BLOCKED = phrases([
    "you can't post", "couldn't post", 'try again later', 'temporarily blocked',
    'vous ne pouvez pas publier', 'impossible de publier', 'réessayez plus tard', 'temporairement bloqu', 'nous avons limit',
    'no puedes publicar', 'inténtalo de nuevo más tarde', 'vorübergehend gesperrt',
    'لا يمكنك النشر', 'تعذر النشر', 'حاول مرة أخرى لاحقا', 'محظور مؤقتا', 'تم حظرك',
  ]);
  const PHOTO_LABELS = phrases([
    'photo/video', 'photo/vidéo', 'foto/video', 'foto/vídeo', 'foto/vidéo', 'fotoğraf/video', 'zdjęcie/film',
    'صورة/فيديو', 'صورة / فيديو',
  ]);
  const ATTACHMENT_CONTROLS = phrases([
    'remove post attachment', 'edit media', 'remove photo', 'edit all', 'add photos/videos',
    'supprimer la pièce jointe', 'modifier le média', 'supprimer la photo', 'tout modifier',
    'eliminar archivo adjunto', 'editar todo', 'quitar foto',
    'إزالة مرفق', 'ازالة المرفق', 'تعديل الكل', 'تعديل الوسائط', 'إزالة الصورة',
  ]);
  const REMOVE_ATTACHMENT = phrases([
    'remove post attachment', 'remove photo', 'supprimer la pièce jointe', 'supprimer la photo',
    'eliminar archivo adjunto', 'quitar foto', 'إزالة مرفق', 'ازالة المرفق', 'إزالة الصورة',
  ]);
  const COMMENT_MENU = phrases([
    'comment options', 'more options', 'edit or delete', 'options du commentaire', 'modifier ou supprimer',
    "plus d'options", 'opciones', 'optionen', 'opzioni', 'خيارات', 'مزيد من الخيارات', 'تعديل او حذف',
  ]);
  const EDIT_ITEM = exactly(['edit', 'modifier', 'editar', 'bearbeiten', 'modifica', 'düzenle', 'edytuj', 'تعديل']);
  const DELETE_ITEM = exactly(['delete', 'supprimer', 'eliminar', 'löschen', 'elimina', 'sil', 'usuń', 'حذف']);
  const NEW_COMMENT_BOX = phrases([
    'comment as', 'write a comment', 'write a public comment', 'écriv', 'commenter en tant',
    'escribe un comentario', 'comentar como', 'kommentieren als', 'scrivi un commento',
    'اكتب تعليقا', 'التعليق باسم', 'التعليق بصفتك', 'علق باسم',
  ]);
  // Used to CUT the name out of the label, so it stays a real pattern; the
  // label is folded first, which is why the Arabic forms carry no vowel marks.
  const AUTHOR_LABEL = /^(?:comment as|commenter en tant que|comentar como|kommentieren als|commenta come|التعليق باسم|التعليق بصفتك|علق باسم) /i;
  const COMMENT_ARTICLE = phrases(['comment', 'commentaire', 'comentario', 'kommentar', 'commento', 'yorum', 'komentarz', 'تعليق', 'رد']);

  const COMPOSER_FILE_INPUT = 'div[role="dialog"] input[type="file"]';

  // Facebook cuts a long post off behind a "See more" link, so the full text is
  // simply not in the page. Looking for all of it finds nothing -- a
  // 473-character post was published fine and then reported missing.
  const NEEDLE_LENGTH = 100;
  // A link is rendered without its scheme and a long one is cut short, so a
  // comment carrying a URL is looked up on a shorter prefix.
  const COMMENT_NEEDLE_LENGTH = 50;
  const URL_IN_TEXT = /https?:\/\/([^\s/]+)/i;

  const needle = (content) => norm(content).slice(0, NEEDLE_LENGTH).toLowerCase();

  // Retrouver un post par son texte, sans se laisser piéger par ce que
  // Facebook change à l'affichage : les emojis deviennent des images (absentes
  // du texte lu), les caractères stylisés (𝐏𝐋𝐄𝐀𝐒𝐄) varient, la ponctuation
  // et les espaces bougent. On ne compare que les lettres et les chiffres,
  // après normalisation (NFKC ramène 𝐏 à P).
  const POST_KEY_LENGTH = 60;
  const lettersOnly = (s) =>
    String(s || '').normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
  const postKey = (content) => lettersOnly(content).slice(0, POST_KEY_LENGTH);

  // What to look for on the page to tell that a comment landed. A link is not
  // shown as it was typed: Facebook drops the scheme and elides the middle of
  // the path, so the URL itself is never on the page to be found. The host
  // survives that treatment, and an emoji beside it does not (it becomes an
  // image), which leaves the host as the one dependable part of a link comment.
  const commentNeedle = (comment) => {
    const text = norm(comment);
    const host = URL_IN_TEXT.exec(text);
    if (host) return host[1].toLowerCase().slice(0, COMMENT_NEEDLE_LENGTH);
    return text.slice(0, COMMENT_NEEDLE_LENGTH).toLowerCase();
  };

  const centre = (el) => {
    const r = el.getBoundingClientRect();
    return r.width && r.height ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : null;
  };
  const area = (el) => {
    const r = el.getBoundingClientRect();
    return r.width * r.height;
  };
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };
  const dialogs = () => Array.from(document.querySelectorAll('div[role="dialog"]'));

  // Facebook keeps other panels in role="dialog" too -- an open notifications
  // tray is one, and scanning every dialog then turns up its buttons instead of
  // the composer's. Narrow to the dialogs that look like the composer, and only
  // fall back to all of them when none does.
  const composerDialogs = () => {
    const all = dialogs();
    const mine = all.filter(
      (d) => CREATE_POST.test(norm(d.innerText).slice(0, 60))
        || d.querySelector('div[role="textbox"], div[contenteditable="true"]'),
    );
    return mine.length ? mine : all;
  };

  // Some groups open a composer whose FIRST editable field is an "Add groups"
  // search box for cross-posting -- it sits before the post body in the DOM.
  // Typing the post into it opens a group typeahead that covers the Post
  // button, so the click lands on a suggestion and the post never goes out.
  // Pick the body by excluding the search field, then by size: the body is the
  // big one.
  const postBox = (d) => {
    const boxes = Array.from(d.querySelectorAll('div[role="textbox"], div[contenteditable="true"]'));
    const labelled = (b) => `${b.getAttribute('aria-label') || ''} ${b.getAttribute('aria-placeholder') || ''}`;
    const body = boxes.filter((b) => !/add group|search|rechercher|ajouter des groupes|buscar|suchen|cerca|بحث|اضافة مجموعات|إضافة مجموعات/i.test(labelled(b)));
    return (body.length ? body : boxes).sort((x, y) => area(y) - area(x))[0] || null;
  };

  // Whose posts this run may touch. Two accounts publishing the same article to
  // the same group within seconds is normal here, and matching on text alone
  // would let one profile read the other's post id and comment under it. Empty
  // means "not known yet", and then any post matches.
  let author = '';
  const setAuthor = (name) => { author = lower(name); };
  const getAuthor = () => author;
  // Folded on both sides: a name read from a folded label (« Hélène » →
  // « helene ») must still match the page as written.
  const byUs = (c) => !author || fold(c.innerText).includes(fold(author));

  // Where one post lives on the page. This build of Facebook does NOT wrap
  // group posts in div[role="article"] (only notifications use it), so the
  // feed's own children are the posts; other builds and permalink pages fall
  // back to articles, and a single-post page to the page itself.
  const postContainers = () => {
    const feed = document.querySelector('[role="feed"]');
    if (feed) return Array.from(feed.children);
    const arts = Array.from(document.querySelectorAll('div[role="article"]'));
    const outer = arts.filter((a) => !arts.some((b) => b !== a && b.contains(a)));
    return outer.length ? outer : [document.body];
  };

  const findPost = (text) => {
    const wanted = postKey(text);
    if (!wanted) return null;
    // Newest first, so the first container holding the text is the new post.
    const hit = postContainers().find((c) => lettersOnly(c.innerText).includes(wanted) && byUs(c));
    if (hit) return hit;
    // La page d'UN post (/posts/…) : Facebook y affiche aussi un fil (posts
    // suggérés, commentaires), dont aucun enfant n'est notre post. Ne chercher
    // le reste de la page que « s'il n'y a pas de fil » ratait donc le post
    // qu'on venait d'ouvrir — et avec lui son champ de commentaire. Sur une
    // telle page, la zone principale est le post.
    const page = document.querySelector('[role="main"]') || document.body;
    const single = onePostPage() || !document.querySelector('[role="feed"]');
    return single && lettersOnly(page.innerText).includes(wanted) ? page : null;
  };

  const occurrences = (haystack, wanted) => {
    let n = 0;
    for (let i = haystack.indexOf(wanted); i !== -1; i = haystack.indexOf(wanted, i + wanted.length)) n += 1;
    return n;
  };

  // Clicks need the element on screen: an element below the fold is measured
  // outside the viewport, and hover-only controls never appear.
  const show = (el) => {
    el.scrollIntoView({ block: 'center', inline: 'nearest' });
    const c = centre(el);
    if (!c) return null;
    const inView = c.x > 0 && c.y > 0 && c.x < window.innerWidth && c.y < window.innerHeight;
    return inView ? c : null;
  };

  const pickBox = (root) => {
    const boxes = Array.from(root.querySelectorAll('div[role="textbox"], div[contenteditable="true"]'));
    const labelled = boxes.find((b) => COMMENT_FIELD.test(
      b.getAttribute('aria-label') || b.getAttribute('aria-placeholder') || norm(b.innerText),
    ));
    return labelled || (boxes.length === 1 ? boxes[0] : null);
  };

  // Are we on one post's own page? The URL is the dependable test: this build
  // renders a role="feed" on a permalink page too, so keying off that made the
  // comment field -- present, and a sibling of the post rather than a child --
  // impossible to reach.
  const onePostPage = () => /\/posts\/|\/permalink\/|story_fbid=/.test(location.href);

  const commentBox = (post) => {
    const inside = pickBox(post);
    if (inside) return inside;
    // A single post's page cannot confuse us with a neighbour's field.
    return onePostPage() ? pickBox(document) : null;
  };

  // Anything the comment field would send besides text -- the comment must stay
  // text-only even when the post itself carries an image.
  const boxAttachment = (box) => {
    const form = box.closest('form') || box.parentElement || box;
    if (form.querySelector('img[src^="blob:"]')) return true;
    return Array.from(form.querySelectorAll('[role="button"], button')).some(
      (el) => /remove (photo|attachment|image)|supprimer/i.test(el.getAttribute('aria-label') || ''),
    );
  };

  // Facebook labels each comment article ("Comment by <name>"), which is what
  // tells a comment apart from the post -- and here they can carry the SAME
  // text, since the post and its first comment are both the description.
  // Whatever the language, a comment carries a link to itself with
  // comment_id= in it (its timestamp): that recognises the comments whose
  // label is in a language the list does not know.
  const commentArticles = () => Array.from(document.querySelectorAll('div[role="article"]'))
    .filter((a) => COMMENT_ARTICLE.test(a.getAttribute('aria-label') || '')
      || (a.getAttribute('aria-label') && a.querySelector('a[href*="comment_id="]')));

  // An emoji posted on its own is rendered as an <img> with the emoji as its
  // alt text, so such a comment has no innerText at all -- matching on text alone never finds it.
  // The alt is what makes an emoji marker locatable.
  const holdsNeedle = (a, wanted) => lower(a.innerText).includes(wanted)
    || Array.from(a.querySelectorAll('img')).some((i) => lower(i.getAttribute('alt')).includes(wanted));

  // Facebook nests two articles per comment, and one of them can have no box at
  // all; keep the ones that actually render.
  // A comment this short (".") is inside nearly every comment's text, so it
  // is matched only as the WHOLE body of a comment -- and ours first, when the
  // account is known.
  const SHORT_COMMENT = 4;
  const bodyIs = (a, wanted) => Array.from(a.querySelectorAll('div[dir="auto"], span[dir="auto"]'))
    .some((n) => lower(n.innerText) === wanted);

  const myComment = (wanted) => {
    const short = wanted.length < SHORT_COMMENT;
    let hits = commentArticles().filter((a) => (short ? bodyIs(a, wanted) : holdsNeedle(a, wanted)));
    if (short && author) {
      const ours = hits.filter(byUs);
      if (ours.length) hits = ours;
    }
    const boxed = hits.filter(visible);
    return (boxed.length ? boxed : hits)[0] || null;
  };

  // Facebook nests two articles per comment, and one of them can have no box at
  // all -- picking that one is what reported "the comment has no box" on a
  // comment sitting right there on screen. The visible one wins.
  // L'identifiant d'un commentaire, lu dans un lien qu'il porte. Facebook
  // l'écrit de deux façons : en chiffres (comment_id=1234), ou en base64
  // (comment_id=Y29tbWVudDo...) qui se décode en « comment:<post>_<commentaire> ».
  // Ne lire que les chiffres laissait le commentaire sans identifiant : il ne
  // pouvait plus recevoir son lien.
  const commentIdOf = (href) => {
    let params;
    try {
      params = new URL(href, location.href).searchParams;
    } catch (_) {
      return '';
    }
    const raw = params.get('reply_comment_id') || params.get('comment_id') || '';
    if (/^\d+$/.test(raw)) return raw;
    try {
      const decoded = atob(raw.replace(/-/g, '+').replace(/_/g, '/'));
      const m = decoded.match(/comment:\d+_(\d+)/);
      if (m) return m[1];
    } catch (_) { /* pas du base64 */ }
    return '';
  };

  const commentById = (wanted) => {
    const hits = commentArticles()
      .filter((a) => Array.from(a.querySelectorAll('a[href]'))
        .some((link) => commentIdOf(link.getAttribute('href') || '') === wanted))
      .sort((a, b) => (a.contains(b) ? 1 : b.contains(a) ? -1 : 0));
    return hits.find(visible) || hits[0] || null;
  };

  // Where to put the pointer to make a comment's "..." button appear: near its
  // top, clamped inside the window -- a long comment is taller than the screen,
  // so its centre is often outside it. A comment without a box of its own is
  // aimed at through its first visible piece (its text, its timestamp).
  const commentAnchor = (c) => {
    const boxed = visible(c) ? c
      : Array.from(c.querySelectorAll('div[dir="auto"], span[dir="auto"], a[href]')).find(visible);
    if (!boxed) return null;
    boxed.scrollIntoView({ block: 'center', inline: 'nearest' });
    const r = (visible(c) ? c : boxed).getBoundingClientRect();
    if (!r.width || !r.height) return null;
    const clamp = (v, max) => Math.min(Math.max(v, 12), max - 12);
    return {
      x: clamp(r.left + r.width / 2, window.innerWidth),
      y: clamp(r.top + Math.min(24, r.height / 2), window.innerHeight),
    };
  };

  // -- is the link in the comment? ------------------------------------------
  //
  // Facebook never shows a link as it was typed: the scheme is dropped, a long
  // path is cut with "…", and the anchor points at l.facebook.com/l.php?u=...
  // Comparing the text exactly never recognised a link that WAS there, so a
  // comment already carrying its URL was edited again and never acknowledged.

  // "https://www.Site.com/a/b/" -> "site.com/a/b"
  const canonUrl = (raw) => {
    const text = norm(raw).toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '');
    return text.replace(/\/+(?=$|[?#])/, '').replace(/\/$/, '');
  };

  const FACEBOOK_HOST = /(^|\.)(facebook\.com|fb\.com|fb\.me|messenger\.com)$/i;

  // Where an anchor really leads: through Facebook's redirect when it has one.
  // Empty for Facebook's own links (author, timestamp, hashtags).
  const outboundOf = (a) => {
    const href = a.getAttribute('href') || '';
    // A relative link is Facebook's own page by definition.
    if (!/^https?:\/\//i.test(href)) return '';
    try {
      const u = new URL(href);
      if (/^l[m]?\.facebook\.com$/i.test(u.hostname) && u.searchParams.get('u')) return u.searchParams.get('u');
      return FACEBOOK_HOST.test(u.hostname) ? '' : u.href;
    } catch (_) {
      return '';
    }
  };

  // Does a displayed text stand for that URL? Exact, scheme-less, or elided.
  const showsUrl = (display, wanted) => {
    const shown = canonUrl(display);
    if (!shown) return false;
    if (shown === wanted) return true;
    const cut = shown.split(/…|\.\.\./);
    if (cut.length !== 2) return false;
    const [head, tail] = [cut[0], cut[1].replace(/\/$/, '')];
    return head.length >= 8 && wanted.startsWith(head) && wanted.endsWith(tail);
  };

  // { holds: the comment carries this link, other: a DIFFERENT outbound link it
  // carries instead }. "other" is what stops an edit from overwriting a comment
  // somebody already put a link in.
  const linkState = (c, url) => {
    const wanted = canonUrl(url);
    const anchors = Array.from(c.querySelectorAll('a[href]'));
    const targets = anchors.map(outboundOf).filter(Boolean);
    if (targets.some((t) => canonUrl(t) === wanted)) return { holds: true, other: '' };
    const texts = Array.from(c.querySelectorAll('div[dir="auto"], span[dir="auto"], a[href]'))
      .map((n) => norm(n.innerText)).filter(Boolean);
    if (texts.some((t) => norm(t) === norm(url) || showsUrl(t, wanted))) return { holds: true, other: '' };
    return { holds: false, other: targets[0] || '' };
  };

  const buttonsIn = (root) => Array.from(root.querySelectorAll('[role="button"], button'));
  const labelOf = (el) => lower(el.getAttribute('aria-label')) || lower(el.innerText);
  // The author's name out of "Comment as <name>", in any language listed.
  const authorFromLabel = (label) => {
    const folded = fold(label);
    return AUTHOR_LABEL.test(folded) ? norm(folded.replace(AUTHOR_LABEL, '')) : '';
  };

  F.dom = {
    fold,
    authorFromLabel,
    norm,
    lower,
    needle,
    commentNeedle,
    centre,
    visible,
    show,
    dialogs,
    composerDialogs,
    postBox,
    postContainers,
    findPost,
    postKey,
    lettersOnly,
    occurrences,
    pickBox,
    onePostPage,
    commentBox,
    boxAttachment,
    commentArticles,
    holdsNeedle,
    myComment,
    commentById,
    commentIdOf,
    commentAnchor,
    canonUrl,
    showsUrl,
    linkState,
    buttonsIn,
    labelOf,
    setAuthor,
    getAuthor,
    COMPOSER_ENTRY,
    SUBMIT_LABELS,
    COMMENT_BUTTON_LABELS,
    COMMENT_FIELD,
    CREATE_POST,
    PENDING,
    BLOCKED,
    PHOTO_LABELS,
    ATTACHMENT_CONTROLS,
    REMOVE_ATTACHMENT,
    COMMENT_MENU,
    EDIT_ITEM,
    DELETE_ITEM,
    NEW_COMMENT_BOX,
    AUTHOR_LABEL,
    COMPOSER_FILE_INPUT,
  };
})();
