/* Dans quel profil NSTBrowser tourne-t-on ? Une extension ne le sait pas.
 *
 * On ouvre un bref onglet portant un jeton unique, on liste les navigateurs
 * lancés par l'API locale de NSTBrowser, puis les onglets de chacun (port de
 * débogage) : celui qui montre le jeton est le nôtre. Même méthode que
 * l'extension d'adhésion aux groupes.
 */
const NST_API = 'http://localhost:8848/api/v2';

export class NstDetectError extends Error {}

export async function detectNstProfile(nstApiKey) {
  if (!nstApiKey) throw new NstDetectError('Cle de l’API locale NSTBrowser absente');
  let body;
  try {
    const res = await fetch(`${NST_API}/browsers?status=running`, { headers: { 'x-api-key': nstApiKey } });
    body = await res.json().catch(() => ({}));
    if (!res.ok || body.err) throw new NstDetectError(`NSTBrowser : ${body.msg || res.status}`);
  } catch (err) {
    if (err instanceof NstDetectError) throw err;
    throw new NstDetectError('API locale NSTBrowser injoignable (localhost:8848)');
  }
  const browsers = (Array.isArray(body.data) ? body.data : []).filter((b) => b && b.remoteDebuggingPort);
  if (!browsers.length) throw new NstDetectError('Aucun navigateur NSTBrowser lance');

  const token = crypto.randomUUID();
  const tab = await chrome.tabs.create({ url: chrome.runtime.getURL(`src/whoami.html?t=${token}`), active: false });
  try {
    for (let attempt = 0; attempt < 6; attempt += 1) {
      for (const b of browsers) {
        const targets = await fetch(`http://127.0.0.1:${b.remoteDebuggingPort}/json/list`)
          .then((r) => r.json())
          .catch(() => []);
        if (Array.isArray(targets) && targets.some((t) => String(t.url || '').includes(token))) {
          return { profileId: String(b.profileId), name: String(b.name || b.profileName || '') };
        }
      }
      await new Promise((r) => setTimeout(r, 500));
    }
    throw new NstDetectError('Profil courant introuvable parmi les navigateurs NSTBrowser lances');
  } finally {
    chrome.tabs.remove(tab.id).catch(() => {});
  }
}
