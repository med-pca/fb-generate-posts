"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.articleUrlKey = articleUrlKey;
exports.isOnSite = isOnSite;
function articleUrlKey(raw) {
    if (!raw)
        return null;
    try {
        const url = new URL(raw);
        const host = url.hostname.toLowerCase().replace(/^www\./, '');
        const path = decodeURI(url.pathname).replace(/\/+$/, '').toLowerCase();
        return `${host}${path}`;
    }
    catch {
        return null;
    }
}
function isOnSite(articleUrl, siteUrl) {
    const article = articleUrlKey(articleUrl);
    const site = articleUrlKey(siteUrl);
    if (!article || !site)
        return false;
    return article !== site && article.startsWith(`${site}/`);
}
//# sourceMappingURL=article-url.js.map