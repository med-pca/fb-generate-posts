/* The working tab, and the wire to the code running inside it.
 *
 * This is what replaces app/browser/cdp.py. Two differences are worth knowing:
 *
 *  - Navigation belongs here, not to the page: a content script dies with its
 *    document, so a step can never navigate and then keep working.
 *  - The tab is reused and never closed. The project's CLAUDE.md is explicit
 *    about that: closing Facebook tabs is the operator's business.
 */

import { info, warn } from '../common/log.js';

const TAB_KEY = 'workTabId';
const CONTENT_FILES = [
  'src/content/helpers.js',
  'src/content/interact.js',
  'src/content/steps.js',
  'src/content/main.js',
];

export class TabError extends Error {}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function remembered() {
  const stored = await chrome.storage.local.get(TAB_KEY);
  const tabId = stored[TAB_KEY];
  if (!tabId) return null;
  try {
    const tab = await chrome.tabs.get(tabId);
    return tab && tab.id ? tab : null;
  } catch (_) {
    return null; // the operator closed it
  }
}

/* The tab this profile works in: the one from last time, or a new one. */
export async function workTab(config) {
  const existing = await remembered();
  if (existing && config.reuseWorkTab) return existing;
  const tab = await chrome.tabs.create({
    url: 'https://www.facebook.com/',
    active: Boolean(config.focusWorkTab),
  });
  await chrome.storage.local.set({ [TAB_KEY]: tab.id });
  await info(`Onglet de travail ouvert (#${tab.id})`);
  return tab;
}

export async function forgetTab() {
  await chrome.storage.local.remove(TAB_KEY);
}

/* Chrome inserts text only into a focused document, so the tab has to be the
 * active one while the composer is being filled. */
export async function focus(tabId) {
  try {
    const tab = await chrome.tabs.update(tabId, { active: true });
    if (tab && tab.windowId !== undefined) {
      await chrome.windows.update(tab.windowId, { focused: true, drawAttention: false });
    }
  } catch (err) {
    await warn(`Impossible de mettre l'onglet au premier plan : ${err.message}`);
  }
}

/* The manifest injects the content script on every Facebook page, but a freshly
 * reloaded extension has no script in the pages that were already open. */
async function ensureContentScript(tabId) {
  try {
    await chrome.scripting.executeScript({ target: { tabId }, files: CONTENT_FILES });
    return true;
  } catch (err) {
    throw new TabError(`Impossible d'injecter le script dans l'onglet : ${err.message}`);
  }
}

async function ping(tabId) {
  try {
    const answer = await chrome.tabs.sendMessage(tabId, { type: 'fbx-step', name: 'ping', args: {} });
    return Boolean(answer && answer.ok);
  } catch (_) {
    return false;
  }
}

async function waitForContentScript(tabId, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let injected = false;
  while (Date.now() < deadline) {
    if (await ping(tabId)) return true;
    if (!injected) {
      await ensureContentScript(tabId);
      injected = true;
    }
    await sleep(500);
  }
  return false;
}

/* Wait for a page to finish loading. Nothing here assumes the page is idle
 * afterwards: Facebook renders its controls well after "complete", which is why
 * every step polls. */
function waitForLoad(tabId, timeoutMs) {
  return new Promise((resolve) => {
    let done = false;
    const finish = (value) => {
      if (done) return;
      done = true;
      chrome.tabs.onUpdated.removeListener(onUpdated);
      clearTimeout(timer);
      resolve(value);
    };
    const onUpdated = (id, change) => {
      if (id === tabId && change.status === 'complete') finish(true);
    };
    const timer = setTimeout(() => finish(false), timeoutMs);
    chrome.tabs.onUpdated.addListener(onUpdated);
    chrome.tabs.get(tabId).then((tab) => {
      if (tab && tab.status === 'complete' && !tab.pendingUrl) finish(true);
    }).catch(() => finish(false));
  });
}

export async function navigate(tabId, url, config) {
  // An open comment editor is what makes Facebook ask "Leave site?".
  await step(tabId, 'dismissEditors', {}, 5000).catch(() => null);
  const timeoutMs = config.navigationTimeoutSeconds * 1000;
  await chrome.tabs.update(tabId, { url });
  await sleep(300);
  const loaded = await waitForLoad(tabId, timeoutMs);
  if (!loaded) await warn(`La page n'a pas fini de charger dans les ${config.navigationTimeoutSeconds}s : ${url}`);
  const ready = await waitForContentScript(tabId, Math.max(15000, timeoutMs / 2));
  if (!ready) throw new TabError(`L'onglet ne repond pas apres l'ouverture de ${url}`);
  return true;
}

/* Run one step in the page. The step polls the DOM itself, so the timeout here
 * is only a backstop against a page that stopped answering at all. */
export async function step(tabId, name, args = {}, timeoutMs = 60000) {
  const send = () => chrome.tabs.sendMessage(tabId, { type: 'fbx-step', name, args });
  const guard = new Promise((_, reject) => {
    setTimeout(() => reject(new TabError(`L'etape "${name}" n'a pas repondu en ${Math.round(timeoutMs / 1000)}s`)), timeoutMs);
  });
  let answer;
  try {
    answer = await Promise.race([send(), guard]);
  } catch (err) {
    if (err instanceof TabError) throw err;
    // "Could not establish connection": the page was replaced under us.
    await ensureContentScript(tabId);
    answer = await Promise.race([send(), guard]);
  }
  if (!answer) throw new TabError(`L'etape "${name}" n'a rien renvoye`);
  return answer;
}
