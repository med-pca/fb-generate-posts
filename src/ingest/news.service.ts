import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/** Les flux par défaut : actualité internationale, économie, et les titres du
 * moment. Remplaçables par NEWS_FEEDS (adresses séparées par des virgules). */
const DEFAULT_FEEDS = [
  'https://feeds.bbci.co.uk/news/world/rss.xml',
  'https://feeds.bbci.co.uk/news/business/rss.xml',
  'https://news.google.com/rss?hl=en-US&gl=US&ceid=US:en',
];
const CACHE_MS = 30 * 60_000;
const MAX_AGE_MS = 72 * 3600_000;
const MAX_HEADLINES = 30;
const TIMEOUT_MS = 10_000;

export type Headline = { title: string; summary: string; source: string; publishedAt: string | null };

/** Le texte d'une balise RSS (CDATA et entités compris). */
function tag(item: string, name: string) {
  const m = new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, 'i').exec(item);
  if (!m) return '';
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

/** Lit un flux RSS : titres, résumés, dates. */
export function parseFeed(xml: string, source: string): Headline[] {
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

/** L'actualité du moment, pour rapprocher une image de ce qui se passe
 * AUJOURD'HUI : un modèle de langue ne connaît pas l'actualité, il ne doit
 * pas l'inventer. Les titres sont gardés 30 min en mémoire. */
@Injectable()
export class NewsService {
  private readonly logger = new Logger(NewsService.name);
  private cache: { at: number; headlines: Headline[] } | null = null;

  constructor(private readonly config: ConfigService) {}

  feeds() {
    const raw = this.config.get<string>('NEWS_FEEDS');
    return raw ? raw.split(',').map((u) => u.trim()).filter((u) => /^https:\/\//.test(u)) : DEFAULT_FEEDS;
  }

  async headlines(now = Date.now()): Promise<Headline[]> {
    if (this.cache && now - this.cache.at < CACHE_MS) return this.cache.headlines;
    const lists = await Promise.all(
      this.feeds().map(async (url) => {
        try {
          const response = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS), headers: { accept: 'application/rss+xml, application/xml, text/xml' } });
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          return parseFeed(await response.text(), new URL(url).hostname.replace(/^(www|feeds)\./, ''));
        } catch (error) {
          this.logger.warn(`Flux d’actualité illisible (${url}) : ${(error as Error).message}`);
          return [];
        }
      }),
    );
    const seen = new Set<string>();
    const headlines = lists
      .flat()
      .filter((h) => !h.publishedAt || now - new Date(h.publishedAt).getTime() < MAX_AGE_MS)
      .filter((h) => {
        const key = h.title.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().slice(0, 80);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .sort((a, b) => (b.publishedAt || '').localeCompare(a.publishedAt || ''))
      .slice(0, MAX_HEADLINES);
    if (headlines.length) this.cache = { at: now, headlines };
    return headlines;
  }
}

/** La liste telle qu'elle est donnée au modèle (et gardée sur la reprise). */
export function headlinesText(headlines: Headline[]) {
  return headlines
    .map((h, i) => `${i + 1}. ${h.title}${h.summary ? ` — ${h.summary}` : ''} (${h.source}${h.publishedAt ? `, ${h.publishedAt.slice(0, 10)}` : ''})`)
    .join('\n');
}
