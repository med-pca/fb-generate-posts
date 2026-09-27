"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.NEXT_PAGE = void 0;
exports.continueLabel = continueLabel;
exports.paginateHtml = paginateHtml;
exports.NEXT_PAGE = '<!--nextpage-->';
const CONTINUE_LABEL = {
    en: 'Continued on the next page',
    fr: 'Suite à la page suivante',
    es: 'Continúa en la página siguiente',
    pt: 'Continua na próxima página',
    it: 'Continua nella pagina successiva',
    de: 'Fortsetzung auf der nächsten Seite',
    nl: 'Lees verder op de volgende pagina',
    ar: 'يتبع في الصفحة التالية',
};
const MIN_PAGE_CHARS = 350;
const BLOCK = /<(h2|h3|p|ul|ol|blockquote)\b[^>]*>[\s\S]*?<\/\1>/gi;
function continueLabel(language) {
    const code = (language || '').trim().slice(0, 2).toLowerCase();
    return CONTINUE_LABEL[code] || CONTINUE_LABEL.en;
}
const textLength = (html) => html
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim().length;
function cutPoints(blocks, pages) {
    const lengths = blocks.map(textLength);
    const total = lengths.reduce((sum, value) => sum + value, 0);
    if (!total)
        return [];
    const headings = blocks
        .map((block, index) => (/^<h2\b/i.test(block) ? index : -1))
        .filter((index) => index > 0);
    const cuts = [];
    let consumed = 0;
    for (let page = 1; page < pages; page += 1) {
        const target = (total * page) / pages;
        const after = cuts.length ? cuts[cuts.length - 1] : 0;
        const usable = (headings.length ? headings : blocks.map((_, i) => i).slice(1)).filter((index) => index > after);
        if (!usable.length)
            break;
        let best = usable[0];
        let closest = Infinity;
        for (const index of usable) {
            const upTo = lengths
                .slice(0, index)
                .reduce((sum, value) => sum + value, 0);
            const distance = Math.abs(upTo - target);
            if (distance < closest) {
                closest = distance;
                best = index;
            }
        }
        const pageLength = lengths
            .slice(after, best)
            .reduce((sum, value) => sum + value, 0);
        const remaining = lengths
            .slice(best)
            .reduce((sum, value) => sum + value, 0);
        if (pageLength < MIN_PAGE_CHARS || remaining < MIN_PAGE_CHARS)
            break;
        cuts.push(best);
        consumed = best;
    }
    void consumed;
    return cuts;
}
function paginateHtml(html, pages, language) {
    if (!Number.isFinite(pages) || pages < 2)
        return html;
    const blocks = html.match(BLOCK);
    if (!blocks || blocks.length < 2)
        return html;
    if (blocks.join('') !== html.replace(/\s+(?=<)/g, '')) {
        const rebuilt = blocks.join('\n');
        if (textLength(rebuilt) !== textLength(html))
            return html;
    }
    const cuts = cutPoints(blocks, pages);
    if (!cuts.length)
        return html;
    const teaser = `<p>${continueLabel(language)}</p>`;
    const out = [];
    blocks.forEach((block, index) => {
        if (cuts.includes(index))
            out.push(teaser, exports.NEXT_PAGE);
        out.push(block);
    });
    return out.join('\n');
}
//# sourceMappingURL=paginate.js.map