/* The page side of the wire: run one named step and report a plain-data result.
 *
 * Only data crosses back to the service worker, so every DOM node a step used
 * internally is stripped here -- an element cannot be structured-cloned, and
 * trying to send one fails the whole call.
 */
(() => {
  'use strict';
  const F = (globalThis.FBX = globalThis.FBX || {});
  if (F.listening) return;
  F.listening = true;

  const clean = (value, depth = 0) => {
    if (value === null || value === undefined) return value;
    if (typeof value === 'function' || typeof value === 'symbol') return undefined;
    if (typeof value !== 'object') return value;
    if (value instanceof Node || value instanceof Window) return undefined;
    if (depth > 4) return undefined;
    if (Array.isArray(value)) return value.map((v) => clean(v, depth + 1)).filter((v) => v !== undefined);
    const out = {};
    for (const [key, raw] of Object.entries(value)) {
      const kept = clean(raw, depth + 1);
      if (kept !== undefined) out[key] = kept;
    }
    return out;
  };

  /* Best effort before the service worker navigates the tab: an open comment
   * editor is what makes Facebook ask "Leave site?". (The dialog needs a real
   * user gesture on the tab to be allowed at all, and the extension's own
   * events are not one -- but closing the editor costs nothing.) */
  F.steps.dismissEditors = async () => {
    const init = { key: 'Escape', code: 'Escape', keyCode: 27, which: 27, bubbles: true, cancelable: true };
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    document.body.dispatchEvent(new KeyboardEvent('keydown', init));
    document.body.dispatchEvent(new KeyboardEvent('keyup', init));
    return { ok: true };
  };

  chrome.runtime.onMessage.addListener((message, _sender, respond) => {
    if (!message || message.type !== 'fbx-step') return false;
    const step = F.steps[message.name];
    if (!step) {
      respond({ ok: false, reason: `unknown step "${message.name}"` });
      return false;
    }
    const args = message.args || {};
    if (args.author !== undefined) F.dom.setAuthor(args.author);
    Promise.resolve()
      .then(() => step(args))
      .then((result) => respond(clean(result || { ok: false, reason: 'the step returned nothing' })))
      .catch((err) => respond({ ok: false, reason: `${message.name} raised: ${err && err.message ? err.message : err}` }));
    return true; // the answer comes later
  });
})();
