/* Shared scaffolding: the extension's modules expect a `chrome` and the content
 * scripts expect a DOM, so both get the smallest stand-in that lets the logic
 * under test run. No dependencies -- the Python suite is stdlib-only too.
 */

export function stubChrome() {
  const store = new Map();
  const chrome = {
    storage: {
      local: {
        async get(key) {
          if (key === undefined || key === null) return Object.fromEntries(store);
          const keys = Array.isArray(key) ? key : [key];
          const out = {};
          for (const k of keys) if (store.has(k)) out[k] = store.get(k);
          return out;
        },
        async set(values) {
          for (const [k, v] of Object.entries(values)) store.set(k, v);
        },
        async remove(key) { store.delete(key); },
      },
    },
    alarms: { create: async () => {}, clear: async () => {}, onAlarm: { addListener() {} } },
    tabs: {
      create: async () => ({ id: 1, windowId: 1 }),
      get: async () => ({ id: 1, status: 'complete' }),
      update: async () => ({ id: 1, windowId: 1 }),
      sendMessage: async () => ({ ok: true }),
      onUpdated: { addListener() {}, removeListener() {} },
      onRemoved: { addListener() {} },
    },
    windows: { update: async () => {} },
    scripting: { executeScript: async () => [] },
    runtime: { onMessage: { addListener() {} }, onStartup: { addListener() {} }, onInstalled: { addListener() {} } },
  };
  globalThis.chrome = chrome;
  return { chrome, store };
}

/* Load one content script -- a classic script that hangs itself on globalThis --
 * into this process, with whatever DOM stand-in the test provides. */
export async function loadContentScript(path, globals = {}) {
  const { readFile } = await import('node:fs/promises');
  const source = await readFile(new URL(path, import.meta.url), 'utf8');
  const scope = { globalThis: { FBX: globalThis.FBX || {} }, ...globals };
  const names = Object.keys(scope);
  // eslint-disable-next-line no-new-func
  const run = new Function(...names, `${source}\nreturn globalThis;`);
  return run(...names.map((n) => scope[n]));
}
