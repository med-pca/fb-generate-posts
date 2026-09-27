import {
  BadGatewayException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { assertSafeRemoteUrl } from '../common/safe-fetch';
import { paginateHtml } from './paginate';
import { GeneratedArticle } from './rewriter.service';

/** Ce que le plugin renvoie une fois l'article déposé. `imageWarning` dit
 * qu'un article est bien en ligne mais sans image : c'est une gêne, pas un
 * échec, et la reprise continue. */
export type WordpressDeposit = {
  postId: string;
  permalink: string;
  imageWarning: string | null;
};

export type DepositInput = {
  siteUrl: string;
  ingestRef: string;
  article: GeneratedArticle;
  imageUrl: string | null;
  /** Décide la langue de l'invitation « page suivante ». */
  language?: string | null;
  /** La clé du plugin de CE site. Absente, la clé globale sert : deux sites
   * n'ont aucune raison de partager la même. */
  apiKey?: string | null;
};

const MAX_IMAGE_BYTES = 10_000_000;
const IMAGE_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
]);
const TIMEOUT_MS = 60_000;
/** Pages par article. Chaque page vue en est une de plus pour la régie
 * publicitaire ; 1 rend l'article d'un seul tenant. */
const DEFAULT_PAGES = 3;

@Injectable()
export class WordpressWriterService {
  constructor(private readonly config: ConfigService) {}

  async deposit(input: DepositInput): Promise<WordpressDeposit> {
    const key = input.apiKey || this.config.get<string>('WORDPRESS_API_KEY');
    if (!key) {
      throw new ServiceUnavailableException(
        `Aucune clé pour ${input.siteUrl} : la renseigner sur le site, ` +
          'ou configurer WORDPRESS_API_KEY',
      );
    }
    // Le découpage se fait ici, pas à la réécriture : le texte conservé sur
    // la reprise reste d'un seul tenant, et un nouveau dépôt peut le
    // redécouper autrement.
    const pages = Number(
      this.config.get<string>('ARTICLE_PAGES') ?? DEFAULT_PAGES,
    );
    const contentHtml = paginateHtml(
      input.article.contentHtml,
      Number.isFinite(pages) ? pages : DEFAULT_PAGES,
      input.language,
    );
    const image = input.imageUrl ? await this.fetchImage(input.imageUrl) : null;
    const endpoint = `${input.siteUrl}/wp-json/dfb/v1/articles`;
    let response: Response;
    try {
      response = await fetch(endpoint, {
        method: 'POST',
        signal: AbortSignal.timeout(TIMEOUT_MS),
        headers: { 'content-type': 'application/json', 'x-api-key': key },
        body: JSON.stringify({
          title: input.article.title,
          slug: input.article.slug,
          excerpt: input.article.excerpt,
          contentHtml,
          ingestRef: input.ingestRef,
          image,
        }),
      });
    } catch {
      throw new BadGatewayException(`Site WordPress injoignable (${endpoint})`);
    }
    const body = await response.text();
    if (!response.ok) {
      throw new BadGatewayException(
        `WordPress a refusé le dépôt (HTTP ${response.status}) : ${body.slice(0, 200)}`,
      );
    }
    let parsed: Partial<WordpressDeposit>;
    try {
      parsed = JSON.parse(body) as Partial<WordpressDeposit>;
    } catch {
      throw new BadGatewayException(
        'WordPress n’a pas répondu en JSON : vérifier que le plugin 1.2.0 est actif',
      );
    }
    if (!parsed.postId || !parsed.permalink) {
      throw new BadGatewayException(
        'Réponse WordPress incomplète : postId et permalink attendus',
      );
    }
    return {
      postId: parsed.postId,
      permalink: parsed.permalink,
      imageWarning: parsed.imageWarning ?? null,
    };
  }

  /** L'image part en base64 dans le corps : une URL de CDN Facebook est
   * signée et expire, et le site WordPress n'a pas à aller la chercher
   * lui-même — il n'a aucune raison d'y avoir accès. */
  private async fetchImage(imageUrl: string) {
    const url = await assertSafeRemoteUrl(imageUrl);
    let response: Response;
    try {
      response = await fetch(url, {
        signal: AbortSignal.timeout(TIMEOUT_MS),
        headers: { accept: 'image/*' },
      });
    } catch {
      throw new BadGatewayException('Image du post d’origine injoignable');
    }
    if (!response.ok) {
      throw new BadGatewayException(
        `L’image a répondu avec le statut ${response.status}`,
      );
    }
    const mimeType = (response.headers.get('content-type') || '')
      .split(';')[0]
      .trim()
      .toLowerCase();
    if (!IMAGE_TYPES.has(mimeType)) {
      throw new BadGatewayException(
        `Type d’image non accepté : ${mimeType || 'inconnu'}`,
      );
    }
    const bytes = Buffer.from(await response.arrayBuffer());
    if (!bytes.length) throw new BadGatewayException('Image vide');
    if (bytes.length > MAX_IMAGE_BYTES) {
      throw new BadGatewayException('Image trop volumineuse');
    }
    return {
      data: bytes.toString('base64'),
      mimeType,
      filename: this.filename(url, mimeType),
    };
  }

  private filename(url: URL, mimeType: string) {
    const extension = mimeType.replace('image/', '').replace('jpeg', 'jpg');
    const base = (url.pathname.split('/').pop() || 'image')
      .replace(/\.[^.]*$/, '')
      .replace(/[^A-Za-z0-9_-]/g, '')
      .slice(0, 60);
    return `${base || 'image'}.${extension}`;
  }
}
