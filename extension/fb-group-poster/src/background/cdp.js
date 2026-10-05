/* Trusted input, through the browser's own debugger protocol.
 *
 * A content script can only build synthetic events (isTrusted = false), and
 * editing a comment is exactly where Facebook tells them apart: the comment's
 * "..." button is revealed by CSS `:hover`, which no script can fake, and the
 * edit box saves on a real Enter only. The Python worker never hit this
 * because app/browser/cdp.py drove Input.* over CDP -- chrome.debugger is the
 * same protocol, from inside the extension.
 *
 * Attaching shows Chrome's "is debugging this browser" bar for as long as the
 * session lasts, so a session is opened for one pass and closed right after.
 * Detaching never touches the tab itself.
 */

import { warn } from '../common/log.js';

const VERSION = '1.3';

export class CdpError extends Error {}

const attached = new Set();

/* Facebook asks "Leave site?" when a navigation interrupts an open editor, and
 * a trusted keystroke is a user gesture, so the dialog is allowed to appear.
 * While attached, accept it: nothing on the page is worth keeping. Registered
 * on first use, so a browser without chrome.debugger still loads the worker. */
let listening = false;
function listen() {
  if (listening) return;
  listening = true;
  chrome.debugger.onEvent.addListener((source, method) => {
    if (method !== 'Page.javascriptDialogOpening' || !attached.has(source.tabId)) return;
    chrome.debugger
      .sendCommand({ tabId: source.tabId }, 'Page.handleJavaScriptDialog', { accept: true })
      .catch(() => null);
  });
  chrome.debugger.onDetach.addListener((source) => {
    attached.delete(source.tabId);
  });
}

export async function attach(tabId) {
  if (!chrome.debugger) throw new CdpError('permission "debugger" absente : recharger l’extension');
  listen();
  if (attached.has(tabId)) return;
  try {
    await chrome.debugger.attach({ tabId }, VERSION);
  } catch (err) {
    // Left over from a service worker that died mid-pass: take it over.
    if (!/already attached/i.test(err.message || '')) throw new CdpError(err.message);
    await chrome.debugger.detach({ tabId }).catch(() => null);
    await chrome.debugger.attach({ tabId }, VERSION);
  }
  attached.add(tabId);
  await send(tabId, 'Page.enable').catch(() => null);
  // Typing needs a focused document; this keeps the page believing it has the
  // focus even when the window is behind another one.
  await send(tabId, 'Emulation.setFocusEmulationEnabled', { enabled: true }).catch(() => null);
}

/** Faire croire à la page qu'elle a le focus, sans toucher à celui du
 * système. Plusieurs profils NSTBrowser tournent sur la même machine : mettre
 * SA fenêtre au premier plan l'enlevait à celle d'un autre profil en pleine
 * saisie, dont le texte ou le commentaire échouait alors. `false` quand le
 * débogueur n'est pas disponible (outils de développement ouverts…). */
export async function emulateFocus(tabId) {
  try {
    await attach(tabId);
    await send(tabId, 'Emulation.setFocusEmulationEnabled', { enabled: true });
    // Une fenêtre cachée derrière une autre peut voir sa page « gelée » par
    // Chrome : Facebook cesse alors de dessiner (zone « Écrire quelque
    // chose… » absente). On la garde active.
    await send(tabId, 'Page.setWebLifecycleState', { state: 'active' }).catch(() => null);
    return true;
  } catch (_) {
    return false;
  }
}

export async function detach(tabId) {
  if (!attached.has(tabId)) return;
  attached.delete(tabId);
  try {
    await chrome.debugger.detach({ tabId });
  } catch (err) {
    await warn(`Debugger non detache : ${err.message}`);
  }
}

async function send(tabId, method, params = {}) {
  try {
    return await chrome.debugger.sendCommand({ tabId }, method, params);
  } catch (err) {
    throw new CdpError(`${method} : ${err.message}`);
  }
}

/* Move the pointer over a spot, without clicking. */
export function hover(tabId, x, y) {
  return send(tabId, 'Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, buttons: 0 });
}

/* The pointer has to MOVE to the target before pressing, and the press has to
 * carry the `buttons` bitmask a real press carries. */
export async function click(tabId, x, y) {
  const base = { x, y, button: 'left', clickCount: 1 };
  await hover(tabId, x, y);
  await send(tabId, 'Input.dispatchMouseEvent', { type: 'mousePressed', buttons: 1, ...base });
  await send(tabId, 'Input.dispatchMouseEvent', { type: 'mouseReleased', buttons: 0, ...base });
}

/* Into whatever holds the focus, the way a paste would. */
export function insertText(tabId, text) {
  return send(tabId, 'Input.insertText', { text });
}

async function key(tabId, name, code, extra = {}) {
  const base = { key: name, code: name, windowsVirtualKeyCode: code, nativeVirtualKeyCode: code };
  await send(tabId, 'Input.dispatchKeyEvent', { type: 'keyDown', ...base, ...extra });
  await send(tabId, 'Input.dispatchKeyEvent', { type: 'keyUp', ...base });
}

/* React listens on keydown and ignores events without the virtual key code. */
export function pressEnter(tabId) {
  return key(tabId, 'Enter', 13, { text: '\r', unmodifiedText: '\r' });
}

export function pressEscape(tabId) {
  return key(tabId, 'Escape', 27);
}
