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
    // Readability vide le document en l'analysant : tout ce qui vient de
    // `document` doit être lu avant.
    const article = new Readability(document).parse();
    const text = article ? this.textFromHtml(article.content ?? '') : '';
    if (!article || text.length < MIN_TEXT_LENGTH) {
      throw new BadRequestException(
        'Aucun article exploitable sur cette page : vérifier que l’URL pointe bien vers le contenu',
      );
    }
    // Un article coupé en pages (« page suivante ») : on lit la suite, page
    // après page, tant qu'il y en a une et qu'elle apporte du texte neuf.
    const parts = [text];
    const pageUrls = [url];
    let total = text.length;
    while (next && !visited.has(next) && pageUrls.length < MAX_PAGES && total < MAX_TOTAL_TEXT) {
      visited.add(next);
      const page = await this.readPage(next).catch(() => null);
      if (!page) break;
      visited.add(page.url.replace(/#.*$/, ''));
      // Un site qui renvoie la page 1 pour un numéro inconnu : on s'arrête.
      if (!page.text || parts.some((part) => part === page.text)) break;
      parts.push(page.text);
      pageUrls.push(page.url);
      total += page.text.length;
      next = page.next;
    }
    return {
      url,
      title: this.cleanTitle(article.title || title || '', siteName),
      text: parts.join('\n\n').slice(0, MAX_TOTAL_TEXT),
      pageUrls,
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
    const article = new Readability(document).parse();
    const text = article ? this.textFromHtml(article.content ?? '') : '';
    return { url, text, next };
  }

  /** Suit les redirections à la main : chaque étape repasse par le garde-fou.
   * Laisser `fetch` les suivre reviendrait à ne contrôler que la première
   * URL, alors qu'un hôte public peut rediriger vers une adresse interne. */
  private async fetchHtml(sourceUrl: string) {
    let target = await assertSafeRemoteUrl(sourceUrl);
    for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
      const response = await this.get(target);
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
      if (!/text\/html|application\/xhtml\+xml/i.test(type)) {
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

  private async get(url: URL) {
    try {
      return await fetch(url, {
        redirect: 'manual',
        signal: AbortSignal.timeout(TIMEOUT_MS),
        headers: {
          accept: 'text/html,application/xhtml+xml',
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
