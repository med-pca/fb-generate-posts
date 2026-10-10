/* Agir comme une personne : de VRAIS gestes, pas des événements simulés.
 *
 * Un `element.click()` en JavaScript se reconnaît (l'événement n'est pas
 * « de confiance ») : c'est ce qui trahit un automate. Ici, la page dit où
 * est l'élément ; l'extension (background.js) déplace la souris en courbe
 * jusqu'à lui, appuie, relâche, ou tape lettre par lettre, par le protocole
 * du navigateur (chrome.debugger) — des gestes que Facebook ne distingue pas
 * de ceux d'une main. Sans ce canal (refusé, onglet fermé), on retombe sur
 * l'ancien geste simulé plutôt que de bloquer la mission.
 *
 * Injecté avant check.js et members.js ; expose self.FPH.
 */
(() => {
  if (self.FPH) return;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const rand = (a, b) => a + Math.random() * (b - a);

  const ask = (msg) =>
    new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage({ type: 'pf-input', ...msg }, (answer) => resolve(chrome.runtime.lastError ? null : answer));
      } catch {
        resolve(null);
      }
    });

  /** Amener l'élément à l'écran, laisser le défilement finir, et viser un
   * point au hasard vers son centre (jamais deux fois le même pixel). */
  async function point(el) {
    if (!el || !el.isConnected || typeof el.getBoundingClientRect !== 'function') return null;
    if (typeof el.scrollIntoView === 'function') el.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'smooth' });
    const r0 = el.getBoundingClientRect();
    // Sans boîte (page sans rendu) : rien à viser, on n'attend pas.
    if (!r0.width || !r0.height) return null;
    await sleep(rand(450, 1100));
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) return null;
    return { x: r.left + r.width * rand(0.3, 0.7), y: r.top + r.height * rand(0.3, 0.7) };
  }

  async function click(el) {
    const p = await point(el);
    const done = p ? await ask({ action: 'click', ...p }) : null;
    if (!done || !done.ok) {
      el.click();
      return;
    }
    await sleep(rand(250, 700));
  }

  async function hover(el) {
    const p = await point(el);
    const done = p ? await ask({ action: 'move', ...p }) : null;
    if (!done || !done.ok) el.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
  }

  /** Cliquer dans le champ, puis taper le texte comme quelqu'un. */
  async function type(el, text) {
    await click(el);
    const done = await ask({ action: 'type', text: String(text) });
    if (done && done.ok) return true;
    const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value')?.set;
    el.focus();
    if (setter) setter.call(el, text);
    else el.value = text;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }

  async function key(name) {
    const done = await ask({ action: 'key', key: name });
    if (!done || !done.ok) {
      const target = document.activeElement || document;
      target.dispatchEvent(new KeyboardEvent('keydown', { key: name, code: name, bubbles: true }));
    }
    await sleep(rand(200, 500));
  }

  self.FPH = { click, hover, type, key };
})();
