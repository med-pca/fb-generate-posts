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
exports.splitNotes = splitNotes;
exports.guessLanguage = guessLanguage;
exports.writingLanguage = writingLanguage;
const common_1 = require("@nestjs/common");
const llm_service_1 = require("../llm/llm.service");
const image_translator_service_1 = require("./image-translator.service");
const MAX_SOURCE_CHARS = 40_000;
const SINGLE_PASS_CHARS = 12_000;
const PART_CHARS = 5_000;
const MAX_LONG_SOURCE_CHARS = 60_000;
const CONTINUITY_CHARS = 2_000;
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
    return (html
        .replace(/\\r\\n|\\n|\\r/g, '\n')
        .replace(/\\t/g, ' ')
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
        .trim());
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
const FAITHFUL_RULES = [
    'You rewrite an article: same content, new words.',
    'Follow the notes step by step: same information, same order, same level of detail.',
    'Rephrase every sentence; copy none of them as is.',
    'Add no fact, section or development that is not in the notes, and remove none.',
    'Short notes make a short article: do not pad, do not expand, do not invent.',
    'The body is simple HTML: <h2>, <h3>, <p>, <ul>, <ol>, <li>, <strong>, <em>.',
    'No attribute, no link, no image, no level-1 heading.',
    'The caption goes with an image on Facebook: 2 to 4 sentences, no URL, no hashtag.',
    'Write in the language named at the top of the message, and only in it.',
];
const SEO_RULES = [
    'You write an ORIGINAL article from the notes of a source article. The goal is genuinely distinct SEO content, not a paraphrase.',
    'Keep every fact, quantity, step, name and plot point of the notes, and never contradict them. Never invent precise facts (figures, dates, quotes, studies, brand names) that are not in the notes.',
    'Change the substance, not just the words:',
    '1) a new title and a new angle, with an opening hook of your own (do not start like the source);',
    '2) your own structure: different <h2>/<h3> headings, a different grouping and order of sections when the content allows it (steps of a recipe or the events of a story keep their logical order);',
    '3) added value written from general knowledge, adapted to the genre: for a recipe — tips, common mistakes, variations, serving and storage, a short FAQ; for advice or news — context, why it matters, practical takeaways, a short FAQ; for a story — retell the same plot in a fresh narrative voice with new descriptions and new dialogue wording, a different opening scene and a short reflective ending;',
    '4) new sentences throughout: never copy or closely mirror a sentence of the notes; vary sentence length and rhythm.',
    'Aim for about 20 to 40% more text than the notes, never padding.',
    'The body is simple HTML: <h2>, <h3>, <p>, <ul>, <ol>, <li>, <strong>, <em>. No attribute, no link, no image, no level-1 heading.',
    'The caption goes with an image on Facebook: 2 to 4 sentences, no URL, no hashtag.',
    'Write in the language named at the top of the message, and only in it.',
];
const FULL_FORM = [
    'Answer with a single JSON object, nothing around it, of the form:',
    '{"title": string, "slug": string, "excerpt": string, "metaDescription": string,',
    '"contentHtml": string, "caption": string, "hashtags": string[]}.',
];
const INSTRUCTIONS = [...FAITHFUL_RULES, ...FULL_FORM].join(' ');
const SEO_INSTRUCTIONS = [...SEO_RULES, ...FULL_FORM].join(' ');
function partInstructions(style, part, total) {
    const rules = style === 'faithful' ? FAITHFUL_RULES : SEO_RULES;
    const common = [
        `This long source is rewritten in ${total} successive parts so that nothing of it is lost. You write part ${part} of ${total}; the notes given are those of this part only.`,
        'Rewrite ALL the notes of this part, in full: every event, scene, dialogue and detail. Do not summarise and do not skip anything.',
    ];
    const middle = part < total
        ? 'Do not conclude: the article goes on in the next part. No closing section, no FAQ, no moral, no "to be continued".'
        : 'This is the last part: tell the ending, then the closing the style calls for (a short reflective ending; a short FAQ only for advice or news).';
    if (part === 1) {
        return [
            ...rules,
            ...common,
            'The title, slug, excerpt, metaDescription, caption and hashtags are for the WHOLE article; the caption is a hook that never reveals how it ends. contentHtml holds only the rewriting of this part.',
            middle,
            ...FULL_FORM,
        ].join(' ');
    }
    return [
        ...rules.filter((rule) => !/opening hook|new title|caption goes with/i.test(rule)),
        ...common,
        'Carry on exactly where the text already written stops: same narrator, names, tense and voice. Do not repeat or recap anything already written, no new title, no new introduction.',
        middle,
        'Answer with a single JSON object, nothing around it, of the form: {"contentHtml": string}.',
    ].join(' ');
}
const PART_SCHEMA = {
    type: 'object',
    additionalProperties: false,
    properties: {
        contentHtml: {
            type: 'string',
            description: 'La suite du corps en HTML, balises <h2> <h3> <p> <ul> <ol> <li> <strong> <em> uniquement, sans attribut',
        },
    },
    required: ['contentHtml'],
};
function splitNotes(text, size = PART_CHARS) {
    const pieces = [];
    for (const paragraph of text.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean)) {
        if (paragraph.length <= size) {
            pieces.push(paragraph);
            continue;
        }
        let current = '';
        for (const sentence of paragraph.match(/[^.!?…]+[.!?…]+["'”’)]*\s*|[^.!?…]+$/g) ?? [paragraph]) {
            if (current && current.length + sentence.length > size) {
                pieces.push(current.trim());
                current = '';
            }
            current += sentence;
        }
        if (current.trim())
            pieces.push(current.trim());
    }
    const total = pieces.reduce((sum, p) => sum + p.length + 2, 0);
    const count = Math.max(1, Math.ceil(total / size));
    const target = total / count;
    const parts = [];
    let current = [];
    let length = 0;
    for (const piece of pieces) {
        if (current.length && length + piece.length / 2 > target && parts.length < count - 1) {
            parts.push(current.join('\n\n'));
            current = [];
            length = 0;
        }
        current.push(piece);
        length += piece.length + 2;
    }
    if (current.length)
        parts.push(current.join('\n\n'));
    return parts;
}
const plainText = (html) => html.replace(/<\/(p|h2|h3|li)>/gi, '\n').replace(/<[^>]*>/g, '').replace(/\n{2,}/g, '\n').trim();
const NEWS_SCHEMA = {
    type: 'object',
    additionalProperties: false,
    properties: {
        newsHook: { type: 'string', description: 'The headline from the list the article is tied to, copied as is' },
        titles: { type: 'array', minItems: 3, maxItems: 3, items: { type: 'string' }, description: '3 ultra-catchy titles' },
        slug: { type: 'string', description: 'lowercase-url-slug of the first title' },
        excerpt: { type: 'string', description: '1–2 sentence summary' },
        metaDescription: { type: 'string', description: 'SEO description, 150–160 characters' },
        contentHtml: { type: 'string', description: '300–400 word article body, <h2> <p> <ul> <li> <strong> <em> only, no attributes' },
        caption: { type: 'string', description: 'Short social media teaser, 2–3 sentences, no URL, no hashtag' },
        hashtags: { type: 'array', minItems: 3, maxItems: 8, items: { type: 'string' }, description: 'Keywords without #' },
    },
    required: ['newsHook', 'titles', 'slug', 'excerpt', 'metaDescription', 'contentHtml', 'caption', 'hashtags'],
};
const NEWS_INSTRUCTIONS = [
    'You are an expert journalist specialised in viral content and news analysis.',
    'You receive an image (and sometimes the text that accompanied it on social media) and a numbered list of REAL headlines from the last few days.',
    'Tie the image to the most relevant recent international, economic or social news (e.g. oil crisis, inflation, geopolitical tensions, cost of living…), chosen ONLY from the headlines list.',
    'Never invent events, figures, quotes, names or dates that are not in the headlines. If no headline fits well, use the broad theme of the closest one, without specifics.',
    'Then write:',
    '1) 3 ultra-catchy titles (smart clickbait or journalistic style) — intriguing but honest, no ALL CAPS, no false promise;',
    '2) a short teaser for social networks (2–3 sentences, no URL, no hashtag) in "caption", and a 1–2 sentence "excerpt";',
    '3) the article body (300–400 words) linking the symbolism of the image to modern news: an engaging opening, 2–3 short sections with <h2> headings, a closing thought. HTML only: <h2>, <p>, <ul>, <li>, <strong>, <em> — no attribute, no link, no image.',
    'Describe what the image shows accurately; do not claim things about people in it that the image does not show.',
    'Answer with a single JSON object, nothing around it:',
    '{"newsHook": string, "titles": [string, string, string], "slug": string, "excerpt": string, "metaDescription": string, "contentHtml": string, "caption": string, "hashtags": string[]}.',
].join(' ');
const STOPWORDS = {
    en: ['the', 'and', 'with', 'for', 'this', 'that', 'you', 'your', 'is', 'are', 'of', 'to', 'it', 'until', 'into'],
    fr: ['le', 'la', 'les', 'et', 'avec', 'pour', 'dans', 'est', 'une', 'des', 'du', 'vous', 'votre', 'pas', 'sur'],
    es: ['el', 'los', 'las', 'y', 'con', 'para', 'una', 'del', 'es', 'que', 'por', 'su', 'muy', 'como', 'hasta'],
    de: ['der', 'die', 'das', 'und', 'mit', 'für', 'ist', 'ein', 'eine', 'nicht', 'auf', 'den', 'sie', 'zu', 'bis'],
    it: ['il', 'lo', 'gli', 'e', 'con', 'per', 'una', 'del', 'della', 'che', 'non', 'sono', 'di', 'alla', 'fino'],
    pt: ['o', 'os', 'as', 'e', 'com', 'para', 'uma', 'do', 'da', 'que', 'não', 'em', 'seu', 'sua', 'até'],
    nl: ['de', 'het', 'een', 'en', 'met', 'voor', 'van', 'is', 'niet', 'op', 'je', 'zijn', 'dat', 'tot', 'ook'],
};
function guessLanguage(text) {
    if (/[\u0600-\u06FF]/.test(text.slice(0, 2000)))
        return 'ar';
    const words = text.toLowerCase().slice(0, 6000).match(/\p{L}+/gu) ?? [];
    const scores = Object.entries(STOPWORDS).map(([code, list]) => {
        const set = new Set(list);
        return [code, words.filter((w) => set.has(w)).length];
    });
    scores.sort((a, b) => b[1] - a[1]);
    const [[best, top], [, second]] = scores;
    return top >= 8 && top >= second * 1.5 ? best : null;
}
function writingLanguage(requested, declared, text) {
    const wanted = (requested ?? '').trim().toLowerCase();
    if (wanted && wanted !== 'auto')
        return wanted;
    return guessLanguage(text) ?? declared ?? 'en';
}
let RewriterService = RewriterService_1 = class RewriterService {
    llm;
    logger = new common_1.Logger(RewriterService_1.name);
    constructor(llm) {
        this.llm = llm;
    }
    async rewrite(input) {
        if (input.source.text.length > SINGLE_PASS_CHARS)
            return this.rewriteLong(input);
        const { value, provider } = await this.llm.completeJson({
            instructions: input.style === 'faithful' ? INSTRUCTIONS : SEO_INSTRUCTIONS,
            input: this.prompt(input),
            schemaName: 'rewritten_article',
            schema: SCHEMA,
            maxTokens: 7000,
        });
        const generated = normalizeGenerated(value, input.source.title);
        if (!generated.contentHtml || !generated.caption) {
            throw new common_1.ServiceUnavailableException('La réécriture est revenue sans corps d’article ou sans légende');
        }
        this.logger.log(`Article réécrit par ${provider}`);
        return generated;
    }
    async fromNews(input) {
        const language = !input.language || input.language === 'auto' ? 'en' : input.language;
        const { value, provider } = await this.llm.completeJson({
            instructions: NEWS_INSTRUCTIONS,
            input: [
                `Write every field in this language: ${language}.`,
                input.fbCaption?.trim() ? `Text that accompanied the image (tone only, do not copy): ${input.fbCaption.trim().slice(0, 1500)}` : '',
                'Recent headlines (the ONLY news you may use):',
                input.headlines || '(no headline available: stay on broad, timeless themes, no specific facts)',
            ]
                .filter(Boolean)
                .join('\n\n'),
            schemaName: 'news_article',
            schema: NEWS_SCHEMA,
            maxTokens: 4000,
            image: input.image,
        });
        const titles = (Array.isArray(value.titles) ? value.titles : [])
            .map((t) => String(t).replace(/^["“«\s]+|["”»\s]+$/g, '').trim())
            .filter(Boolean)
            .slice(0, 3);
        if (!titles.length)
            throw new common_1.ServiceUnavailableException('La génération est revenue sans titre');
        const generated = normalizeGenerated({ ...value, title: titles[0] }, titles[0]);
        if (!generated.contentHtml || !generated.caption) {
            throw new common_1.ServiceUnavailableException('La génération est revenue sans corps d’article ou sans description');
        }
        this.logger.log(`Article d’actualité généré par ${provider}`);
        return { ...generated, titles, newsHook: String(value.newsHook || '').slice(0, 300) };
    }
    async readImageText(input) {
        const target = (0, image_translator_service_1.languageName)(input.language);
        const { value } = await this.llm.completeJson({
            instructions: 'You read images. List every piece of text visible in the image (signs, captions, labels, memes, numbers with words), ' +
                `and translate each into ${target}. Also describe the scene in one short sentence (in English). ` +
                'Ignore watermarks and tiny unreadable text. Answer with a single JSON object: ' +
                '{"hasText": boolean, "texts": [{"original": string, "translated": string}], "scene": string}.',
            input: `Target language: ${target}.`,
            schemaName: 'image_text',
            schema: {
                type: 'object',
                additionalProperties: false,
                properties: {
                    hasText: { type: 'boolean' },
                    texts: { type: 'array', items: { type: 'object', additionalProperties: false, properties: { original: { type: 'string' }, translated: { type: 'string' } }, required: ['original', 'translated'] } },
                    scene: { type: 'string' },
                },
                required: ['hasText', 'texts', 'scene'],
            },
            maxTokens: 1500,
            image: input.image,
        });
        const texts = (Array.isArray(value.texts) ? value.texts : []).filter((t) => t && String(t.original || '').trim());
        return { hasText: Boolean(value.hasText) && texts.length > 0, texts, scene: String(value.scene || '').slice(0, 400) };
    }
    async engagementCaption(input) {
        const target = (0, image_translator_service_1.languageName)(input.language);
        const { value, provider } = await this.llm.completeJson({
            instructions: [
                'You write posts for Facebook groups. Their only goal is engagement that grows the group: reactions, comments and shares,',
                'so that people who see the post in their feed want to join and follow the group.',
                `Write in ${target} only.`,
                'From the image description and the text in the image, write a short, warm, relatable description (1 to 3 short sentences): a feeling, a memory or a small truth that many people share.',
                'End with ONE question that is very easy to answer in a few words (their opinion, their memory, their choice between two things, how it is in their country or family) — the kind of question people love to answer and that starts conversations between members.',
                'Never use engagement bait, which Facebook demotes: no "like if", "share if", "tag a friend", "comment YES", "type 1", "react with", no voting with reactions, no "follow the group", no begging.',
                'No link, no URL, no "link in comments", no hashtag inside the text, no clickbait lie, no all caps, at most one or two emojis.',
                'Also give a short internal title (max 8 words) and 2 to 4 relevant hashtags without #.',
                'Answer with a single JSON object: {"title": string, "caption": string, "hashtags": string[]}.',
            ].join(' '),
            input: [
                `Image: ${input.scene || '(no description)'}`,
                input.texts.length ? `Text in the image (already in ${target}): ${input.texts.join(' | ')}` : '',
                input.fbCaption?.trim() ? `Original post text (tone only, do not copy): ${input.fbCaption.trim().slice(0, 800)}` : '',
            ]
                .filter(Boolean)
                .join('\n'),
            schemaName: 'engagement_post',
            schema: {
                type: 'object',
                additionalProperties: false,
                properties: { title: { type: 'string' }, caption: { type: 'string' }, hashtags: { type: 'array', items: { type: 'string' } } },
                required: ['title', 'caption', 'hashtags'],
            },
            maxTokens: 1200,
            prefer: ['deepseek'],
        });
        const caption = cleanCaption(String(value.caption || ''));
        if (!caption)
            throw new common_1.ServiceUnavailableException('La description est revenue vide');
        this.logger.log(`Description « engagement » écrite par ${provider}`);
        return { title: String(value.title || '').trim().slice(0, 120) || caption.slice(0, 60), caption, hashtags: normalizeHashtags(value.hashtags || []).slice(0, 4), provider };
    }
    async rewriteLong(input) {
        const style = input.style === 'faithful' ? 'faithful' : 'seo';
        const text = input.source.text.slice(0, MAX_LONG_SOURCE_CHARS);
        const parts = splitNotes(text);
        const target = (0, image_translator_service_1.languageName)(writingLanguage(input.language, input.source.language, text));
        const header = `Writing language: ${target}. EVERY field of the JSON is in ${target}, without exception, whatever the language of these instructions or of the Facebook post.`;
        let first = null;
        const bodies = [];
        const providers = [];
        for (let index = 0; index < parts.length; index += 1) {
            const part = index + 1;
            const written = bodies.join('\n');
            const input_ = [
                header,
                `Source title: ${input.source.title}`,
                part === 1 && input.fbCaption?.trim() ? `Tone of the original Facebook post, not to be copied: ${input.fbCaption.trim()}` : '',
                part > 1 ? `End of the text already written (continue right after it, never repeat it):\n…${plainText(written).slice(-CONTINUITY_CHARS)}` : '',
                `Notes of part ${part} of ${parts.length}:`,
                parts[index],
            ].filter(Boolean).join('\n\n');
            let html;
            try {
                if (part === 1) {
                    const { value, provider } = await this.llm.completeJson({
                        instructions: partInstructions(style, part, parts.length),
                        input: input_,
                        schemaName: 'rewritten_article',
                        schema: SCHEMA,
                        maxTokens: 7000,
                    });
                    first = value;
                    html = value.contentHtml || '';
                    providers.push(provider);
                }
                else {
                    const { value, provider } = await this.llm.completeJson({
                        instructions: partInstructions(style, part, parts.length),
                        input: input_,
                        schemaName: 'rewritten_part',
                        schema: PART_SCHEMA,
                        maxTokens: 7000,
                    });
                    html = value.contentHtml || '';
                    providers.push(provider);
                }
            }
            catch (error) {
                throw new common_1.ServiceUnavailableException(`Réécriture de la partie ${part}/${parts.length} impossible : ${error.message}`);
            }
            if (!sanitizeArticleHtml(html).trim()) {
                throw new common_1.ServiceUnavailableException(`La partie ${part}/${parts.length} de la réécriture est revenue vide`);
            }
            bodies.push(html);
        }
        const generated = normalizeGenerated({ ...first, contentHtml: bodies.join('\n') }, input.source.title);
        if (!generated.contentHtml || !generated.caption) {
            throw new common_1.ServiceUnavailableException('La réécriture est revenue sans corps d’article ou sans légende');
        }
        this.logger.log(`Article long réécrit en ${parts.length} parties (${[...new Set(providers)].join(', ')})`);
        return generated;
    }
    prompt({ source, fbCaption, language }) {
        const notes = source.text.slice(0, MAX_SOURCE_CHARS);
        const target = (0, image_translator_service_1.languageName)(writingLanguage(language, source.language, notes));
        return [
            `Writing language: ${target}. EVERY field of the JSON (title, slug, excerpt, metaDescription, contentHtml, caption, hashtags) ` +
                `is in ${target}, without exception, whatever the language of these instructions or of the Facebook post.`,
            `Source title: ${source.title}`,
            fbCaption?.trim()
                ? `Tone of the original Facebook post, not to be copied: ${fbCaption.trim()}`
                : '',
            'Notes from the source page:',
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