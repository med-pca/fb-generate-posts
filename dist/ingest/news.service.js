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
var NewsService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.NewsService = void 0;
exports.parseFeed = parseFeed;
exports.headlinesText = headlinesText;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const DEFAULT_FEEDS = [
    'https://feeds.bbci.co.uk/news/world/rss.xml',
    'https://feeds.bbci.co.uk/news/business/rss.xml',
    'https://news.google.com/rss?hl=en-US&gl=US&ceid=US:en',
];
const CACHE_MS = 30 * 60_000;
const MAX_AGE_MS = 72 * 3600_000;
const MAX_HEADLINES = 30;
const TIMEOUT_MS = 10_000;
function tag(item, name) {
    const m = new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, 'i').exec(item);
    if (!m)
        return '';
    return m[1]
        .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&quot;/g, '"')
        .replace(/&#0?39;|&apos;/g, "'")
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&nbsp;/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}
function parseFeed(xml, source) {
    const items = xml.match(/<item\b[\s\S]*?<\/item>/gi) || [];
    return items
        .map((item) => {
        const date = tag(item, 'pubDate');
        const at = date ? new Date(date) : null;
        return {
            title: tag(item, 'title'),
            summary: tag(item, 'description').slice(0, 300),
            source,
            publishedAt: at && !Number.isNaN(at.getTime()) ? at.toISOString() : null,
        };
    })
        .filter((h) => h.title);
}
let NewsService = NewsService_1 = class NewsService {
    config;
    logger = new common_1.Logger(NewsService_1.name);
    cache = null;
    constructor(config) {
        this.config = config;
    }
    feeds() {
        const raw = this.config.get('NEWS_FEEDS');
        return raw ? raw.split(',').map((u) => u.trim()).filter((u) => /^https:\/\//.test(u)) : DEFAULT_FEEDS;
    }
    async headlines(now = Date.now()) {
        if (this.cache && now - this.cache.at < CACHE_MS)
            return this.cache.headlines;
        const lists = await Promise.all(this.feeds().map(async (url) => {
            try {
                const response = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS), headers: { accept: 'application/rss+xml, application/xml, text/xml' } });
                if (!response.ok)
                    throw new Error(`HTTP ${response.status}`);
                return parseFeed(await response.text(), new URL(url).hostname.replace(/^(www|feeds)\./, ''));
            }
            catch (error) {
                this.logger.warn(`Flux d’actualité illisible (${url}) : ${error.message}`);
                return [];
            }
        }));
        const seen = new Set();
        const headlines = lists
            .flat()
            .filter((h) => !h.publishedAt || now - new Date(h.publishedAt).getTime() < MAX_AGE_MS)
            .filter((h) => {
            const key = h.title.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().slice(0, 80);
            if (seen.has(key))
                return false;
            seen.add(key);
            return true;
        })
            .sort((a, b) => (b.publishedAt || '').localeCompare(a.publishedAt || ''))
            .slice(0, MAX_HEADLINES);
        if (headlines.length)
            this.cache = { at: now, headlines };
        return headlines;
    }
};
exports.NewsService = NewsService;
exports.NewsService = NewsService = NewsService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService])
], NewsService);
function headlinesText(headlines) {
    return headlines
        .map((h, i) => `${i + 1}. ${h.title}${h.summary ? ` — ${h.summary}` : ''} (${h.source}${h.publishedAt ? `, ${h.publishedAt.slice(0, 10)}` : ''})`)
        .join('\n');
}
//# sourceMappingURL=news.service.js.map