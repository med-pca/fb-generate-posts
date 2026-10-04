/* A small activity log, kept in storage so the popup can show it and so a
 * restarted service worker does not lose what it just did. */

const KEY = 'logs';
const MAX = 400;

export async function readLogs() {
  const stored = await chrome.storage.local.get(KEY);
  return stored[KEY] || [];
}

export async function addLog(level, message, extra = {}) {
  const line = {
    at: Date.now(),
    level,
    message: String(message).slice(0, 600),
    ...extra,
  };
  const logs = await readLogs();
  logs.push(line);
  await chrome.storage.local.set({ [KEY]: logs.slice(-MAX) });
  const to = level === 'ERROR' ? 'error' : level === 'WARN' ? 'warn' : 'log';
  console[to](`[fbx] ${message}`, extra);
  return line;
}

export const info = (message, extra) => addLog('INFO', message, extra);
export const warn = (message, extra) => addLog('WARN', message, extra);
export const error = (message, extra) => addLog('ERROR', message, extra);

export async function clearLogs() {
  await chrome.storage.local.set({ [KEY]: [] });
}
