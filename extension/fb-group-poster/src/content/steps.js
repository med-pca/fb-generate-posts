/* One step of the posting sequence, each one self-contained.
 *
 * A step never navigates: the service worker owns navigation, because a content
 * script is destroyed with its document. So a step is everything that can be
 * done on one page -- and it polls for what it needs, exactly like the Python
 * composer did, because Facebook renders its controls well after the page
 * reports itself loaded.
 */
(() => {
  'use strict';
  const F = (globalThis.FBX = globalThis.FBX || {});
  if (F.steps) return;
  const D = F.dom;
  const A = F.act;
  const { sleep } = A;

  const POLL_MS = 700;
  const shortOf = (stepTimeoutMs) => Math.min(5000, stepTimeoutMs);

  /* Poll a lookup; give back the hit, or why it never came. */
  async function pollFor(lookup, ms) {
    const deadline = Date.now() + ms;
    let reason = 'unknown';
    for (;;) {
      let hit;
      try {
        hit = await lookup();
      } catch (err) {
        reason = String(err && err.message ? err.message : err);
        hit = null;
      }
      if (hit && hit.ok) return hit;
      if (hit && hit.reason) {
        reason = hit.seen ? `${hit.reason} (buttons seen: ${JSON.stringify(hit.seen)})` : hit.reason;
      }
      if (Date.now() >= deadline) return { ok: false, reason };
      await sleep(POLL_MS);
    }
  }

  // -- lookups ------------------------------------------------------------

  /* Without a known label (a language the list does not cover), the entry
   * is recognised by its shape: in every language it is a button in the
   * group's main column whose short text is a placeholder ending in "..." --
   * "Write something...", "اكتب شيئًا...", "Escribe algo...". */
  const placeholderEntry = () => {
    const main = document.querySelector('[role="main"]') || document.body;
    return Array.from(main.querySelectorAll('[role="button"], div[tabindex="0"]')).find((e) => {
      const text = D.norm(e.innerText);
      return text.length >= 4 && text.length <= 60 && /(\.\.\.|…)$/.test(text) && !e.closest('[role="feed"]') && D.centre(e);
    }) || null;
  };

  const composerEntry = () => {
    const els = Array.from(document.querySelectorAll('[role="button"], div[tabindex="0"], span'));
    const box = els.find((e) => D.COMPOSER_ENTRY.test(D.norm(e.innerText))) || placeholderEntry();
    if (!box) return { ok: false, reason: 'the "Write something..." box is not on the page' };
    return D.centre(box) ? { ok: true, el: box } : { ok: false, reason: 'composer entry is not visible' };
  };

  const postTextbox = () => {
    for (const d of D.composerDialogs()) {
      const box = D.postBox(d);
      if (box && D.centre(box)) return { ok: true, el: box, text: D.norm(box.innerText) };
    }
    return { ok: false, reason: 'the post text area did not appear' };
  };

  const submitButton = () => {
    const found = [];
    for (const d of D.composerDialogs()) {
      for (const el of D.buttonsIn(d)) {
        if (D.SUBMIT_LABELS.includes(D.labelOf(el))) found.push(el);
      }
    }
    // Unknown language: the Post button is the wide one across the bottom
    // of the composer, whatever it says.
    if (!found.length) {
      for (const d of D.composerDialogs()) {
        const box = d.getBoundingClientRect();
        const bottom = D.buttonsIn(d)
          .filter((el) => {
            const r = el.getBoundingClientRect();
            return r.width >= box.width * 0.5 && r.top >= box.top + box.height * 0.6 && D.labelOf(el).length <= 25;
          })
          .sort((a, b) => b.getBoundingClientRect().top - a.getBoundingClientRect().top);
        if (bottom[0]) found.push(bottom[0]);
      }
    }
    if (!found.length) {
      const seen = D.composerDialogs()
        .flatMap((d) => D.buttonsIn(d).map((el) => D.labelOf(el).slice(0, 20)))
        .filter(Boolean);
      return { ok: false, reason: 'no submit button in the composer', seen: seen.slice(0, 20) };
    }
    const enabled = found.find((el) => el.getAttribute('aria-disabled') !== 'true');
    const el = enabled || found[0];
    if (!D.centre(el)) return { ok: false, reason: 'submit button is not visible' };
    return { ok: true, el, disabled: !enabled, label: D.labelOf(el) || 'post' };
  };

  const composerState = () => {
    const open = D.dialogs().some((d) => D.CREATE_POST.test(D.norm(d.innerText).slice(0, 60)));
    const body = D.lower(document.body.innerText);
    return {
      ok: true,
      composerOpen: open,
      pending: D.PENDING.test(body),
      blocked: D.BLOCKED.test(body),
    };
  };

  const fileInputPresent = () => {
    // Only the input inside the composer dialog works. The page also carries
    // video-first file inputs outside any dialog; setting those does nothing.
    const usable = Array.from(document.querySelectorAll(D.COMPOSER_FILE_INPUT))
      .filter((i) => /image/.test(i.accept || ''));
    return usable.length
      ? { ok: true, count: usable.length }
      : { ok: false, reason: 'the composer has no image file input yet' };
  };

  const imageAttached = () => {
    for (const d of D.composerDialogs()) {
      // Facebook adds these controls only once an attachment is really there.
      const controls = D.buttonsIn(d).some((el) => D.ATTACHMENT_CONTROLS.test(el.getAttribute('aria-label') || ''));
      // A genuine preview is a large blob:; avatars and icons are small.
      const preview = Array.from(d.querySelectorAll('img[src^="blob:"]'))
        .some((im) => im.naturalWidth > 150 && im.naturalHeight > 150);
      if (controls && preview) return { ok: true };
      // The controls are found by their label: in a language the list does
      // not know, a finished preview with no progress bar is enough.
      if (preview && !d.querySelector('[role="progressbar"]')) return { ok: true, unlabelled: !controls };
      if (controls || preview) return { ok: false, reason: 'the image is still uploading' };
    }
    return { ok: false, reason: 'no image preview appeared in the composer' };
  };

  const commentField = (postContent) => {
    const post = D.findPost(postContent);
    if (!post) return { ok: false, reason: 'the published post is no longer in the feed' };
    const box = D.commentBox(post);
    if (!box) return { ok: false, reason: 'no comment field under the post yet' };
    return D.show(box)
      ? { ok: true, el: box, text: D.norm(box.innerText), attachment: D.boxAttachment(box) }
      : { ok: false, reason: 'the comment field is not visible' };
  };

  const commentButton = (postContent) => {
    const post = D.findPost(postContent);
    if (!post) return { ok: false, reason: 'the published post is no longer in the feed' };
    const el = D.buttonsIn(post).find((b) => D.COMMENT_BUTTON_LABELS.includes(D.labelOf(b)));
    if (!el) return { ok: false, reason: 'no Comment button under the post' };
    return D.show(el) ? { ok: true, el } : { ok: false, reason: 'the Comment button is not visible' };
  };

  const editMenuItem = () => {
    for (const menu of document.querySelectorAll('[role="menu"], [role="dialog"]')) {
      const item = Array.from(menu.querySelectorAll('[role="menuitem"], [role="button"], button'))
        .find((el) => D.EDIT_ITEM.test(D.norm(el.getAttribute('aria-label') || el.innerText)));
      // Trouvé suffit : un menu qui s'ouvre à moitié hors de l'écran se clique
      // aussi bien, et le refuser ne faisait qu'abandonner l'édition.
      if (item) {
        D.show(item);
        return { ok: true, el: item };
      }
    }
    return { ok: false, reason: 'no Edit entry in the comment menu' };
  };

  const commentMenuOf = (comment) => {
    const btn = D.buttonsIn(comment).find((b) => D.COMMENT_MENU.test(b.getAttribute('aria-label') || ''))
      // Any language: the "..." button is the one that opens a menu.
      || D.buttonsIn(comment).find((b) => b.getAttribute('aria-haspopup') === 'menu');
    if (!btn) {
      return {
        ok: false,
        reason: 'the comment has no options button',
        seen: D.buttonsIn(comment).map((b) => D.lower(b.getAttribute('aria-label'))).filter(Boolean).slice(0, 12),
      };
    }
    // Pas de contrôle de boîte : ce bouton est masqué tant que le pointeur
    // n'est pas sur le commentaire, et nos événements de synthèse ne déclenchent
    // pas le `:hover` du CSS. Nous tenons l'élément, cela suffit pour le cliquer.
    return { ok: true, el: btn };
  };

  /* The edit box arrives pre-filled with the comment being edited, while the
   * field for a NEW comment is empty and carries the SAME aria-label, so the
   * label separates nothing -- content does. */
  const openEditor = (excludeKnown) => {
    const boxes = Array.from(document.querySelectorAll('div[role="textbox"], div[contenteditable="true"]'))
      .filter((b) => !(excludeKnown && F.knownEditors && F.knownEditors.has(b)));
    const isNew = (b) => D.NEW_COMMENT_BOX.test(
      `${b.getAttribute('aria-label') || ''} ${b.getAttribute('aria-placeholder') || ''}`,
    );
    const box = boxes.find((b) => D.norm(b.innerText).length > 0 && !isNew(b))
      || boxes.find((b) => D.norm(b.innerText).length > 0);
    if (!box) {
      return {
        ok: false,
        reason: 'the comment is not in edit mode yet',
        seen: boxes.map((b) => D.norm(b.innerText).slice(0, 20)),
      };
    }
    return { ok: true, el: box };
  };

  // -- steps --------------------------------------------------------------

  const steps = {};

  steps.ping = async () => ({ ok: true, url: location.href, author: D.getAuthor() });

  steps.setAuthor = async ({ name }) => {
    D.setAuthor(name || '');
    return { ok: true, author: D.getAuthor() };
  };

  /* "Comment as <name>" on any comment field names the signed-in account, and
   * the composer dialog carries the same name under its title. Knowing it is
   * what keeps one profile from reading another's post id when both published
   * the same article to the same group seconds apart. */
  steps.readAuthor = async ({ stepTimeoutMs = 45000 } = {}) => {
    const lookup = () => {
      const name = Array.from(document.querySelectorAll('div[role="textbox"], div[contenteditable="true"]'))
        .map((b) => D.authorFromLabel(b.getAttribute('aria-label') || ''))
        .find(Boolean);
      if (name) return { ok: true, name };
      for (const d of D.dialogs()) {
        // "Create post | Post anonymously | <name> | Public group" -- the toggle
        // sits between the title and the name and must not be taken for it.
        const m = D.norm(d.innerText).match(
          /^(?:create post|créer une publication|إنشاء منشور|crear publicación)\s+(?:post anonymously\s+|publier anonymement\s+|النشر دون الكشف عن الهوية\s+)?(.{2,40}?)\s+(?:public|private|group|groupe|مجموعة|عامة|خاصة|grupo)/i,
        );
        if (m) {
          const name = D.norm(m[1]);
          if (!/anonym|create post/i.test(name)) return { ok: true, name };
        }
      }
      return { ok: false, reason: 'could not read the account name' };
    };
    const found = await pollFor(lookup, shortOf(stepTimeoutMs));
    if (found.ok) D.setAuthor(found.name);
    return found;
  };

  /* Click "Write something..." until the Create post dialog really opens.
   * The box is in the DOM well before React attaches its click handler, so the
   * first click is often swallowed -- the page looks ready and nothing happens.
   * Clicking again costs a second; waiting out the whole timeout costs a post. */
  steps.openComposer = async ({ stepTimeoutMs = 45000 } = {}) => {
    const entry = await pollFor(composerEntry, stepTimeoutMs);
    if (!entry.ok) return { ok: false, reason: `the group page never offered a post box: ${entry.reason}` };
    const deadline = Date.now() + stepTimeoutMs;
    let attempt = 0;
    let reason = 'the post text area did not appear';
    let target = entry.el;
    while (Date.now() < deadline) {
      attempt += 1;
      await A.click(target);
      const box = await pollFor(postTextbox, shortOf(stepTimeoutMs));
      if (box.ok) return { ok: true, attempts: attempt };
      reason = box.reason;
      // The feed reflows as it loads, so re-read the box before retrying.
      const again = composerEntry();
      if (again.ok) target = again.el;
    }
    return { ok: false, reason: `the composer never opened: ${reason}` };
  };

  /* Drop any media a restored draft brought into the composer. */
  steps.removeAttachments = async ({ limit = 5 } = {}) => {
    let removed = 0;
    for (let i = 0; i < limit; i += 1) {
      let btn = null;
      for (const d of D.composerDialogs()) {
        btn = D.buttonsIn(d).find((el) => D.REMOVE_ATTACHMENT.test(el.getAttribute('aria-label') || ''));
        if (btn) break;
      }
      if (!btn) break;
      await A.click(btn);
      removed += 1;
      await sleep(500);
    }
    return { ok: true, removed };
  };

  steps.checkContent = async () => {
    const box = postTextbox();
    return box.ok ? { ok: true, text: box.text } : box;
  };

  /* Put the post text in the composer, replacing whatever was there. */
  steps.typeContent = async ({ content, stepTimeoutMs = 45000 }) => {
    // Facebook restores unsent drafts into the composer, attachments included.
    // Text replacement would leave media in place, so drop it first.
    await steps.removeAttachments({});
    const box = await pollFor(postTextbox, stepTimeoutMs);
    if (!box.ok) return box;
    const existing = A.focusAndSelectAll(box.el);
    const inserted = await A.insertText(box.el, content);
    await sleep(600);
    const state = postTextbox();
    const got = state.ok ? state.text : inserted.text;
    if (D.norm(got) !== D.norm(content)) {
      return {
        ok: false,
        reason: `the composer holds "${got.slice(0, 120)}", not the exact content`,
        typed: got,
        method: inserted.method,
      };
    }
    return { ok: true, discardedDraft: existing || '', method: inserted.method };
  };

  /* Hand the image to the composer's own file input: no OS dialog involved. */
  steps.attachImage = async ({ file, stepTimeoutMs = 45000 }) => {
    // Facebook only renders the file input once the photo tool is opened.
    if (!fileInputPresent().ok) {
      let photo = null;
      for (const d of D.composerDialogs()) {
        photo = D.buttonsIn(d).find((el) => D.PHOTO_LABELS.includes(D.labelOf(el)));
        if (photo) break;
      }
      if (photo) {
        await A.click(photo);
        await sleep(1000);
      }
      const ready = await pollFor(fileInputPresent, stepTimeoutMs);
      if (!ready.ok) return { ok: false, reason: `could not attach the image: ${ready.reason}` };
    }
    const handed = A.setFileInput(D.COMPOSER_FILE_INPUT, file);
    if (!handed.ok) return { ok: false, reason: `could not hand the image to Facebook: ${handed.reason}` };
    const shown = await pollFor(imageAttached, stepTimeoutMs);
    return shown.ok ? { ok: true, bytes: handed.bytes } : { ok: false, reason: `the image did not attach: ${shown.reason}` };
  };

  steps.composerState = async () => composerState();

  /* Click Publish until the composer closes. Like the box that opens the
   * composer, the button can be clicked before Facebook is listening, and
   * attaching an image reflows the dialog. Re-clicking is only safe because it
   * happens while the dialog is still open -- which is exactly what "not
   * closed" means: nothing was submitted yet. */
  steps.submit = async ({ stepTimeoutMs = 45000 } = {}) => {
    const deadline = Date.now() + stepTimeoutMs;
    let clicks = 0;
    let sawButton = false;
    let lastSeen = null;
    while (Date.now() < deadline) {
      const found = submitButton();
      if (found.ok) {
        sawButton = true;
        if (!found.disabled) {
          await A.click(found.el);
          clicks += 1;
          const closed = await pollFor(
            () => (composerState().composerOpen
              ? { ok: false, reason: 'the composer is still open' }
              : { ok: true }),
            shortOf(stepTimeoutMs),
          );
          if (closed.ok) return { ok: true, clicks, ...composerState() };
          continue;
        }
      } else {
        lastSeen = found.seen || lastSeen;
      }
      await sleep(POLL_MS);
    }
    const state = composerState();
    if (!sawButton) {
      return { ok: false, reason: 'the Post button never appeared in the composer', seen: lastSeen, ...state };
    }
    if (!clicks) {
      return { ok: false, reason: 'the Post button stayed disabled after entering the content', ...state };
    }
    return { ok: false, reason: 'clicked Post but the composer stayed open - nothing was submitted', clicks, ...state };
  };

  /* The post as its own container, not just the words somewhere on the page: a
   * notification quoting the post would match the body text too. */
  steps.verifyPublished = async ({ content, stepTimeoutMs = 45000 }) => pollFor(
    () => (D.findPost(content) ? { ok: true } : { ok: false, reason: 'the post is not on the page' }),
    stepTimeoutMs,
  );

  /* The post's own id and permalink, read off the links it carries. */
  steps.readPostId = async ({ content, stepTimeoutMs = 45000 }) => {
    const lookup = () => {
      const post = D.findPost(content);
      if (!post) return { ok: false, reason: 'the published post is not on the page' };
      const groupOf = (href) => (href.match(/\/groups\/(\d+)/) || href.match(/idorvanity=(\d+)/)
        || location.href.match(/\/groups\/(\d+)/) || [])[1];
      for (const a of post.querySelectorAll('a[href]')) {
        const href = a.getAttribute('href') || '';
        // In order of preference: a real permalink, the group-story id on an
        // attached photo, then the ids Facebook puts in query strings.
        const m = href.match(/\/groups\/\d+\/posts\/([A-Za-z0-9]+)/)
          || href.match(/set=gm\.(\d+)/)
          || href.match(/(?:story_fbid|multi_permalinks)=([A-Za-z0-9]+)/);
        const group = m && groupOf(href);
        if (m && group) {
          return { ok: true, id: m[1], url: `https://www.facebook.com/groups/${group}/posts/${m[1]}/` };
        }
      }
      return { ok: false, reason: 'nothing under the post carries its id' };
    };
    return pollFor(lookup, stepTimeoutMs);
  };

  /* Did the comment land? The text showing twice is the post plus its comment.
   * Where to count it depends on the build: this one wraps every comment in its
   * own role="article", so the comment is a SIBLING of the post -- counting
   * inside the post container found it only once and reported a comment that
   * had in fact landed. A permalink page holds exactly one post, so the whole
   * document is the safe scope there; in a feed it has to stay the post
   * container, or a neighbouring post would match. */
  const commentPosted = ({ postContent, comment, needed }) => {
    const commentWanted = D.commentNeedle(comment);
    const post = D.findPost(postContent);
    if (!post) return { ok: false, reason: 'the post left the page before the comment landed' };
    if (needed === 1) {
      // A comment that differs from the post -- a marker, a link -- is its own
      // article, and an emoji marker has no innerText at all.
      if (D.myComment(commentWanted)) return { ok: true };
    } else {
      const scope = D.onePostPage() ? document.body : post;
      if (D.occurrences(D.lower(scope.innerText), commentWanted) >= needed) return { ok: true };
    }
    const box = D.commentBox(post);
    const still = box ? D.norm(box.innerText) : '';
    return {
      ok: false,
      reason: still ? 'the comment is still sitting in the field' : 'the comment has not appeared under the post yet',
      leftover: still,
    };
  };

  steps.commentPosted = async ({ postContent, comment, stepTimeoutMs = 45000 }) => {
    const needed = D.norm(comment) === D.norm(postContent) ? 2 : 1;
    return pollFor(() => commentPosted({ postContent, comment, needed }), stepTimeoutMs);
  };

  /* Put the text under the just-published post as its first comment. */
  steps.writeComment = async ({ postContent, comment, stepTimeoutMs = 45000 }) => {
    let field = await pollFor(() => commentField(postContent), shortOf(stepTimeoutMs));
    if (!field.ok) {
      // Some layouts only render the field once "Comment" is clicked.
      const button = await pollFor(() => commentButton(postContent), stepTimeoutMs);
      if (!button.ok) return { ok: false, reason: `no comment field under the new post: ${button.reason}` };
      await A.click(button.el);
      field = await pollFor(() => commentField(postContent), stepTimeoutMs);
      if (!field.ok) return field;
    }
    await A.click(field.el);
    await sleep(500);

    // Same trap as the composer: Facebook restores unsent comment drafts.
    const existing = A.focusAndSelectAll(field.el);
    const inserted = await A.insertText(field.el, comment);
    await sleep(600);

    const state = commentField(postContent);
    const typed = state.ok ? state.text : inserted.text;
    if (D.norm(typed) !== D.norm(comment)) {
      return {
        ok: false,
        reason: `the comment field holds "${typed.slice(0, 120)}", not the exact content`,
        typed,
      };
    }
    if (state.ok && state.attachment) {
      // The comment repeats the post's text only -- never its image.
      return { ok: false, reason: 'the comment field has an attachment in it and the comment must be text only' };
    }

    await A.pressEnter(state.ok ? state.el : field.el);
    // The comment repeats the post only when it is the same text; a link
    // comment appears once, and requiring twice would never confirm.
    const needed = D.norm(comment) === D.norm(postContent) ? 2 : 1;
    const landed = await pollFor(() => commentPosted({ postContent, comment, needed }), stepTimeoutMs);
    if (!landed.ok) return { ok: false, reason: `the first comment did not appear: ${landed.reason}` };
    return { ok: true, discardedDraft: existing || '' };
  };

  /* Facebook's id for the comment just written. Not fatal on its own -- the
   * comment is live either way -- but without it the API cannot come back to
   * that comment to put the link in it. */
  steps.readCommentId = async ({ comment, stepTimeoutMs = 45000 }) => {
    const lookup = () => {
      const c = D.myComment(D.commentNeedle(comment));
      if (!c) return { ok: false, reason: 'the comment is not on the page' };
      for (const a of c.querySelectorAll('a[href]')) {
        // Chiffres ou base64 : voir commentIdOf.
        const id = D.commentIdOf(a.getAttribute('href') || '');
        if (id) return { ok: true, id };
      }
      return { ok: false, reason: 'nothing under the comment carries its id' };
    };
    return pollFor(lookup, shortOf(stepTimeoutMs));
  };

  /* Does that comment already hold this exact text? Asked before editing, so a
   * link saved on Facebook but never acknowledged by the API is not written
   * twice. */
  steps.commentHoldsText = async ({ commentId, text }) => {
    const c = D.commentById(commentId);
    if (!c) return { ok: false, reason: 'the target comment is not on the page' };
    if (c.querySelector('[role="textbox"], [contenteditable="true"]')) {
      return { ok: false, reason: 'the target comment is still being edited' };
    }
    const expected = D.norm(text);
    const exact = Array.from(c.querySelectorAll('div[dir="auto"], span[dir="auto"]'))
      .some((node) => D.norm(node.innerText) === expected);
    if (exact) return { ok: true };
    // A link is displayed shortened, so it is recognised by where it leads.
    if (/^https?:\/\//i.test(expected)) {
      const state = D.linkState(c, expected);
      if (state.holds) return { ok: true };
      if (state.other) return { ok: false, otherLink: state.other, reason: `the comment already carries another link: ${state.other}` };
    }
    return { ok: false, reason: 'the target comment does not hold the text' };
  };

  /* Open a comment's editor: hover, options menu, then Edit, until it takes.
   * Same swallowed-click problem as the composer and the Publish button -- the
   * menu entry is in the DOM before it is live, and one click on it does
   * nothing at all. Re-opening the menu each round also covers the case where
   * the first click closed it. */
  async function openCommentEditor(find, stepTimeoutMs) {
    const deadline = Date.now() + stepTimeoutMs;
    let reason = 'the comment never became editable';
    let attempt = 0;
    while (Date.now() < deadline) {
      attempt += 1;
      const comment = find();
      if (!comment) {
        // The comment list re-renders moments after a comment is sent, and the
        // comment can drop out of the DOM while it does.
        reason = 'the comment is not on the page';
        await sleep(POLL_MS);
        continue;
      }
      const anchor = D.commentAnchor(comment);
      if (!anchor) {
        reason = 'the comment has no box';
        await sleep(POLL_MS);
        continue;
      }
      // The "..." button only exists while the pointer is over the comment.
      // Deux façons de le dire à la page : un point de l'écran, et le
      // commentaire lui-même -- React écoute l'un ou l'autre selon les builds.
      await A.hoverAt(anchor.x, anchor.y);
      await A.hoverElement(comment);
      await sleep(400);

      const menu = await pollFor(() => {
        const again = find();
        return again ? commentMenuOf(again) : { ok: false, reason: 'the comment is not on the page' };
      }, shortOf(stepTimeoutMs));
      if (!menu.ok) { reason = menu.reason; continue; }
      await A.click(menu.el);
      await sleep(600);

      const item = await pollFor(editMenuItem, shortOf(stepTimeoutMs));
      if (!item.ok) { reason = item.reason; continue; }
      // Exclude the fields that were already there when Facebook opens its
      // edit box: they carry the same label.
      F.knownEditors = new WeakSet(document.querySelectorAll('div[role="textbox"], div[contenteditable="true"]'));
      await A.click(item.el);

      const editor = await pollFor(() => openEditor(true), shortOf(stepTimeoutMs));
      if (editor.ok) return { ok: true, el: editor.el, attempts: attempt };
      reason = editor.reason;
    }
    return { ok: false, reason };
  }

  /* Rewrite a comment found by its text -- the first comment of the post that
   * was just published. */
  steps.editCommentByText = async ({ original, replacement, stepTimeoutMs = 45000 }) => {
    const find = () => D.myComment(D.commentNeedle(original));
    const editor = await openCommentEditor(find, stepTimeoutMs);
    if (!editor.ok) return { ok: false, reason: `could not open the comment editor: ${editor.reason}` };
    A.focusAndSelectAll(editor.el);
    await A.insertText(editor.el, replacement);
    await sleep(600);
    await A.pressEnter(editor.el);
    const saved = await pollFor(() => {
      const c = D.myComment(D.commentNeedle(replacement));
      if (!c) return { ok: false, reason: 'the comment does not carry the new text' };
      // The editor sits INSIDE the comment, so text typed but not saved would
      // otherwise read as a successful edit.
      if (c.querySelector('div[role="textbox"], div[contenteditable="true"]')) {
        return { ok: false, reason: 'the comment is still open for editing' };
      }
      return { ok: true };
    }, stepTimeoutMs);
    return saved.ok ? { ok: true } : { ok: false, reason: `the edit did not take: ${saved.reason}` };
  };

  /* Rewrite the comment the API remembers by its id. This runs long after the
   * post went out -- possibly in another session -- so the comment is reached
   * by its id, never by its text, which by then is on the page twice. */
  steps.editCommentById = async ({ commentId, newText, stepTimeoutMs = 45000 }) => {
    const holds = await steps.commentHoldsText({ commentId, text: newText });
    if (holds.ok) return { ok: true, alreadyThere: true };
    if (holds.otherLink) return { ok: false, skipped: true, reason: holds.reason };

    const find = () => D.commentById(commentId);
    const present = await pollFor(
      () => (find() ? { ok: true } : { ok: false, reason: 'that comment is not on the page' }),
      stepTimeoutMs,
    );
    if (!present.ok) return present;

    const editor = await openCommentEditor(find, stepTimeoutMs);
    if (!editor.ok) return { ok: false, reason: `could not open the comment editor: ${editor.reason}` };
    A.focusAndSelectAll(editor.el);
    await A.insertText(editor.el, newText);
    await sleep(600);
    await A.pressEnter(editor.el);
    const saved = await pollFor(() => steps.commentHoldsText({ commentId, text: newText }), stepTimeoutMs);
    return saved.ok ? { ok: true } : { ok: false, reason: `the edit did not take: ${saved.reason}` };
  };

  // -- editing by id, with trusted input ----------------------------------
  //
  // These steps only FIND things and say where they are on screen; the service
  // worker then hovers, clicks and types through chrome.debugger (cdp.js),
  // whose events Facebook cannot tell from a person's. Same split as the
  // Python worker: a JS lookup returns { x, y }, CDP acts on it.

  const inView = (c) => c && c.x > 0 && c.y > 0 && c.x < window.innerWidth && c.y < window.innerHeight;

  /* Where to hover so the comment's "..." button appears. Scrolls it into view
   * -- the only one of these lookups allowed to scroll, since the pointer is
   * parked on the result. */
  steps.locateComment = async ({ commentId, timeoutMs = 15000 }) => pollFor(() => {
    const c = D.commentById(commentId);
    if (!c) return { ok: false, reason: 'that comment is not on the page' };
    const p = D.commentAnchor(c);
    return p ? { ok: true, ...p } : { ok: false, reason: 'the comment has no box' };
  }, timeoutMs);

  /* The "..." button, once the real pointer has revealed it. */
  steps.locateCommentMenu = async ({ commentId, timeoutMs = 5000 }) => pollFor(() => {
    const c = D.commentById(commentId);
    if (!c) return { ok: false, reason: 'that comment is not on the page' };
    const menu = commentMenuOf(c);
    if (!menu.ok) return menu;
    const p = D.centre(menu.el);
    if (!p) return { ok: false, reason: 'the options button has no box (the pointer is not over the comment)' };
    return inView(p) ? { ok: true, ...p } : { ok: false, reason: 'the options button is off screen' };
  }, timeoutMs);

  steps.locateEditItem = async ({ timeoutMs = 5000 } = {}) => pollFor(() => {
    const item = editMenuItem();
    if (!item.ok) return item;
    let p = D.centre(item.el);
    if (!inView(p)) p = D.show(item.el);
    return p ? { ok: true, ...p } : { ok: false, reason: 'the Edit entry has no box' };
  }, timeoutMs);

  /* Remember the fields already on the page: the edit box carries the same
   * label as the field for a new comment. */
  steps.snapshotEditors = async () => {
    F.knownEditors = new WeakSet(document.querySelectorAll('div[role="textbox"], div[contenteditable="true"]'));
    return { ok: true };
  };

  /* The edit box, focused with its whole content selected, so the text typed
   * next REPLACES the comment instead of joining it. */
  steps.focusEditor = async ({ timeoutMs = 5000 } = {}) => {
    const editor = await pollFor(() => openEditor(true), timeoutMs);
    if (!editor.ok) return editor;
    const existing = A.focusAndSelectAll(editor.el);
    return { ok: true, existing };
  };

  /* What the edit box holds now -- to check the typed text before sending. */
  steps.editorText = async () => {
    const editor = openEditor(true);
    return editor.ok ? { ok: true, text: D.norm(editor.el.innerText) } : editor;
  };

  /* Has Facebook built the site's preview card, and is its image loaded?
   * Asked in the edit box before saving, then in the saved comment. Avatars
   * and emojis are small; a preview image is not. */
  const PREVIEW_CLOSE = /remove (link )?preview|supprimer l.aper|retirer l.aper|إزالة المعاينة/i;
  const previewIn = (root) => {
    if (!root) return { found: false, loaded: false, images: 0 };
    const imgs = Array.from(root.querySelectorAll('img')).filter((im) => {
      const r = im.getBoundingClientRect();
      return r.width >= 60 && r.height >= 40;
    });
    const closer = D.buttonsIn(root).some((b) => PREVIEW_CLOSE.test(b.getAttribute('aria-label') || ''));
    return {
      found: imgs.length > 0 || closer,
      loaded: imgs.some((im) => im.complete && im.naturalWidth > 0),
      images: imgs.length,
    };
  };

  // The card sits beside the edit box, not in it: climb a few levels.
  const around = (el, levels) => {
    let node = el;
    for (let i = 0; i < levels && node.parentElement; i += 1) {
      node = node.parentElement;
      if (node.matches('form, div[role="article"]')) return node;
    }
    return node;
  };

  steps.linkPreview = async ({ commentId, where = 'editor' }) => {
    let root = null;
    if (where === 'editor') {
      const editor = openEditor(true);
      if (editor.ok) root = around(editor.el, 6);
    } else {
      root = D.commentById(commentId);
    }
    const state = previewIn(root);
    if (state.found && state.loaded) return { ok: true, ...state };
    return {
      ok: false,
      reason: state.found ? 'the preview image is still loading' : 'no link preview yet',
      ...state,
    };
  };

  F.steps = steps;
  F.pollFor = pollFor;
})();
