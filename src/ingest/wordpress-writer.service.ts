import {
  BadGatewayException,
  Injectable,
  ServiceUnavailableException,
  Optional,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { assertSafeRemoteUrl } from '../common/safe-fetch';
import { paginateByParagraphs, paginateHtml } from './paginate';
import { PrismaService } from '../prisma/prisma.service';
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

/** Un article tel que le plugin l'envoie (même forme que sa route
 * `POST /api/wordpress/articles`), relu par le serveur lui-même. */
export type PulledArticle = {
  siteUrl: string;
  siteName: string;
  postId: string;
  title: string;
  content: string;
  excerpt?: string;
  articleUrl: string;
  imageUrl?: string;
  publishedAt: string;
};

/** Les entités nommées qu'on croise dans un titre français ou anglais. */
const NAMED_ENTITIES: Record<string, string> = {
  eacute: 'é', egrave: 'è', ecirc: 'ê', euml: 'ë', agrave: 'à', acirc: 'â', ccedil: 'ç',
  icirc: 'î', iuml: 'ï', ocirc: 'ô', ugrave: 'ù', ucirc: 'û', uuml: 'ü', oelig: 'œ',
  Eacute: 'É', Egrave: 'È', Agrave: 'À', Ccedil: 'Ç',
  rsquo: '’', lsquo: '‘', ldquo: '“', rdquo: '”', laquo: '«', raquo: '»', ndash: '–', mdash: '—',
};

/** Le texte d'un champ « rendered » de WordPress : sans balises ni entités. */
export function plainText(html: string | undefined | null, max = 100_000) {
  const text = String(html ?? '')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&#(\d+);/g, (_m, n: string) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_m, n: string) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#039;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&hellip;/g, '…')
    .replace(/&([a-z]+);/gi, (m, name: string) => NAMED_ENTITIES[name] ?? m)
    .replace(/\s+/g, ' ')
    .trim();
  return text.slice(0, max);
}
@Injectable()
export class WordpressWriterService {
  constructor(
    private readonly config: ConfigService,
    @Optional() private readonly prisma?: PrismaService,
  ) {}

  /** Le découpage réglé dans la plateforme (Sites → Découpage en pages). */
  private async splitting() {
    const settings = await this.prisma?.automationSetting
      .findUnique({ where: { id: 'global' }, select: { articleParagraphsPerPage: true, articleMinWordsPerPage: true } })
      .catch(() => null);
    return settings ? { perPage: settings.articleParagraphsPerPage, minWords: settings.articleMinWordsPerPage } : { perPage: 2, minWords: 60 };
  }

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
    // redécouper autrement. « Page suivante » tous les N paragraphes ;
    // ARTICLE_PAGES (nombre fixe de pages) reste possible quand N = 0 et
    // qu'il est renseigné.
    const { perPage, minWords } = await this.splitting();
    const fixed = Number(this.config.get<string>('ARTICLE_PAGES') ?? 0);
    const contentHtml =
      perPage > 0
        ? paginateByParagraphs(input.article.contentHtml, perPage, minWords, input.language)
        : paginateHtml(input.article.contentHtml, Number.isFinite(fixed) ? fixed : 0, input.language);
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

  /** Relire un article sur le site, sans attendre que le plugin le renvoie
   * (WP-Cron qui ne passe pas, réglage manquant…). D'abord la route du
   * plugin (≥ 1.4.0, protégée par la clé, exactement ce qu'il enverrait) ;
   * sinon l'API publique de WordPress. Par identifiant, ou par slug pour un
   * article de notre site désigné par son adresse. */
  async fetchArticle(input: {
    siteUrl: string;
    siteName: string;
    apiKey?: string | null;
    postId?: string | null;
    slug?: string | null;
  }): Promise<PulledArticle> {
    const key = input.apiKey || this.config.get<string>('WORDPRESS_API_KEY') || '';
    const get = async (url: string, withKey: boolean) => {
      try {
        const response = await fetch(url, {
          signal: AbortSignal.timeout(TIMEOUT_MS),
          headers: { accept: 'application/json', ...(withKey && key ? { 'x-api-key': key } : {}) },
        });
        const text = await response.text();
        let json: unknown = null;
        try {
          json = JSON.parse(text);
        } catch {
          json = null;
        }
        return { status: response.status, json };
      } catch {
        throw new BadGatewayException(`Site WordPress injoignable (${url})`);
      }
    };
    if (input.postId) {
      const own = await get(`${input.siteUrl}/wp-json/dfb/v1/articles/${encodeURIComponent(input.postId)}`, true);
      const body = own.json as Partial<PulledArticle> | null;
      if (own.status >= 200 && own.status < 300 && body?.postId && body.articleUrl) {
        return { ...(body as PulledArticle), siteUrl: input.siteUrl, siteName: body.siteName || input.siteName };
      }
      if (own.status !== 404) {
        throw new BadGatewayException(`Le plugin a refusé la lecture de l’article (HTTP ${own.status})`);
      }
    }
    // Plugin plus ancien : l'API publique de WordPress.
    const embed = '_embed=wp:featuredmedia';
    const url = input.postId
      ? `${input.siteUrl}/wp-json/wp/v2/posts/${encodeURIComponent(input.postId)}?${embed}`
      : `${input.siteUrl}/wp-json/wp/v2/posts?slug=${encodeURIComponent(input.slug || '')}&${embed}`;
    const pub = await get(url, false);
    type WpPost = {
      id: number;
      link: string;
      date_gmt: string;
      status?: string;
      title?: { rendered?: string };
      content?: { rendered?: string };
      excerpt?: { rendered?: string };
      _embedded?: { 'wp:featuredmedia'?: Array<{ source_url?: string }> };
    };
    const post = (Array.isArray(pub.json) ? pub.json[0] : pub.json) as WpPost | undefined;
    if (pub.status < 200 || pub.status >= 300 || !post?.id || !post.link) {
      throw new BadGatewayException(
        pub.status === 401 || pub.status === 403
          ? 'Le site ferme son API publique : installer le plugin 1.4.0 (page Extensions) pour que le serveur puisse relire ses articles'
          : `Article introuvable sur le site (HTTP ${pub.status})`,
      );
    }
    const image = post._embedded?.['wp:featuredmedia']?.[0]?.source_url;
    return {
      siteUrl: input.siteUrl,
      siteName: input.siteName,
      postId: String(post.id),
      title: plainText(post.title?.rendered, 1000) || `Article ${post.id}`,
      content: plainText(post.content?.rendered),
      excerpt: plainText(post.excerpt?.rendered, 5000) || undefined,
      articleUrl: post.link,
      imageUrl: image && image.startsWith('https://') ? image : undefined,
      publishedAt: new Date(`${post.date_gmt.replace(/Z?$/, '')}Z`).toISOString(),
    };
  }

  /** L'image part en base64 dans le corps : une URL de CDN Facebook est
   * signée et expire, et le site WordPress n'a pas à aller la chercher
   * lui-même — il n'a aucune raison d'y avoir accès. */
  /** L'image d'une publication, en base64 : pour WordPress, et pour la
   * montrer au modèle (mode « news »). */
  loadImage(imageUrl: string) {
    return this.fetchImage(imageUrl);
  }

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
