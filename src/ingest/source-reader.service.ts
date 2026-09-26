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
};

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
    const leadImageUrl = this.leadImage(document, url);
    const siteName = this.meta(document, 'og:site_name');
    // Readability vide le document en l'analysant : tout ce qui vient de
    // `document` doit être lu avant.
    const article = new Readability(document).parse();
    const text = article ? this.textFromHtml(article.content ?? '') : '';
    if (!article || text.length < MIN_TEXT_LENGTH) {
      throw new BadRequestException(
        'Aucun article exploitable sur cette page : vérifier que l’URL pointe bien vers le contenu',
      );
    }
    return {
      url,
      title: this.cleanTitle(article.title || title || '', siteName),
      text,
      excerpt: article.excerpt ? normalizeText(article.excerpt) : null,
      leadImageUrl,
      siteName: siteName || article.siteName || null,
    };
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
