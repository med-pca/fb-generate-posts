"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SourceReaderService = void 0;
exports.normalizeText = normalizeText;
const common_1 = require("@nestjs/common");
const readability_1 = require("@mozilla/readability");
const jsdom_1 = require("jsdom");
const safe_fetch_1 = require("../common/safe-fetch");
const MAX_BYTES = 2_000_000;
const MAX_REDIRECTS = 5;
const TIMEOUT_MS = 15_000;
const MIN_TEXT_LENGTH = 300;
const USER_AGENT = 'Mozilla/5.0 (compatible; DataFbPosting/1.0; +https://github.com/data-fb-posting)';
function normalizeText(value) {
    return value
        .replace(/\r\n?/g, '\n')
        .replace(/[^\S\n]+/g, ' ')
        .replace(/ *\n */g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}
let SourceReaderService = class SourceReaderService {
    async read(sourceUrl) {
        const { html, url } = await this.fetchHtml(sourceUrl);
        const dom = new jsdom_1.JSDOM(html, { url, virtualConsole: new jsdom_1.VirtualConsole() });
        const { document } = dom.window;
        const title = document.title;
        const language = this.language(document);
        const leadImageUrl = this.leadImage(document, url);
        const siteName = this.meta(document, 'og:site_name');
        const article = new readability_1.Readability(document).parse();
        const text = article ? this.textFromHtml(article.content ?? '') : '';
        if (!article || text.length < MIN_TEXT_LENGTH) {
            throw new common_1.BadRequestException('Aucun article exploitable sur cette page : vérifier que l’URL pointe bien vers le contenu');
        }
        return {
            url,
            title: this.cleanTitle(article.title || title || '', siteName),
            text,
            excerpt: article.excerpt ? normalizeText(article.excerpt) : null,
            leadImageUrl,
            siteName: siteName || article.siteName || null,
            language,
        };
    }
    async fetchHtml(sourceUrl) {
        let target = await (0, safe_fetch_1.assertSafeRemoteUrl)(sourceUrl);
        for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
            const response = await this.get(target);
            const location = response.headers.get('location');
            if (response.status >= 300 && response.status < 400 && location) {
                await response.body?.cancel();
                target = await (0, safe_fetch_1.assertSafeRemoteUrl)(new URL(location, target).toString());
                continue;
            }
            if (!response.ok) {
                throw new common_1.BadGatewayException(`La source a répondu avec le statut ${response.status}`);
            }
            const type = response.headers.get('content-type') || '';
            if (!/text\/html|application\/xhtml\+xml/i.test(type)) {
                throw new common_1.BadRequestException(`La source ne renvoie pas une page HTML (${type.split(';')[0] || 'type inconnu'})`);
            }
            return {
                html: await this.readCapped(response, type),
                url: target.toString(),
            };
        }
        throw new common_1.BadGatewayException('La source enchaîne trop de redirections');
    }
    async get(url) {
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
        }
        catch {
            throw new common_1.BadGatewayException('Impossible de contacter la page source');
        }
    }
    async readCapped(response, contentType) {
        if (Number(response.headers.get('content-length') || 0) > MAX_BYTES) {
            throw new common_1.BadRequestException('Page source trop volumineuse');
        }
        const reader = response.body?.getReader();
        if (!reader)
            return '';
        const chunks = [];
        let size = 0;
        for (;;) {
            const { done, value } = await reader.read();
            if (done)
                break;
            size += value.length;
            if (size > MAX_BYTES) {
                await reader.cancel();
                throw new common_1.BadRequestException('Page source trop volumineuse');
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
    decode(body, contentType) {
        const charset = /charset=["']?([\w-]+)/i.exec(contentType)?.[1];
        try {
            return new TextDecoder(charset || 'utf-8').decode(body);
        }
        catch {
            return new TextDecoder('utf-8').decode(body);
        }
    }
    textFromHtml(html) {
        const { document } = new jsdom_1.JSDOM(`<body>${html}</body>`, {
            virtualConsole: new jsdom_1.VirtualConsole(),
        }).window;
        document
            .querySelectorAll('p, h1, h2, h3, h4, h5, h6, li, tr, td, th, br, div, blockquote, figcaption, caption')
            .forEach((element) => element.append('\n'));
        return normalizeText(document.body.textContent ?? '');
    }
    cleanTitle(raw, siteName) {
        const title = normalizeText(raw);
        if (!siteName)
            return title.slice(0, 300);
        const separators = ['|', '-', '–', '—', '·', '»', ':'];
        for (const separator of separators) {
            const suffix = ` ${separator} ${siteName}`;
            if (title.toLowerCase().endsWith(suffix.toLowerCase())) {
                const stripped = title.slice(0, -suffix.length).trim();
                if (stripped)
                    return stripped.slice(0, 300);
            }
        }
        return title.slice(0, 300);
    }
    language(document) {
        const declared = document.documentElement.getAttribute('lang') ||
            this.meta(document, 'og:locale') ||
            '';
        const code = declared.trim().slice(0, 2).toLowerCase();
        return /^[a-z]{2}$/.test(code) ? code : null;
    }
    meta(document, property) {
        return (document
            .querySelector(`meta[property="${property}"], meta[name="${property}"]`)
            ?.getAttribute('content')
            ?.trim() || null);
    }
    leadImage(document, base) {
        const candidate = this.meta(document, 'og:image') || this.meta(document, 'twitter:image');
        if (!candidate)
            return null;
        try {
            const url = new URL(candidate, base);
            return url.protocol === 'https:' ? url.toString() : null;
        }
        catch {
            return null;
        }
    }
};
exports.SourceReaderService = SourceReaderService;
exports.SourceReaderService = SourceReaderService = __decorate([
    (0, common_1.Injectable)()
], SourceReaderService);
//# sourceMappingURL=source-reader.service.js.map