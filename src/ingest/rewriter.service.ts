import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { LlmService } from '../llm/llm.service';
import { SourceArticle } from './source-reader.service';

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

export type RewriteInput = {
  source: SourceArticle;
  /** La légende du post d'origine, comme indication de ton. */
  fbCaption?: string | null;
  language: string;
};

/** Au-delà, la source coûte cher à traiter sans rien apporter : un article
 * tient largement dedans. */
const MAX_SOURCE_CHARS = 12_000;
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
