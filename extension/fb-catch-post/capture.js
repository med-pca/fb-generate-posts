/**
 * Lit la publication que l'utilisateur a sous les yeux.
 *
 * Ce fichier est injecté d'un bloc et sa dernière expression est ce que
 * `chrome.scripting.executeScript` rapporte — d'où l'appel final. Le faire en
 * deux temps obligerait à compter sur la portée globale du monde isolé.
 *
 * Injecté dans l'onglet Facebook au moment du clic. Ne modifie rien : il
 * déplie seulement les textes tronqués, puis lit. Facebook renomme ses
 * classes à chaque déploiement, donc rien ici n'en dépend : le texte est
 * cherché là où Facebook n'a pas bougé depuis des années, et l'image est
 * choisie sur sa taille à l'écran — ce qui survit à un changement de balisage
 * qu'aucun sélecteur ne suivrait.
 */
function captureFacebookPost() {
  const norm = (s) => (s || '').replace(/\u00a0/g, ' ').replace(/[ \t]+/g, ' ').trim();
  // `innerText` rend le texte tel qu'il s'affiche, mais une chaîne vide
  // sur un nœud masqué : `textContent` prend alors le relais.
  const text = (el) => norm(el && (el.innerText || el.textContent));

  // « Voir plus » cache la fin d'un texte long : tant qu'on n'a pas cliqué,
  // la suite n'est pas dans la page.
  const SEE_MORE = /^(see more|voir plus|afficher la suite|ver más|mehr anzeigen|عرض المزيد)$/i;
  for (const el of document.querySelectorAll('[role="button"], div[tabindex="0"], span')) {
    const label = text(el);
    if (label && label.length < 30 && SEE_MORE.test(label)) el.click();
  }

  // Sur une permalink il n'y a qu'un article ; dans un fil, on prend celui
  // que l'utilisateur regarde — le plus proche du centre de l'écran.
  const articles = Array.from(document.querySelectorAll('div[role="article"]'))
    .filter((a) => !/comment|commentaire|تعليق/i.test(a.getAttribute('aria-label') || ''));
  const middle = window.innerHeight / 2;
  let article = null;
  let best = Infinity;
  for (const candidate of articles) {
    const box = candidate.getBoundingClientRect();
    if (box.height < 120) continue;
    const distance = Math.abs(box.top + box.height / 2 - middle);
    if (distance < best) { best = distance; article = candidate; }
  }
  const root = article || document;

  // Ces deux attributs de données ont survécu bien plus longtemps que
  // n'importe quelle classe. Le texte de l'article entier est le dernier
  // recours : il embarque l'auteur, la date et les compteurs de réactions.
  let caption = '';
  for (const selector of [
    'div[data-ad-preview="message"]',
    'div[data-ad-comet-preview="message"]',
    '[data-testid="post_message"]',
  ]) {
    const found = text(root.querySelector(selector));
    if (found.length > caption.length) caption = found;
  }
  if (!caption) {
    const meta = document.querySelector('meta[property="og:description"]');
    caption = norm(meta && meta.getAttribute('content'));
  }

  // La photo, choisie sur sa taille réelle : les avatars, réactions et
  // icônes sont petits, la pièce jointe ne l'est pas.
  let imageUrl = '';
  let widest = 0;
  for (const img of root.querySelectorAll('img')) {
    const src = img.currentSrc || img.src || '';
    if (!src.startsWith('https:')) continue;
    const box = img.getBoundingClientRect();
    if (Math.min(box.width, box.height) < 180) continue;
    const area = box.width * box.height;
    if (area > widest) { widest = area; imageUrl = src; }
  }

  // Le lien de la publication : sa permalink si la page en montre une,
  // sinon l'adresse courante.
  let facebookUrl = location.href.split('?')[0];
  for (const a of root.querySelectorAll('a[href]')) {
    const href = a.href || '';
    if (/\/(posts|permalink|videos|photos)\/|story_fbid=|multi_permalinks=/.test(href)) {
      facebookUrl = href.split('?')[0];
      break;
    }
  }

  return {
    caption,
    imageUrl,
    facebookUrl,
    // Distingué d'une publication vide : la page n'a pas chargé ce qu'il
    // fallait, ou ce compte ne voit pas ce contenu.
    blocked: /log in|connectez-vous|s.identifier|تسجيل الدخول/i.test(
      text(document.body).slice(0, 400)),
    postsOnPage: articles.length,
  };
}

// Dernière expression du fichier : c'est elle que l'injection rapporte.
captureFacebookPost();
