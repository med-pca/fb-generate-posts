/**
 * Le mode sélection : on survole les publications de la page, celle sous la
 * souris s'encadre, et un clic la capture — texte déplié, image, lien.
 *
 * Injecté après `capture.js`, dont il reprend la lecture (`__fcpCatch`).
 * Le popup se ferme dès qu'on clique dans la page : la capture est donc
 * rangée dans `chrome.storage.local`, où le popup la retrouve à sa
 * réouverture.
 *
 * Cliquer sur une photo prend CETTE photo (utile sur un post à plusieurs
 * images) ; cliquer ailleurs dans le post prend la plus grande.
 */
(() => {
  const CAPTURE_KEY = 'fcp.capture';
  const Z = '2147483647';
  const api = window.__fcpCatch;
  if (!api) return;
  // Relancé depuis le popup alors qu'il tourne déjà : on repart de zéro.
  window.__fcpPicker?.stop();

  const ui = (tag, css) => {
    const el = document.createElement(tag);
    el.dataset.fcpUi = '';
    el.style.cssText = css;
    return el;
  };
  const frame = ui(
    'div',
    `position:fixed;pointer-events:none;z-index:${Z};border:3px solid #1b74e4;` +
      'border-radius:10px;background:rgba(27,116,228,.08);display:none;' +
      'transition:all .08s ease-out;box-shadow:0 0 0 4000px rgba(0,0,0,.18);',
  );
  const bar = ui(
    'div',
    `position:fixed;top:14px;left:50%;transform:translateX(-50%);z-index:${Z};` +
      'padding:10px 16px;border-radius:999px;background:#1c1e21;color:#fff;' +
      'font:600 14px/1.3 system-ui,sans-serif;box-shadow:0 8px 24px rgba(0,0,0,.3);' +
      'display:flex;gap:12px;align-items:center;',
  );
  const barText = document.createElement('span');
  const cancel = ui(
    'button',
    'border:0;border-radius:999px;padding:5px 11px;background:#3a3b3c;color:#fff;' +
      'font:600 12px system-ui,sans-serif;cursor:pointer;',
  );
  cancel.textContent = 'Annuler (Échap)';
  bar.append(barText, cancel);

  let active = false;
  let hovered = null;
  const say = (message, tone = '#1c1e21') => {
    barText.textContent = message;
    bar.style.background = tone;
  };

  const show = (el) => {
    hovered = el;
    if (!el) {
      frame.style.display = 'none';
      return;
    }
    const box = el.getBoundingClientRect();
    Object.assign(frame.style, {
      display: 'block',
      top: `${box.top - 4}px`,
      left: `${box.left - 4}px`,
      width: `${box.width + 8}px`,
      height: `${box.height + 8}px`,
    });
  };

  /** Pendant la sélection, la page ne doit pas réagir : un clic sur une
   * photo ouvrirait la visionneuse, un clic sur un lien changerait de page. */
  const swallow = (event) => {
    if (!active || event.target.closest?.('[data-fcp-ui]')) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
  };

  const onMove = (event) => {
    if (!active || event.target.closest?.('[data-fcp-ui]')) return;
    const picked = api.pickAt(event.target);
    if (picked?.el !== hovered) show(picked?.el || null);
  };

  const onClick = async (event) => {
    if (!active || event.target.closest?.('[data-fcp-ui]')) return;
    swallow(event);
    active = false;
    frame.style.borderColor = '#f5a623';
    say('Lecture de la publication…');
    const post = await api.readAt(event.target, { x: event.clientX, y: event.clientY });
    if (!post || post.error || !post.caption || post.caption.length < 15) {
      say(post?.error || 'Aucun texte lisible ici — cliquez sur le texte ou la photo du post', '#b42318');
      frame.style.borderColor = '#d93025';
      // On laisse la main : un second essai ne demande pas de rouvrir le popup.
      active = true;
      return;
    }
    await chrome.storage.local.set({
      [CAPTURE_KEY]: { ...post, capturedAt: Date.now(), pageUrl: location.href },
    });
    frame.style.borderColor = '#1a7f37';
    frame.style.background = 'rgba(26,127,55,.10)';
    say(
      post.imageUrl
        ? '✓ Texte et image capturés — ouvrez l’extension pour choisir le site'
        : '✓ Texte capturé, sans image — ouvrez l’extension pour vérifier',
      '#1a7f37',
    );
    // Le service d'arrière-plan tente de rouvrir le popup tout seul ; s'il
    // n'y parvient pas, le message ci-dessus dit quoi faire.
    chrome.runtime.sendMessage({ type: 'fcp:captured' }).catch(() => {});
    setTimeout(stop, 2600);
  };

  const onKey = (event) => {
    if (event.key === 'Escape') stop();
  };

  const EVENTS = ['mousedown', 'mouseup', 'pointerdown', 'pointerup', 'auxclick', 'dblclick'];
  function stop() {
    active = false;
    window.removeEventListener('mousemove', onMove, true);
    window.removeEventListener('click', onClick, true);
    window.removeEventListener('keydown', onKey, true);
    for (const name of EVENTS) window.removeEventListener(name, swallow, true);
    frame.remove();
    bar.remove();
    delete window.__fcpPicker;
  }

  cancel.addEventListener('click', stop);
  document.documentElement.append(frame, bar);
  window.addEventListener('mousemove', onMove, true);
  window.addEventListener('click', onClick, true);
  window.addEventListener('keydown', onKey, true);
  for (const name of EVENTS) window.addEventListener(name, swallow, true);
  active = true;
  say('Cliquez sur la publication à reprendre — sur sa photo pour choisir celle-ci');
  window.__fcpPicker = { stop };
})();
