"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.WordpressWriterService = void 0;
exports.plainText = plainText;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const safe_fetch_1 = require("../common/safe-fetch");
const paginate_1 = require("./paginate");
const prisma_service_1 = require("../prisma/prisma.service");
const MAX_IMAGE_BYTES = 10_000_000;
const IMAGE_TYPES = new Set([
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
]);
const TIMEOUT_MS = 60_000;
const NAMED_ENTITIES = {
    eacute: 'é', egrave: 'è', ecirc: 'ê', euml: 'ë', agrave: 'à', acirc: 'â', ccedil: 'ç',
    icirc: 'î', iuml: 'ï', ocirc: 'ô', ugrave: 'ù', ucirc: 'û', uuml: 'ü', oelig: 'œ',
    Eacute: 'É', Egrave: 'È', Agrave: 'À', Ccedil: 'Ç',
    rsquo: '’', lsquo: '‘', ldquo: '“', rdquo: '”', laquo: '«', raquo: '»', ndash: '–', mdash: '—',
};
function plainText(html, max = 100_000) {
    const text = String(html ?? '')
        .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
        .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
        .replace(/<[^>]*>/g, ' ')
        .replace(/&#(\d+);/g, (_m, n) => String.fromCodePoint(Number(n)))
        .replace(/&#x([0-9a-f]+);/gi, (_m, n) => String.fromCodePoint(parseInt(n, 16)))
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&quot;/g, '"')
        .replace(/&#039;|&apos;/g, "'")
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&hellip;/g, '…')
        .replace(/&([a-z]+);/gi, (m, name) => NAMED_ENTITIES[name] ?? m)
        .replace(/\s+/g, ' ')
        .trim();
    return text.slice(0, max);
}
let WordpressWriterService = class WordpressWriterService {
    config;
    prisma;
    constructor(config, prisma) {
        this.config = config;
        this.prisma = prisma;
    }
    async splitting() {
        const settings = await this.prisma?.automationSetting
            .findUnique({ where: { id: 'global' }, select: { articleParagraphsPerPage: true, articleMinWordsPerPage: true, articleMaxPages: true } })
            .catch(() => null);
        return settings
            ? { perPage: settings.articleParagraphsPerPage, minWords: settings.articleMinWordsPerPage, maxPages: settings.articleMaxPages }
            : { perPage: 2, minWords: 60, maxPages: 3 };
    }
    async deposit(input) {
        const key = input.apiKey || this.config.get('WORDPRESS_API_KEY');
        if (!key) {
            throw new common_1.ServiceUnavailableException(`Aucune clé pour ${input.siteUrl} : la renseigner sur le site, ` +
                'ou configurer WORDPRESS_API_KEY');
        }
        const { perPage, minWords, maxPages } = await this.splitting();
        const fixed = Number(this.config.get('ARTICLE_PAGES') ?? 0);
        const contentHtml = perPage > 0
            ? (0, paginate_1.paginateByParagraphs)(input.article.contentHtml, perPage, minWords, input.language, maxPages)
            : (0, paginate_1.paginateHtml)(input.article.contentHtml, Number.isFinite(fixed) ? fixed : 0, input.language);
        const image = input.imageUrl ? await this.fetchImage(input.imageUrl) : null;
        const endpoint = `${input.siteUrl}/wp-json/dfb/v1/articles`;
        let response;
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
        }
        catch {
            throw new common_1.BadGatewayException(`Site WordPress injoignable (${endpoint})`);
        }
        const body = await response.text();
        if (!response.ok) {
            throw new common_1.BadGatewayException(`WordPress a refusé le dépôt (HTTP ${response.status}) : ${body.slice(0, 200)}`);
        }
        let parsed;
        try {
            parsed = JSON.parse(body);
        }
        catch {
            throw new common_1.BadGatewayException('WordPress n’a pas répondu en JSON : vérifier que le plugin 1.2.0 est actif');
        }
        if (!parsed.postId || !parsed.permalink) {
            throw new common_1.BadGatewayException('Réponse WordPress incomplète : postId et permalink attendus');
        }
        return {
            postId: parsed.postId,
            permalink: parsed.permalink,
            imageWarning: parsed.imageWarning ?? null,
        };
    }
    async fetchArticle(input) {
        const key = input.apiKey || this.config.get('WORDPRESS_API_KEY') || '';
        const get = async (url, withKey) => {
            try {
                const response = await fetch(url, {
                    signal: AbortSignal.timeout(TIMEOUT_MS),
                    headers: { accept: 'application/json', ...(withKey && key ? { 'x-api-key': key } : {}) },
                });
                const text = await response.text();
                let json = null;
                try {
                    json = JSON.parse(text);
                }
                catch {
                    json = null;
                }
                return { status: response.status, json };
            }
            catch {
                throw new common_1.BadGatewayException(`Site WordPress injoignable (${url})`);
            }
        };
        if (input.postId) {
            const own = await get(`${input.siteUrl}/wp-json/dfb/v1/articles/${encodeURIComponent(input.postId)}`, true);
            const body = own.json;
            if (own.status >= 200 && own.status < 300 && body?.postId && body.articleUrl) {
                return { ...body, siteUrl: input.siteUrl, siteName: body.siteName || input.siteName };
            }
            if (own.status !== 404) {
                throw new common_1.BadGatewayException(`Le plugin a refusé la lecture de l’article (HTTP ${own.status})`);
            }
        }
        const embed = '_embed=wp:featuredmedia';
        const url = input.postId
            ? `${input.siteUrl}/wp-json/wp/v2/posts/${encodeURIComponent(input.postId)}?${embed}`
            : `${input.siteUrl}/wp-json/wp/v2/posts?slug=${encodeURIComponent(input.slug || '')}&${embed}`;
        const pub = await get(url, false);
        const post = (Array.isArray(pub.json) ? pub.json[0] : pub.json);
        if (pub.status < 200 || pub.status >= 300 || !post?.id || !post.link) {
            throw new common_1.BadGatewayException(pub.status === 401 || pub.status === 403
                ? 'Le site ferme son API publique : installer le plugin 1.4.0 (page Extensions) pour que le serveur puisse relire ses articles'
                : `Article introuvable sur le site (HTTP ${pub.status})`);
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
    loadImage(imageUrl) {
        return this.fetchImage(imageUrl);
    }
    async fetchImage(imageUrl) {
        const url = await (0, safe_fetch_1.assertSafeRemoteUrl)(imageUrl);
        let response;
        try {
            response = await fetch(url, {
                signal: AbortSignal.timeout(TIMEOUT_MS),
                headers: { accept: 'image/*' },
            });
        }
        catch {
            throw new common_1.BadGatewayException('Image du post d’origine injoignable');
        }
        if (!response.ok) {
            throw new common_1.BadGatewayException(`L’image a répondu avec le statut ${response.status}`);
        }
        const mimeType = (response.headers.get('content-type') || '')
            .split(';')[0]
            .trim()
            .toLowerCase();
        if (!IMAGE_TYPES.has(mimeType)) {
            throw new common_1.BadGatewayException(`Type d’image non accepté : ${mimeType || 'inconnu'}`);
        }
        const bytes = Buffer.from(await response.arrayBuffer());
        if (!bytes.length)
            throw new common_1.BadGatewayException('Image vide');
        if (bytes.length > MAX_IMAGE_BYTES) {
            throw new common_1.BadGatewayException('Image trop volumineuse');
        }
        return {
            data: bytes.toString('base64'),
            mimeType,
            filename: this.filename(url, mimeType),
        };
    }
    filename(url, mimeType) {
        const extension = mimeType.replace('image/', '').replace('jpeg', 'jpg');
        const base = (url.pathname.split('/').pop() || 'image')
            .replace(/\.[^.]*$/, '')
            .replace(/[^A-Za-z0-9_-]/g, '')
            .slice(0, 60);
        return `${base || 'image'}.${extension}`;
    }
};
exports.WordpressWriterService = WordpressWriterService;
exports.WordpressWriterService = WordpressWriterService = __decorate([
    (0, common_1.Injectable)(),
    __param(1, (0, common_1.Optional)()),
    __metadata("design:paramtypes", [config_1.ConfigService,
        prisma_service_1.PrismaService])
], WordpressWriterService);
//# sourceMappingURL=wordpress-writer.service.js.map