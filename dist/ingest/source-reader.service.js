"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SourceReaderService = void 0;
exports.pageOf = pageOf;
exports.findNextPage = findNextPage;
exports.normalizeText = normalizeText;
const common_1 = require("@nestjs/common");
const readability_1 = require("@mozilla/readability");
const jsdom_1 = require("jsdom");
const safe_fetch_1 = require("../common/safe-fetch");
const MAX_PAGES = 20;
const MAX_TOTAL_TEXT = 60_000;
const NEXT_PAGE_LABELS = [
    'next page', 'continue to next page', 'continue on next page', 'continue reading on the next page', 'go to next page',
    'page suivante', 'suite page suivante', 'lire la suite page suivante', 'continuer a la page suivante',
    'pagina siguiente', 'siguiente pagina', 'proxima pagina', 'pagina seguinte', 'naechste seite', 'nachste seite',
    'pagina successiva', 'pagina dopo', 'sonraki sayfa', 'nastepna strona', 'volgende pagina',
    'الصفحة التالية', 'الصفحه التاليه',
];
const NEXT_SHORT_LABELS = ['next', 'suivant', 'suivante', 'siguiente', 'proxima', 'weiter', 'avanti', 'التالي', 'التاليه', '›', '»', '→', '>', '>>'];
const PAGINATION_LINKS = [
    '.page-links a', 'a.post-page-numbers', '.post-pagination a', '.pagination a', '.nav-links a',
    'a.page-numbers', '[class*="paginat"] a', '[class*="pager"] a', '[class*="page-nav"] a',
    '[class*="next-page"] a', 'a[class*="next-page"]', 'a[class*="nextpage"]',
].join(', ');
const PAGE_PARAMS = ['page', 'paged', 'pg', 'p', 'pagina', 'pag', 'seite', 'pagenum'];
const foldLabel = (value) => value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f\u064b-\u065f\u0670\u0640]/g, '')
    .replace(/\u0629/g, '\u0647')
    .replace(/ä/g, 'ae')
    .replace(/[^\p{L}\p{N}›»→>]+/gu, ' ')
    .trim()
    .toLowerCase();
function pageOf(raw) {
    const url = new URL(raw.toString());
    const path = url.pathname.replace(/\/+$/, '') || '/';
    for (const name of PAGE_PARAMS) {
        const value = url.searchParams.get(name);
        if (value && /^\d{1,3}$/.test(value)) {
            return { base: `${url.host}${path}`.toLowerCase(), page: Number(value) };
        }
    }
    const patterns = [
        /^(.*)\/page\/(\d{1,3})$/i,
        /^(.*)-page-?(\d{1,3})(?:\.html?)?$/i,
        /^(.*\/[^/]*[a-z][^/]*)\/(\d{1,2})$/i,
    ];
    for (const pattern of patterns) {
        const match = pattern.exec(path);
        if (match)
            return { base: `${url.host}${match[1]}`.toLowerCase(), page: Number(match[2]) };
    }
    return { base: `${url.host}${path.replace(/\.html?$/i, '')}`.toLowerCase(), page: 1 };
}
function findNextPage(document, currentUrl, visited) {
    const current = new URL(currentUrl);
    const here = pageOf(current);
    const seen = (url) => visited.has(url.href.replace(/#.*$/, ''));
    let numbered = null;
    let labelled = null;
    const consider = (href, label, strong) => {
        if (!href || /^(#|javascript:|mailto:)/i.test(href))
            return;
        let url;
        try {
            url = new URL(href, current);
        }
        catch {
            return;
        }
        url.hash = '';
        if (url.host !== current.host || !/^https?:$/.test(url.protocol) || seen(url))
            return;
        const there = pageOf(url);
        const folded = foldLabel(label);
        if (there.base === here.base && there.page > here.page) {
            if (!numbered || there.page < numbered.page)
                numbered = { url, page: there.page };
            return;
        }
        if (labelled)
            return;
        if (strong || NEXT_PAGE_LABELS.some((l) => folded.includes(foldLabel(l)))) {
            if (url.pathname !== current.pathname || url.search !== current.search)
                labelled = url;
        }
    };
    document.querySelectorAll('link[rel~="next"]').forEach((link) => consider(link.getAttribute('href'), '', false));
    document.querySelectorAll(`a[rel~="next"], ${PAGINATION_LINKS}`).forEach((a) => consider(a.getAttribute('href'), `${a.textContent || ''} ${a.getAttribute('aria-label') || ''}`, false));
    document.querySelectorAll('a[href]').forEach((a) => {
        const text = `${a.textContent || ''} ${a.getAttribute('aria-label') || ''} ${a.getAttribute('title') || ''}`;
        const folded = foldLabel(text);
        if (NEXT_PAGE_LABELS.some((l) => folded.includes(foldLabel(l))))
            consider(a.getAttribute('href'), text, true);
        else if (NEXT_SHORT_LABELS.includes(folded))
            consider(a.getAttribute('href'), '', false);
    });
    const best = numbered ? numbered.url : labelled;
    return best ? best.toString() : null;
}
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
        const visited = new Set([url.replace(/#.*$/, ''), sourceUrl.replace(/#.*$/, '')]);
        let next = findNextPage(document, url, visited);
        const article = new readability_1.Readability(document).parse();
        const text = article ? this.textFromHtml(article.content ?? '') : '';
        if (!article || text.length < MIN_TEXT_LENGTH) {
            throw new common_1.BadRequestException('Aucun article exploitable sur cette page : vérifier que l’URL pointe bien vers le contenu');
        }
        const parts = [text];
        const pageUrls = [url];
        let total = text.length;
        while (next && !visited.has(next) && pageUrls.length < MAX_PAGES && total < MAX_TOTAL_TEXT) {
            visited.add(next);
            const page = await this.readPage(next).catch(() => null);
            if (!page)
                break;
            visited.add(page.url.replace(/#.*$/, ''));
            if (!page.text || parts.some((part) => part === page.text))
                break;
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
    async readPage(pageUrl) {
        const { html, url } = await this.fetchHtml(pageUrl);
        const { document } = new jsdom_1.JSDOM(html, { url, virtualConsole: new jsdom_1.VirtualConsole() }).window;
        const next = findNextPage(document, url, new Set([url, pageUrl]));
        const article = new readability_1.Readability(document).parse();
        const text = article ? this.textFromHtml(article.content ?? '') : '';
        return { url, text, next };
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