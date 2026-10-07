import {
  BadGatewayException,
  BadRequestException,
  Injectable,
} from '@nestjs/common';
import { Readability } from '@mozilla/readability';
import { JSDOM, VirtualConsole } from 'jsdom';
import { assertSafeRemoteUrl } from '../common/safe-fetch';

/** Ce que la page source fournit au réécriveur. Rien d'ici n'est publié tel
 * quel : c'est la matière première, gardée pour pouvoir rejouer la
 * réécriture sans retourner chercher la page. */
export type SourceArticle = {
  /** L'URL réellement lue, après redirections. */
  url: string;
  title: string;
  text: string;
  excerpt: string | null;
  leadImageUrl: string | null;
  siteName: string | null;
  /** La langue déclarée par la page, en code à deux lettres. Réécrire n'est
   * pas traduire : c'est elle qui décide de la langue de l'article. */
  language: string | null;
  /** Les pages lues, dans l'ordre : un article coupé en « page suivante »
   * est lu en entier, pas seulement sa première page. */
  pageUrls?: string[];
  /** Pourquoi la lecture s'est arrêtée là : sans ça, un article lu à moitié
   * ne se voit qu'au résultat. */
  pageStop?: string;
  /** Le nombre de pages de l'article quand il est lu d'un bloc (API
   * WordPress) plutôt que page après page. */
  pages?: number;
};

/** Au-delà, on s'arrête : un article en 30 pages est une galerie, et une
 * boucle de liens ne doit pas tourner sans fin. */
const MAX_PAGES = 20;
/** Le texte gardé, toutes pages comprises : de quoi nourrir le modèle sans
 * lui envoyer un livre. */
const MAX_TOTAL_TEXT = 60_000;

/** Les liens qui disent « page suivante » DE CET ARTICLE. « Article
 * suivant » / « Next post » n'y sont pas : ce serait un autre article. */
const NEXT_PAGE_LABELS = [
  'next page', 'continue to next page', 'continue on next page', 'continue reading on the next page', 'go to next page',
  'page suivante', 'suite page suivante', 'lire la suite page suivante', 'continuer a la page suivante',
  'pagina siguiente', 'siguiente pagina', 'proxima pagina', 'pagina seguinte', 'naechste seite', 'nachste seite',
  'pagina successiva', 'pagina dopo', 'sonraki sayfa', 'nastepna strona', 'volgende pagina',
  'الصفحة التالية', 'الصفحه التاليه',
];
/** Libellés courts et ambigus (« Next », « Suivant », « › ») : acceptés
 * seulement quand le lien mène à la page numérotée suivante du même article. */
const NEXT_SHORT_LABELS = ['next', 'suivant', 'suivante', 'siguiente', 'proxima', 'weiter', 'avanti', 'التالي', 'التاليه', '›', '»', '→', '>', '>>'];
/** Les blocs de pagination habituels (WordPress `wp_link_pages`, thèmes). */
const PAGINATION_LINKS = [
  '.page-links a', 'a.post-page-numbers', '.post-pagination a', '.pagination a', '.nav-links a',
  'a.page-numbers', '[class*="paginat"] a', '[class*="pager"] a', '[class*="page-nav"] a',
  '[class*="next-page"] a', 'a[class*="next-page"]', 'a[class*="nextpage"]',
].join(', ');
const PAGE_PARAMS = ['page', 'paged', 'pg', 'p', 'pagina', 'pag', 'seite', 'pagenum'];

const foldLabel = (value: string) =>
  value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f\u064b-\u065f\u0670\u0640]/g, '')
    .replace(/\u0629/g, '\u0647')
    .replace(/ä/g, 'ae')
    .replace(/[^\p{L}\p{N}›»→>]+/gu, ' ')
    .trim()
    .toLowerCase();

/** Une page d'un article : son « socle » (l'adresse sans numéro de page) et
 * son numéro. `/recette/2/`, `/recette/page/2`, `/recette?page=2`,
 * `/recette-page-2.html` → socle `/recette`, page 2. */
export function pageOf(raw: string | URL) {
  const url = new URL(raw.toString());
  const path = url.pathname.replace(/\/+$/, '') || '/';
  for (const name of PAGE_PARAMS) {
    const value = url.searchParams.get(name);
    if (value && /^\d{1,3}$/.test(value)) {
      return { base: `${url.host}${path}`.toLowerCase(), page: Number(value) };
    }
  }
  const patterns: RegExp[] = [
    /^(.*)\/page\/(\d{1,3})$/i,
    /^(.*)-page-?(\d{1,3})(?:\.html?)?$/i,
    // `/recette/2` : seulement un petit nombre, un identifiant d'article
    // (`/recette/48213`) n'est pas un numéro de page.
    /^(.*\/[^/]*[a-z][^/]*)\/(\d{1,2})$/i,
  ];
  for (const pattern of patterns) {
    const match = pattern.exec(path);
    if (match) return { base: `${url.host}${match[1]}`.toLowerCase(), page: Number(match[2]) };
  }
  return { base: `${url.host}${path.replace(/\.html?$/i, '')}`.toLowerCase(), page: 1 };
}

/** L'adresse de la page suivante de l'article affiché, ou null.
 *
 * Priorité au lien vers la page numérotée qui suit (même socle, numéro + 1,
 * sinon le plus petit numéro supérieur) ; à défaut, un lien qui dit
 * explicitement « page suivante » sur le même site. Jamais une page déjà lue. */
export function findNextPage(document: Document, currentUrl: string, visited: Set<string>) {
  const current = new URL(currentUrl);
  const here = pageOf(current);
  const seen = (url: URL) => visited.has(url.href.replace(/#.*$/, ''));
  let numbered: { url: URL; page: number } | null = null;
  let labelled: URL | null = null;

  const consider = (href: string | null, label: string, strong: boolean) => {
    if (!href || /^(#|javascript:|mailto:)/i.test(href)) return;
    let url: URL;
    try {
      url = new URL(href, current);
    } catch {
      return;
    }
    url.hash = '';
    if (url.host !== current.host || !/^https?:$/.test(url.protocol) || seen(url)) return;
    const there = pageOf(url);
    const folded = foldLabel(label);
    if (there.base === here.base && there.page > here.page) {
      if (!numbered || there.page < numbered.page) numbered = { url, page: there.page };
      return;
    }
    if (labelled) return;
    if (strong || NEXT_PAGE_LABELS.some((l) => folded.includes(foldLabel(l)))) {
      if (url.pathname !== current.pathname || url.search !== current.search) labelled = url;
    }
  };

  // `rel="next"` dans l'en-tête : sûr seulement s'il reste dans l'article
  // (de vieux thèmes l'utilisent pour l'article suivant).
  document.querySelectorAll('link[rel~="next"]').forEach((link) => consider(link.getAttribute('href'), '', false));
  document.querySelectorAll(`a[rel~="next"], ${PAGINATION_LINKS}`).forEach((a) =>
    consider(a.getAttribute('href'), `${a.textContent || ''} ${a.getAttribute('aria-label') || ''}`, false),
  );
  document.querySelectorAll('a[href]').forEach((a) => {
    const text = `${a.textContent || ''} ${a.getAttribute('aria-label') || ''} ${a.getAttribute('title') || ''}`;
    const folded = foldLabel(text);
    if (NEXT_PAGE_LABELS.some((l) => folded.includes(foldLabel(l)))) consider(a.getAttribute('href'), text, true);
    else if (NEXT_SHORT_LABELS.includes(folded)) consider(a.getAttribute('href'), '', false);
  });
  const best: URL | null = numbered ? (numbered as { url: URL }).url : labelled;
  return best ? best.toString() : null;
}

/** Ce qui entoure un article sans en faire partie. Laissé en place, il
 * trompe l'extraction : sur une page courte, le formulaire « Leave a Reply »
 * pèse plus lourd que le texte et passe pour l'article (vu sur
 * tastykitchen.delicedcook.com : pages 13 à 19 perdues). */
const NOISE = [
  'script', 'style', 'noscript', 'iframe', 'ins', 'form', 'nav', 'aside',
  '#comments', '#respond', '.comments-area', '.comment-respond', '.comment-list',
  '.post-navigation', '.navigation', '.post-page-nav', '.page-links', '.pagination',
  '.sharedaddy', '.jp-relatedposts', '.related-posts', '.yarpp-related', '.crp_related',
].join(', ');
/** Le bloc du texte, chez WordPress et les thèmes courants. */
const CONTENT = '[itemprop="articleBody"], .entry-content, .post-content, .td-post-content, .single-content, .article-content, .post-body';
/** Les étiquettes posées au-dessus des emplacements publicitaires. */
const AD_LABEL = /^(publicidad|publicité|publicite|advertisement|advertisements|anuncio|werbung|pubblicità|publicidade|reklame|annonce|sponsored|ad|ads)$/i;

/** L'adresse de l'article dans l'API WordPress, quand la page en est une :
 * le lien que WordPress déclare lui-même, sinon l'identifiant de l'article
 * (`?p=3428`, lien court, classe `postid-3428`). Toujours sur le même site. */
export function wordpressRestUrl(document: Document, pageUrl: string): string | null {
  const page = new URL(pageUrl);
  const declared = document.querySelector('link[rel="alternate"][type="application/json"]')?.getAttribute('href');
  if (declared && /wp\/v2\/posts\/\d+/.test(declared)) {
    try {
      const url = new URL(declared, page);
      if (url.host === page.host) return url.toString();
    } catch {
      // adresse illisible : on cherche l'identifiant autrement
    }
  }
  const shortlink = document.querySelector('link[rel="shortlink"]')?.getAttribute('href') || '';
  const id =
    /[?&]p=(\d+)/.exec(shortlink)?.[1] ||
    /(?:^|\s)postid-(\d+)(?:\s|$)/.exec(document.body?.className || '')?.[1] ||
    page.searchParams.get('p');
  return id && /^\d+$/.test(id) ? `${page.origin}/?rest_route=/wp/v2/posts/${id}` : null;
}

const MAX_BYTES = 2_000_000;
const MAX_REDIRECTS = 5;
const TIMEOUT_MS = 15_000;
/** En deçà, la page n'est pas un article : mur de connexion, sommaire,
 * redirection en JavaScript. Mieux vaut le dire que réécrire trois phrases. */
const MIN_TEXT_LENGTH = 300;
const USER_AGENT =
  'Mozilla/5.0 (compatible; DataFbPosting/1.0; +https://github.com/data-fb-posting)';

/** Le texte d'un article en garde les paragraphes : Readability rend un bloc
 * où les sauts portent la structure, et le modèle s'en sert. Seuls les
 * espaces horizontaux et les lignes vides en excès sont resserrés. */
export function normalizeText(value: string) {
  return value
    .replace(/\r\n?/g, '\n')
    .replace(/[^\S\n]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

@Injectable()
export class SourceReaderService {
  /** Lit la page indiquée et en extrait l'article. Échoue franchement dès que
   * la page n'en contient pas : le reste de la chaîne n'a rien à réécrire. */
  async read(sourceUrl: string): Promise<SourceArticle> {
    const { html, url } = await this.fetchHtml(sourceUrl);
    // `runScripts` laissé de côté et aucune ressource externe chargée : la
    // page est analysée, jamais exécutée.
    const dom = new JSDOM(html, { url, virtualConsole: new VirtualConsole() });
    const { document } = dom.window;
    const title = document.title;
    const language = this.language(document);
    const leadImageUrl = this.leadImage(document, url);
    const siteName = this.meta(document, 'og:site_name');
    const visited = new Set([url.replace(/#.*$/, ''), sourceUrl.replace(/#.*$/, '')]);
    let next = findNextPage(document, url, visited);
    // Un article WordPress se lit d'un bloc par son API : toutes les pages,
    // sans publicités ni pages vides. Des sites servent des pages HTML
    // incomplètes (page 4 = page 3, pages 13 à 19 vides) alors que l'API a
    // tout le texte.
    const restUrl = wordpressRestUrl(document, url);
    const whole = restUrl ? await this.readWordPress(restUrl).catch(() => null) : null;
    // Readability vide le document en l'analysant : tout ce qui vient de
    // `document` doit être lu avant.
    const own = this.contentText(document, MIN_TEXT_LENGTH);
    const article = new Readability(document).parse();
    const text = own ?? (article ? this.textFromHtml(article.content ?? '') : '');
    if (!article || text.length < MIN_TEXT_LENGTH) {
      throw new BadRequestException(
        'Aucun article exploitable sur cette page : vérifier que l’URL pointe bien vers le contenu',
      );
    }
    if (whole && whole.text.length >= Math.max(MIN_TEXT_LENGTH, text.length)) {
      return {
        url,
        title: this.cleanTitle(article.title || title || '', siteName),
        text: whole.text.slice(0, MAX_TOTAL_TEXT),
        pageUrls: [url],
        pages: whole.pages,
        pageStop: `lu en entier par l'API WordPress (${whole.pages} page(s))`,
        excerpt: article.excerpt ? normalizeText(article.excerpt) : null,
        leadImageUrl,
        siteName: siteName || article.siteName || null,
        language,
      };
    }
    // Un article coupé en pages (« page suivante ») : on lit la suite, page
    // après page, tant qu'il y en a une et qu'elle apporte du texte neuf.
    const parts = [text];
    const pageUrls = [url];
    let total = text.length;
    let pageStop = next ? '' : 'aucun lien « page suivante » trouvé';
    let useless = 0;
    while (next && !visited.has(next) && pageUrls.length < MAX_PAGES && total < MAX_TOTAL_TEXT) {
      visited.add(next);
      const target: string = next;
      const page = await this.readPage(target).catch((e: unknown) => {
        pageStop = `page ${pageUrls.length + 1} illisible (${target}) : ${e instanceof Error ? e.message : String(e)}`;
        return null;
      });
      if (!page) break;
      visited.add(page.url.replace(/#.*$/, ''));
      // Une page vide ou répétée est sautée (certains sites en servent au
      // milieu d'un article) ; trois d'affilée, et on s'arrête : le site
      // renvoie sans doute toujours la même page.
      if (!page.text || parts.some((part) => part === page.text)) {
        useless += 1;
        pageStop = `page ${page.url} vide ou identique`;
        if (useless >= 3 || !page.next) break;
        next = page.next;
        continue;
      }
      useless = 0;
      parts.push(page.text);
      pageUrls.push(page.url);
      total += page.text.length;
      next = page.next;
      pageStop = next ? '' : 'dernière page atteinte';
    }
    if (!pageStop) pageStop = pageUrls.length >= MAX_PAGES ? `limite de ${MAX_PAGES} pages` : total >= MAX_TOTAL_TEXT ? 'limite de texte atteinte' : 'lien déjà lu';
    return {
      url,
      title: this.cleanTitle(article.title || title || '', siteName),
      text: parts.join('\n\n').slice(0, MAX_TOTAL_TEXT),
      pageUrls,
      pageStop,
      excerpt: article.excerpt ? normalizeText(article.excerpt) : null,
      leadImageUrl,
      siteName: siteName || article.siteName || null,
      language,
    };
  }

  /** Une page suivante : son texte d'article, et le lien vers la suivante.
   * Une page illisible arrête la lecture sans faire échouer l'article : les
   * pages déjà lues restent bonnes. */
  private async readPage(pageUrl: string) {
    const { html, url } = await this.fetchHtml(pageUrl);
    const { document } = new JSDOM(html, { url, virtualConsole: new VirtualConsole() }).window;
    const next = findNextPage(document, url, new Set([url, pageUrl]));
    // Une page suivante peut être courte : quelques lignes suffisent.
    const own = this.contentText(document, 1);
    const article = own === null ? new Readability(document).parse() : null;
    const text = own ?? (article ? this.textFromHtml(article.content ?? '') : '');
    return { url, text, next };
  }

  /** L'article entier par l'API WordPress : le texte de toutes ses pages
   * (`<!--nextpage-->`), nettoyé comme une page. */
  private async readWordPress(restUrl: string) {
    const { html: body } = await this.fetchHtml(restUrl, 'json');
    const post = JSON.parse(body) as { content?: { rendered?: string; protected?: boolean } };
    const rendered = post.content?.rendered;
    if (!rendered || post.content?.protected) return null;
    const pages = rendered.split('<!--nextpage-->').length;
    const { document } = new JSDOM(`<body><div class="entry-content">${rendered.replace(/<!--nextpage-->/g, '')}</div></body>`, {
      virtualConsole: new VirtualConsole(),
    }).window;
    const text = this.contentText(document, 1);
    return text ? { text, pages } : null;
  }

  /** Retire de la page ce qui n'est pas l'article (commentaires, navigation,
   * publicités, articles voisins), puis rend le texte du bloc de contenu du
   * thème s'il y en a un — null sinon, et Readability prend le relais sur
   * la page nettoyée. À appeler APRÈS la recherche de la page suivante :
   * les liens de pagination sont retirés ici. */
  private contentText(document: Document, minLength: number): string | null {
    document.querySelectorAll(NOISE).forEach((el) => el.remove());
    document.querySelectorAll('p, span, div, small, figcaption').forEach((el) => {
      if (!el.children.length && AD_LABEL.test((el.textContent || '').trim())) el.remove();
    });
    let best: string | null = null;
    document.querySelectorAll(CONTENT).forEach((el) => {
      const text = this.textFromHtml(el.innerHTML);
      if (text.length >= minLength && (!best || text.length > best.length)) best = text;
    });
    return best;
  }

  /** Suit les redirections à la main : chaque étape repasse par le garde-fou.
   * Laisser `fetch` les suivre reviendrait à ne contrôler que la première
   * URL, alors qu'un hôte public peut rediriger vers une adresse interne. */
  private async fetchHtml(sourceUrl: string, kind: 'html' | 'json' = 'html') {
    let target = await assertSafeRemoteUrl(sourceUrl);
    for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
      const response = await this.get(target, kind);
      const location = response.headers.get('location');
      if (response.status >= 300 && response.status < 400 && location) {
        // Le corps d'une redirection ne sert à rien : le libérer évite de
        // laisser la connexion ouverte.
        await response.body?.cancel();
        target = await assertSafeRemoteUrl(
          new URL(location, target).toString(),
        );
        continue;
      }
      if (!response.ok) {
        throw new BadGatewayException(
          `La source a répondu avec le statut ${response.status}`,
        );
      }
      const type = response.headers.get('content-type') || '';
      if (!(kind === 'json' ? /application\/(.+\+)?json/i : /text\/html|application\/xhtml\+xml/i).test(type)) {
        throw new BadRequestException(
          `La source ne renvoie pas une page HTML (${type.split(';')[0] || 'type inconnu'})`,
        );
      }
      return {
        html: await this.readCapped(response, type),
        url: target.toString(),
      };
    }
    throw new BadGatewayException('La source enchaîne trop de redirections');
  }

  private async get(url: URL, kind: 'html' | 'json' = 'html') {
    try {
      return await fetch(url, {
        redirect: 'manual',
        signal: AbortSignal.timeout(TIMEOUT_MS),
        headers: {
          accept: kind === 'json' ? 'application/json' : 'text/html,application/xhtml+xml',
          'accept-language': '*',
          'user-agent': USER_AGENT,
        },
      });
    } catch {
      throw new BadGatewayException('Impossible de contacter la page source');
    }
  }

  /** Lit le corps en comptant les octets : un serveur qui annonce une taille
   * honnête puis en envoie mille fois plus est arrêté en cours de route. */
  private async readCapped(response: Response, contentType: string) {
    if (Number(response.headers.get('content-length') || 0) > MAX_BYTES) {
      throw new BadRequestException('Page source trop volumineuse');
    }
    const reader = response.body?.getReader();
    if (!reader) return '';
    const chunks: Uint8Array[] = [];
    let size = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > MAX_BYTES) {
        await reader.cancel();
        throw new BadRequestException('Page source trop volumineuse');
      }
      chunks.push(value);
    }
    const body = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      body.set(chunk, offset);
      offset += chunk.length;
    }
    return this.decode(body, contentType);
  }

  /** Un encodage annoncé mais inconnu ne doit pas faire échouer la lecture :
   * l'UTF-8 reste le repli le plus probable. */
  private decode(body: Uint8Array, contentType: string) {
    const charset = /charset=["']?([\w-]+)/i.exec(contentType)?.[1];
    try {
      return new TextDecoder(charset || 'utf-8').decode(body);
    } catch {
      return new TextDecoder('utf-8').decode(body);
    }
  }

  /** `textContent` colle les blocs les uns aux autres : deux cellules d'un
   * tableau d'information en ressortent en un seul mot. Repasser par le HTML
   * nettoyé et marquer la fin de chaque bloc rend un texte que le modèle
   * peut suivre. */
  private textFromHtml(html: string) {
    const { document } = new JSDOM(`<body>${html}</body>`, {
      virtualConsole: new VirtualConsole(),
    }).window;
    document
      .querySelectorAll(
        'p, h1, h2, h3, h4, h5, h6, li, tr, td, th, br, div, blockquote, figcaption, caption',
      )
      .forEach((element) => element.append('\n'));
    return normalizeText(document.body.textContent ?? '');
  }

  /** Readability rend le <title> du document, suffixe du site compris. Le
   * retirer quand il correspond au nom déclaré évite de le retrouver dans le
   * titre réécrit, sans toucher aux titres qui contiennent un tiret. */
  private cleanTitle(raw: string, siteName: string | null) {
    const title = normalizeText(raw);
    if (!siteName) return title.slice(0, 300);
    const separators = ['|', '-', '–', '—', '·', '»', ':'];
    for (const separator of separators) {
      const suffix = ` ${separator} ${siteName}`;
      if (title.toLowerCase().endsWith(suffix.toLowerCase())) {
        const stripped = title.slice(0, -suffix.length).trim();
        if (stripped) return stripped.slice(0, 300);
      }
    }
    return title.slice(0, 300);
  }

  /** La langue déclarée par la page : `<html lang>` d'abord, puis
   * `og:locale`. Une balise absente rend `null` plutôt qu'une supposition —
   * mieux vaut le dire au modèle que lui imposer une langue au hasard. */
  private language(document: Document) {
    const declared =
      document.documentElement.getAttribute('lang') ||
      this.meta(document, 'og:locale') ||
      '';
    const code = declared.trim().slice(0, 2).toLowerCase();
    return /^[a-z]{2}$/.test(code) ? code : null;
  }

  private meta(document: Document, property: string) {
    return (
      document
        .querySelector(`meta[property="${property}"], meta[name="${property}"]`)
        ?.getAttribute('content')
        ?.trim() || null
    );
  }

  /** L'image mise en avant par la page. Seul le HTTPS est retenu : elle peut
   * finir déposée sur le site WordPress. */
  private leadImage(document: Document, base: string) {
    const candidate =
      this.meta(document, 'og:image') || this.meta(document, 'twitter:image');
    if (!candidate) return null;
    try {
      const url = new URL(candidate, base);
      return url.protocol === 'https:' ? url.toString() : null;
    } catch {
      return null;
    }
  }
}
