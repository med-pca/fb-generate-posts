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
var RewriterService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.RewriterService = void 0;
exports.normalizeSlug = normalizeSlug;
exports.cleanCaption = cleanCaption;
exports.sanitizeArticleHtml = sanitizeArticleHtml;
exports.normalizeHashtags = normalizeHashtags;
exports.normalizeGenerated = normalizeGenerated;
const common_1 = require("@nestjs/common");
const llm_service_1 = require("../llm/llm.service");
const MAX_SOURCE_CHARS = 12_000;
const MAX_CAPTION_CHARS = 1_200;
const MAX_HASHTAGS = 10;
const ALLOWED_TAGS = new Set([
    'h2',
    'h3',
    'p',
    'ul',
    'ol',
    'li',
    'strong',
    'em',
    'blockquote',
    'br',
]);
function normalizeSlug(value, fallback) {
    const slugify = (input) => {
        const full = input
            .normalize('NFD')
            .replace(/[̀-ͯ]/g, '')
            .toLowerCase()
            .replace(/[^\p{L}\p{N}]+/gu, '-')
            .replace(/^-+|-+$/g, '');
        if (full.length <= 80)
            return full;
        const cut = full.slice(0, 80);
        const boundary = cut.lastIndexOf('-');
        return (boundary > 0 ? cut.slice(0, boundary) : cut).replace(/-+$/, '');
    };
    return slugify(value) || slugify(fallback) || 'article';
}
function cleanCaption(value) {
    const text = value
        .replace(/(?:https?:\/\/|www\.)\S+/gi, '')
        .replace(/#[\p{L}\p{N}_]+/gu, '')
        .replace(/[^\S\n]+/g, ' ')
        .replace(/ *\n */g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
    return text.length > MAX_CAPTION_CHARS
        ? text.slice(0, MAX_CAPTION_CHARS - 1).replace(/\s+\S*$/, '') + '…'
        : text;
}
function sanitizeArticleHtml(html) {
    return html
        .replace(/<(script|style|iframe|object|embed|noscript|template)\b[\s\S]*?<\/\1\s*>/gi, '')
        .replace(/<!--[\s\S]*?-->/g, '')
        .replace(/<(\/?)([a-zA-Z][a-zA-Z0-9]*)\b[^>]*>/g, (_tag, closing, name) => {
        const lower = String(name).toLowerCase();
        if (!ALLOWED_TAGS.has(lower))
            return '';
        if (lower === 'br')
            return '<br />';
        return closing ? `</${lower}>` : `<${lower}>`;
    })
        .replace(/[^\S\n]+/g, ' ')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}
function normalizeHashtags(values) {
    const seen = new Set();
    for (const value of values) {
        const tag = value
            .normalize('NFC')
            .replace(/^#+/, '')
            .replace(/[^\p{L}\p{N}_]/gu, '');
        if (tag)
            seen.add(tag);
        if (seen.size >= MAX_HASHTAGS)
            break;
    }
    return [...seen];
}
function normalizeGenerated(raw, fallbackTitle) {
    const title = (raw.title || fallbackTitle).trim().slice(0, 200);
    return {
        title,
        slug: normalizeSlug(raw.slug || '', title),
        excerpt: cleanCaption(raw.excerpt || '').slice(0, 500),
        metaDescription: cleanCaption(raw.metaDescription || '').slice(0, 320),
        contentHtml: sanitizeArticleHtml(raw.contentHtml || ''),
        caption: cleanCaption(raw.caption || ''),
        hashtags: normalizeHashtags(raw.hashtags || []),
    };
}
const SCHEMA = {
    type: 'object',
    additionalProperties: false,
    properties: {
        title: { type: 'string', description: 'Titre original, sans guillemets' },
        slug: {
            type: 'string',
            description: 'Identifiant d’URL en minuscules, mots séparés par un tiret',
        },
        excerpt: { type: 'string', description: 'Résumé d’une à deux phrases' },
        metaDescription: {
            type: 'string',
            description: 'Description SEO de 150 à 160 caractères',
        },
        contentHtml: {
            type: 'string',
            description: 'Corps de l’article en HTML, balises <h2> <h3> <p> <ul> <ol> <li> <strong> <em> uniquement, sans attribut',
        },
        caption: {
            type: 'string',
            description: 'Légende Facebook de 2 à 4 phrases, sans URL et sans hashtag',
        },
        hashtags: {
            type: 'array',
            minItems: 3,
            maxItems: 8,
            items: { type: 'string' },
            description: 'Mots-clés sans dièse',
        },
    },
    required: [
        'title',
        'slug',
        'excerpt',
        'metaDescription',
        'contentHtml',
        'caption',
        'hashtags',
    ],
};
const INSTRUCTIONS = [
    'Tu réécris un article : même contenu, mots neufs.',
    'Suis les notes pas à pas — mêmes informations, même ordre, même niveau de détail.',
    'Reformule chaque phrase ; n’en recopie aucune telle quelle.',
    'N’ajoute ni fait, ni section, ni développement absent des notes, et n’en retire aucun.',
    'Des notes brèves donnent un article bref : ne comble pas, n’étoffe pas, n’invente pas.',
    'Le corps est en HTML simple : <h2>, <h3>, <p>, <ul>, <ol>, <li>, <strong>, <em>.',
    'Aucun attribut, aucun lien, aucune image, aucun titre de niveau 1.',
    'La légende accompagne une image sur Facebook : 2 à 4 phrases, sans URL ni hashtag.',
    'Réponds par un seul objet JSON, sans texte autour, de la forme :',
    '{"title": string, "slug": string, "excerpt": string, "metaDescription": string,',
    '"contentHtml": string, "caption": string, "hashtags": string[]}.',
].join(' ');
let RewriterService = RewriterService_1 = class RewriterService {
    llm;
    logger = new common_1.Logger(RewriterService_1.name);
    constructor(llm) {
        this.llm = llm;
    }
    async rewrite(input) {
        const { value, provider } = await this.llm.completeJson({
            instructions: INSTRUCTIONS,
            input: this.prompt(input),
            schemaName: 'rewritten_article',
            schema: SCHEMA,
            maxTokens: 6000,
        });
        const generated = normalizeGenerated(value, input.source.title);
        if (!generated.contentHtml || !generated.caption) {
            throw new common_1.ServiceUnavailableException('La réécriture est revenue sans corps d’article ou sans légende');
        }
        this.logger.log(`Article réécrit par ${provider}`);
        return generated;
    }
    prompt({ source, fbCaption, language }) {
        const notes = source.text.slice(0, MAX_SOURCE_CHARS);
        const wanted = language.trim().toLowerCase();
        const effective = !wanted || wanted === 'auto' ? (source.language ?? '') : language;
        return [
            effective
                ? `Langue de rédaction : ${effective}. CHAQUE champ du JSON est ` +
                    'dans cette langue, sans exception — y compris metaDescription — ' +
                    'et rien n’est traduit.'
                : 'Rédige dans la langue des notes ci-dessous, sans en changer, et ' +
                    'quelle que soit la langue de cette consigne.',
            `Titre de la source : ${source.title}`,
            fbCaption?.trim()
                ? `Ton de la publication d’origine, à ne pas recopier : ${fbCaption.trim()}`
                : '',
            'Notes issues de la page source :',
            notes,
        ]
            .filter(Boolean)
            .join('\n\n');
    }
};
exports.RewriterService = RewriterService;
exports.RewriterService = RewriterService = RewriterService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [llm_service_1.LlmService])
], RewriterService);
//# sourceMappingURL=rewriter.service.js.map