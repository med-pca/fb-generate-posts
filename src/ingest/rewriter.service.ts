import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { LlmService } from '../llm/llm.service';
import { SourceArticle } from './source-reader.service';
import { languageName } from './image-translator.service';

/** L'article réécrit, prêt pour WordPress, et la publication qui
 * l'accompagnera. Les hashtags restent à part : `postDataForSlot` les
 * recolle lui-même au moment de fabriquer le post. */
export type GeneratedArticle = {
  title: string;
  slug: string;
  excerpt: string;
  metaDescription: string;
  contentHtml: string;
  caption: string;
  hashtags: string[];
};

/** Notre propre article, né d'une image et de l'actualité du moment. */
export type NewsArticle = GeneratedArticle & {
  /** Les 3 titres proposés ; `title` est le premier. */
  titles: string[];
  /** Le titre d'actualité auquel l'image a été rattachée. */
  newsHook: string;
};

export type NewsInput = {
  image: { data: string; mimeType: string };
  /** Le texte qui accompagnait l'image sur Facebook, s'il y en a un. */
  fbCaption?: string | null;
  /** Les titres d'actualité du moment, un par ligne. */
  headlines: string;
  language: string;
};

export type RewriteInput = {
  source: SourceArticle;
  /** La légende du post d'origine, comme indication de ton. */
  fbCaption?: string | null;
  language: string;
};

/** Au-delà, la source coûte cher à traiter sans rien apporter : un article
 * tient largement dedans. */
// Un article lu sur plusieurs pages est long : on en garde assez pour que le
// modèle voie tout le contenu (étapes, ingrédients, conseils de fin).
const MAX_SOURCE_CHARS = 40_000;
const MAX_CAPTION_CHARS = 1_200;
const MAX_HASHTAGS = 10;
/** Le corps est du texte structuré, rien d'autre : ni lien, ni image, ni
 * mise en page. Ce qui sort de cette liste perd sa balise, pas son texte. */
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

/** Un identifiant d'URL lisible, diacritiques latins retirés mais écritures
 * non latines conservées : WordPress sait les servir, et les effacer
 * réduirait tout un titre arabe ou grec à rien. */
export function normalizeSlug(value: string, fallback: string) {
  const slugify = (input: string) => {
    const full = input
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, '-')
      .replace(/^-+|-+$/g, '');
    if (full.length <= 80) return full;
    // Couper au dernier séparateur : un mot tronqué en fin d'URL ne dit rien.
    const cut = full.slice(0, 80);
    const boundary = cut.lastIndexOf('-');
    return (boundary > 0 ? cut.slice(0, boundary) : cut).replace(/-+$/, '');
  };
  return slugify(value) || slugify(fallback) || 'article';
}

/** La légende part avec l'image seule : l'URL arrive plus tard, dans le
 * commentaire, et les hashtags sont recollés à la fabrication du post. En
 * laisser ici les ferait apparaître deux fois. */
export function cleanCaption(value: string) {
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

/** Deuxième filet, avant celui de WordPress : le corps ne garde que des
 * balises de structure, sans le moindre attribut. Un bloc exécutable part
 * avec son contenu — n'en retirer que la balise laisserait le code en clair
 * dans l'article. */
export function sanitizeArticleHtml(html: string) {
  return (
    html
      // Un modèle écrit parfois « \n » en toutes lettres dans le HTML, au
      // lieu du saut de ligne que le JSON aurait porté. Laissé tel quel, il
      // ressort en « n » isolé dans l'article : WordPress applique
      // `wp_unslash` à ce qu'on lui confie et mange l'antislash.
      .replace(/\\r\\n|\\n|\\r/g, '\n')
      .replace(/\\t/g, ' ')
      .replace(
        /<(script|style|iframe|object|embed|noscript|template)\b[\s\S]*?<\/\1\s*>/gi,
        '',
      )
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(
        /<(\/?)([a-zA-Z][a-zA-Z0-9]*)\b[^>]*>/g,
        (_tag, closing, name) => {
          const lower = String(name).toLowerCase();
          if (!ALLOWED_TAGS.has(lower)) return '';
          if (lower === 'br') return '<br />';
          return closing ? `</${lower}>` : `<${lower}>`;
        },
      )
      .replace(/[^\S\n]+/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim()
  );
}

/** Les hashtags sont stockés sans dièse : `postDataForSlot` le remet. */
export function normalizeHashtags(values: string[]) {
  const seen = new Set<string>();
  for (const value of values) {
    const tag = value
      .normalize('NFC')
      .replace(/^#+/, '')
      .replace(/[^\p{L}\p{N}_]/gu, '');
    if (tag) seen.add(tag);
    if (seen.size >= MAX_HASHTAGS) break;
  }
  return [...seen];
}

/** Rien de ce que le modèle rend n'est repris tel quel : le schéma garantit
 * la forme, pas le contenu. */
export function normalizeGenerated(
  raw: GeneratedArticle,
  fallbackTitle: string,
): GeneratedArticle {
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
      description:
        'Corps de l’article en HTML, balises <h2> <h3> <p> <ul> <ol> <li> <strong> <em> uniquement, sans attribut',
    },
    caption: {
      type: 'string',
      description:
        'Légende Facebook de 2 à 4 phrases, sans URL et sans hashtag',
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
} as const;

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
} as const;

/** La consigne du « journaliste viral » — celle de l'équipe, en anglais (nos
 * articles le sont), avec un garde-fou : l'actualité vient UNIQUEMENT des
 * titres fournis. Un modèle ne connaît pas l'actualité du jour ; sans cette
 * règle, il inventerait des faits. */
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

@Injectable()
export class RewriterService {
  private readonly logger = new Logger(RewriterService.name);

  constructor(private readonly llm: LlmService) {}

  async rewrite(input: RewriteInput): Promise<GeneratedArticle> {
    const { value, provider } = await this.llm.completeJson<GeneratedArticle>({
      instructions: INSTRUCTIONS,
      input: this.prompt(input),
      schemaName: 'rewritten_article',
      schema: SCHEMA,
      maxTokens: 6000,
    });
    const generated = normalizeGenerated(value, input.source.title);
    if (!generated.contentHtml || !generated.caption) {
      throw new ServiceUnavailableException(
        'La réécriture est revenue sans corps d’article ou sans légende',
      );
    }
    this.logger.log(`Article réécrit par ${provider}`);
    return generated;
  }

  /** Notre propre article : l'image, rapprochée de l'actualité du moment. */
  async fromNews(input: NewsInput): Promise<NewsArticle> {
    const language = !input.language || input.language === 'auto' ? 'en' : input.language;
    const { value, provider } = await this.llm.completeJson<Omit<NewsArticle, 'title'> & { title?: string }>({
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
    if (!titles.length) throw new ServiceUnavailableException('La génération est revenue sans titre');
    const generated = normalizeGenerated({ ...(value as GeneratedArticle), title: titles[0] }, titles[0]);
    if (!generated.contentHtml || !generated.caption) {
      throw new ServiceUnavailableException('La génération est revenue sans corps d’article ou sans description');
    }
    this.logger.log(`Article d’actualité généré par ${provider}`);
    return { ...generated, titles, newsHook: String(value.newsHook || '').slice(0, 300) };
  }

  /** Le texte présent dans l'image, et sa traduction (modèle qui voit
   * l'image). `hasText: false` : rien à traduire, l'image part telle quelle. */
  async readImageText(input: { image: { data: string; mimeType: string }; language: string }) {
    const target = languageName(input.language);
    const { value } = await this.llm.completeJson<{ hasText: boolean; texts: Array<{ original: string; translated: string }>; scene: string }>({
      instructions:
        'You read images. List every piece of text visible in the image (signs, captions, labels, memes, numbers with words), ' +
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

  /** La description d'un post « engagement » : courte, dans la langue cible,
   * faite pour faire réagir — DeepSeek d'abord. Pas de lien, pas d'article. */
  async engagementCaption(input: { language: string; scene: string; texts: string[]; fbCaption?: string | null }) {
    const target = languageName(input.language);
    const { value, provider } = await this.llm.completeJson<{ title: string; caption: string; hashtags: string[] }>({
      instructions: [
        'You write social media posts for Facebook groups whose only goal is engagement (reactions, comments, shares).',
        `Write in ${target} only.`,
        'From the image description and the text in the image, write a short, warm, catchy description (1 to 3 short sentences) that ends with ONE simple question inviting people to comment (e.g. ask their opinion, their memory, their choice).',
        'No link, no URL, no "link in comments", no hashtag inside the text, no clickbait lie, no all caps.',
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
    if (!caption) throw new ServiceUnavailableException('La description est revenue vide');
    this.logger.log(`Description « engagement » écrite par ${provider}`);
    return { title: String(value.title || '').trim().slice(0, 120) || caption.slice(0, 60), caption, hashtags: normalizeHashtags(value.hashtags || []).slice(0, 4), provider };
  }

  private prompt({ source, fbCaption, language }: RewriteInput) {
    const notes = source.text.slice(0, MAX_SOURCE_CHARS);
    // Réécrire n'est pas traduire : sans langue imposée, celle que la page
    // source déclare l'emporte. La consigne système étant en français, une
    // simple invitation à « garder la langue des notes » ne suffit pas — le
    // modèle repart en français. Il faut la nommer.
    const wanted = language.trim().toLowerCase();
    const effective =
      !wanted || wanted === 'auto' ? (source.language ?? '') : language;
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
}
