/* Acting on the page: what CDP's Input.* domain did, from inside the page.
 *
 * The Python driver had Input.dispatchMouseEvent / Input.insertText, which the
 * browser turns into trusted events. A content script has to build the events
 * itself, so each primitive keeps a fallback chain and reports which path
 * worked -- a click or an insertion that silently does nothing is the failure
 * mode that costs a post.
 */
(() => {
  'use strict';
  const F = (globalThis.FBX = globalThis.FBX || {});
  if (F.act) return;
  const { norm, centre } = F.dom;

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  const mouseInit = (x, y, buttons) => ({
    bubbles: true,
    cancelable: true,
    composed: true,
    view: window,
    clientX: x,
    clientY: y,
    screenX: x,
    screenY: y,
    button: 0,
    buttons,
  });
  const pointerInit = (x, y, buttons) => ({
    ...mouseInit(x, y, buttons),
    pointerId: 1,
    pointerType: 'mouse',
    isPrimary: true,
    width: 1,
    height: 1,
    pressure: buttons ? 0.5 : 0,
  });

  const fire = (el, type, init, Ctor) => el.dispatchEvent(new Ctor(type, init));

  /* The pointer has to MOVE to the target before pressing -- React menus and
   * buttons key off hover and pointer-enter -- and the press has to carry the
   * `buttons` bitmask a real press carries. Without them the event reaches the
   * right element and the handler ignores it, which looks exactly like a click
   * that lands and does nothing. */
  const moveOver = (el, x, y) => {
    fire(el, 'pointerover', pointerInit(x, y, 0), PointerEvent);
    fire(el, 'pointerenter', { ...pointerInit(x, y, 0), bubbles: false }, PointerEvent);
    fire(el, 'mouseover', mouseInit(x, y, 0), MouseEvent);
    fire(el, 'mouseenter', { ...mouseInit(x, y, 0), bubbles: false }, MouseEvent);
    fire(el, 'pointermove', pointerInit(x, y, 0), PointerEvent);
    fire(el, 'mousemove', mouseInit(x, y, 0), MouseEvent);
  };

  const pressAndRelease = (el, x, y) => {
    fire(el, 'pointerdown', pointerInit(x, y, 1), PointerEvent);
    fire(el, 'mousedown', mouseInit(x, y, 1), MouseEvent);
    try { el.focus({ preventScroll: true }); } catch (_) { /* not focusable */ }
    fire(el, 'pointerup', pointerInit(x, y, 0), PointerEvent);
    fire(el, 'mouseup', mouseInit(x, y, 0), MouseEvent);
    fire(el, 'click', mouseInit(x, y, 0), MouseEvent);
  };

  /* Where to aim events at an element. Son centre s'il a une boite, son coin
   * sinon : un contrôle caché tant que la souris n'est pas dessus n'en a pas,
   * et c'est précisément celui qu'il faut pouvoir cliquer. */
  const aimAt = (el) => {
    const r = el.getBoundingClientRect();
    return r.width && r.height
      ? { x: r.left + r.width / 2, y: r.top + r.height / 2 }
      : { x: Math.max(0, r.left), y: Math.max(0, r.top) };
  };

  /* Click an element we already hold. Coordinates still travel with the events:
   * Facebook reads them on some controls.
   *
   * Pas de boîte ne veut pas dire pas cliquable. Sur un commentaire, le bouton
   * « ... » est masqué tant que le pointeur n'est pas dessus ; un vrai pointeur
   * (ce que faisait CDP) le révélait, nos événements de synthèse ne le peuvent
   * pas -- CSS `:hover` ne s'invente pas depuis JS. Mais l'élément est là, et
   * un événement envoyé dessus atteint son gestionnaire : une boîte sert à
   * désigner une cible avec la souris, or nous la tenons déjà. Exiger une boîte
   * ici, c'est renoncer à modifier le commentaire. */
  const click = async (el) => {
    if (!el) return false;
    el.scrollIntoView({ block: 'center', inline: 'nearest' });
    await sleep(80);
    const c = aimAt(el);
    moveOver(el, c.x, c.y);
    await sleep(60);
    pressAndRelease(el, c.x, c.y);
    return true;
  };

  /* Survoler l'élément lui-même, pas un point de l'écran : `mouseover` remonte,
   * donc React voit l'entrée sur le commentaire et rend ses actions. */
  const hoverElement = async (el) => {
    if (!el) return false;
    el.scrollIntoView({ block: 'center', inline: 'nearest' });
    await sleep(60);
    const c = aimAt(el);
    moveOver(el, c.x, c.y);
    fire(el, 'pointermove', pointerInit(c.x, c.y, 0), PointerEvent);
    fire(el, 'mousemove', mouseInit(c.x, c.y, 0), MouseEvent);
    return true;
  };

  /* Click wherever a point lands -- for controls that only exist while the
   * pointer is over their neighbourhood, so there is no element to hold. */
  const clickAt = async (x, y) => {
    const el = document.elementFromPoint(x, y);
    if (!el) return false;
    moveOver(el, x, y);
    await sleep(60);
    pressAndRelease(el, x, y);
    return true;
  };

  /* Put the pointer somewhere and leave it there: a comment's "..." button only
   * exists while the pointer is over the comment. */
  const hoverAt = async (x, y) => {
    const el = document.elementFromPoint(x, y);
    if (!el) return false;
    moveOver(el, x, y);
    await sleep(60);
    fire(el, 'pointermove', pointerInit(x, y, 0), PointerEvent);
    fire(el, 'mousemove', mouseInit(x, y, 0), MouseEvent);
    return true;
  };

  /* Select everything already in an editable box, so an insertion REPLACES it.
   * Facebook restores unsent drafts into both the composer and the comment
   * field; without this the draft would be published together with the post. */
  const focusAndSelectAll = (el) => {
    el.focus({ preventScroll: true });
    const existing = norm(el.innerText);
    const sel = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(el);
    sel.removeAllRanges();
    sel.addRange(range);
    return existing;
  };

  const landed = (el, text) => {
    const got = norm(el.innerText);
    const wanted = norm(text);
    if (!wanted) return true;
    // Lexical renders a long text with its own line breaks; a prefix is enough
    // to know the insertion took. The caller compares the whole field after.
    return got.includes(wanted.slice(0, Math.min(40, wanted.length)));
  };

  /* Put text in a focused editable. Facebook's composer is a Lexical editor:
   * it listens for paste and beforeinput, not for DOM writes, so text assigned
   * to the node is thrown away on the next keystroke.
   *
   * Paste comes first because it is the only path that keeps a multi-line text
   * as several lines; execCommand handles single lines just as well and is the
   * closer match to typing. */
  const insertText = async (el, text) => {
    el.focus({ preventScroll: true });
    const tries = [];

    const dt = new DataTransfer();
    dt.setData('text/plain', text);
    const pasted = !el.dispatchEvent(new ClipboardEvent('paste', {
      clipboardData: dt,
      bubbles: true,
      cancelable: true,
      composed: true,
    }));
    await sleep(250);
    tries.push('paste');
    if (pasted && landed(el, text)) return { ok: true, method: 'paste', text: norm(el.innerText) };

    try {
      if (document.execCommand('insertText', false, text)) {
        await sleep(250);
        tries.push('execCommand');
        if (landed(el, text)) return { ok: true, method: 'execCommand', text: norm(el.innerText) };
      }
    } catch (_) { /* fall through */ }

    // Last resort: describe the edit the way the browser would, then make it.
    const before = new InputEvent('beforeinput', {
      bubbles: true,
      cancelable: true,
      composed: true,
      inputType: 'insertText',
      data: text,
    });
    if (el.dispatchEvent(before)) {
      const sel = window.getSelection();
      if (sel && sel.rangeCount) {
        const range = sel.getRangeAt(0);
        range.deleteContents();
        range.insertNode(document.createTextNode(text));
        range.collapse(false);
      } else {
        el.textContent = text;
      }
      el.dispatchEvent(new InputEvent('input', {
        bubbles: true,
        composed: true,
        inputType: 'insertText',
        data: text,
      }));
    }
    await sleep(250);
    tries.push('beforeinput');
    return {
      ok: landed(el, text),
      method: tries.join('+'),
      text: norm(el.innerText),
    };
  };

  /* The comment field has no submit button -- Enter sends it. */
  const pressEnter = async (el) => {
    const target = el || document.activeElement;
    if (!target) return false;
    target.focus({ preventScroll: true });
    const init = {
      key: 'Enter',
      code: 'Enter',
      keyCode: 13,
      which: 13,
      bubbles: true,
      cancelable: true,
      composed: true,
      view: window,
    };
    const open = target.dispatchEvent(new KeyboardEvent('keydown', init));
    if (open) {
      target.dispatchEvent(new KeyboardEvent('keypress', init));
      // Nothing swallowed the keydown, so the editor may be waiting for the
      // edit itself rather than for the key.
      target.dispatchEvent(new InputEvent('beforeinput', {
        bubbles: true,
        cancelable: true,
        composed: true,
        inputType: 'insertParagraph',
      }));
    }
    target.dispatchEvent(new KeyboardEvent('keyup', init));
    await sleep(200);
    return true;
  };

  /* Hand a file to a file input the way a file picker does. The bytes arrive
   * base64-encoded from the service worker, which is the side that may fetch
   * the image's host. */
  const setFileInput = (selector, file) => {
    const inputs = Array.from(document.querySelectorAll(selector))
      .filter((i) => /image/.test(i.accept || ''));
    const input = inputs[0];
    if (!input) return { ok: false, reason: 'no image file input in the composer' };
    const binary = atob(file.base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    const handed = new File([bytes], file.name || 'image.jpg', {
      type: file.mime || 'image/jpeg',
    });
    const dt = new DataTransfer();
    dt.items.add(handed);
    input.files = dt.files;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    return { ok: true, bytes: bytes.length };
  };

  F.act = {
    sleep,
    click,
    clickAt,
    hoverAt,
    hoverElement,
    focusAndSelectAll,
    insertText,
    pressEnter,
    setFileInput,
  };
})();
