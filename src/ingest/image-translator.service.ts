import { BadGatewayException, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI, { toFile } from 'openai';

export type ImageData = { data: string; mimeType: string };
export const IMAGE_PROVIDER_NAMES = ['openai', 'qwen', 'seedream'] as const;
export type ImageProviderName = (typeof IMAGE_PROVIDER_NAMES)[number];

const TIMEOUT_MS = 180_000;

/** Les noms des langues, pour la consigne. */
export const LANGUAGES: Record<string, string> = {
  en: 'English', fr: 'French', ar: 'Arabic', es: 'Spanish', de: 'German', it: 'Italian', pt: 'Portuguese',
  nl: 'Dutch', tr: 'Turkish', pl: 'Polish', ro: 'Romanian', ru: 'Russian', hi: 'Hindi', id: 'Indonesian',
};
export const languageName = (code: string) => LANGUAGES[code] ?? code;

/** La consigne de retouche : traduire le texte, ne rien changer d'autre. */
export function editPrompt(language: string, texts: string[] = []) {
  const target = languageName(language);
  return [
    `Translate every piece of text visible in this image into ${target}.`,
    'Keep exactly the same layout, positions, font style, sizes, colours and every non-text element (people, objects, background).',
    'Replace only the words. Do not add any new text, caption, watermark or logo, and do not crop.',
    texts.length ? `Texts found in the image and their translation: ${texts.join(' | ')}` : '',
  ]
    .filter(Boolean)
    .join(' ');
}

/** Traduire le texte d'une image : même image, texte remplacé. Trois
 * fournisseurs au choix, réglés dans la plateforme (Paramètres → IA d'image) ;
 * leurs clés et modèles restent dans l'environnement du serveur :
 *
 *   openai   : OPENAI_API_KEY, OPENAI_IMAGE_MODEL (défaut gpt-image-1-mini)
 *   qwen     : DASHSCOPE_API_KEY, QWEN_IMAGE_MODEL (défaut qwen-image-edit),
 *              DASHSCOPE_BASE_URL (défaut https://dashscope-intl.aliyuncs.com)
 *   seedream : ARK_API_KEY, SEEDREAM_MODEL (défaut seedream-4-0-250828),
 *              ARK_BASE_URL (défaut https://ark.ap-southeast.bytepluses.com)
 *
 * `auto` prend le premier configuré dans l'ordre IMAGE_PROVIDERS (défaut
 * openai,qwen,seedream). Un fournisseur en panne fait passer au suivant. */
@Injectable()
export class ImageTranslatorService {
  private readonly logger = new Logger(ImageTranslatorService.name);

  constructor(private readonly config: ConfigService) {}

  private setting(name: string, fallback = '') {
    return this.config.get<string>(name) || fallback;
  }

  /** Ce qui est configuré — jamais les clés. */
  providers() {
    return [
      { name: 'openai' as const, label: 'OpenAI GPT Image', model: this.setting('OPENAI_IMAGE_MODEL', 'gpt-image-1-mini'), configured: Boolean(this.setting('OPENAI_API_KEY')) },
      { name: 'qwen' as const, label: 'Alibaba Qwen Image', model: this.setting('QWEN_IMAGE_MODEL', 'qwen-image-edit'), configured: Boolean(this.setting('DASHSCOPE_API_KEY')) },
      { name: 'seedream' as const, label: 'ByteDance Seedream', model: this.setting('SEEDREAM_MODEL', 'seedream-4-0-250828'), configured: Boolean(this.setting('ARK_API_KEY')) },
    ];
  }

  /** L'ordre d'essai : le choix de la plateforme d'abord, puis les autres. */
  order(preferred: string) {
    const configured = this.providers().filter((p) => p.configured);
    const wanted = this.setting('IMAGE_PROVIDERS', 'openai,qwen,seedream').split(',').map((s) => s.trim());
    configured.sort((a, b) => {
      if (a.name === preferred) return -1;
      if (b.name === preferred) return 1;
      return wanted.indexOf(a.name) - wanted.indexOf(b.name);
    });
    return configured;
  }

  async translate(image: ImageData, language: string, texts: string[] = [], preferred = 'auto'): Promise<ImageData & { provider: string }> {
    const order = this.order(preferred);
    if (!order.length) {
      throw new ServiceUnavailableException('Aucune IA d’image configurée : renseigner OPENAI_API_KEY, DASHSCOPE_API_KEY (Qwen) ou ARK_API_KEY (Seedream)');
    }
    const prompt = editPrompt(language, texts);
    const failures: string[] = [];
    for (const p of order) {
      try {
        const out =
          p.name === 'openai' ? await this.openai(image, prompt, p.model) : p.name === 'qwen' ? await this.qwen(image, prompt, p.model) : await this.seedream(image, prompt, p.model);
        this.logger.log(`Image traduite (${languageName(language)}) par ${p.label} — ${p.model}`);
        return { ...out, provider: `${p.name}:${p.model}` };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.warn(`${p.label} : ${message}`);
        failures.push(`${p.label} (${message})`);
      }
    }
    throw new BadGatewayException(`Aucune IA d’image n’a traduit l’image — ${failures.join(' ; ')}`);
  }

  private async openai(image: ImageData, prompt: string, model: string): Promise<ImageData> {
    const client = new OpenAI({ apiKey: this.setting('OPENAI_API_KEY'), maxRetries: 0, timeout: TIMEOUT_MS });
    const ext = image.mimeType.split('/')[1] || 'png';
    const result = await client.images.edit({
      model,
      image: await toFile(Buffer.from(image.data, 'base64'), `image.${ext}`, { type: image.mimeType }),
      prompt,
      n: 1,
    });
    const b64 = result.data?.[0]?.b64_json;
    if (b64) return { data: b64, mimeType: 'image/png' };
    const url = result.data?.[0]?.url;
    if (url) return this.download(url);
    throw new Error('réponse sans image');
  }

  private async qwen(image: ImageData, prompt: string, model: string): Promise<ImageData> {
    const base = this.setting('DASHSCOPE_BASE_URL', 'https://dashscope-intl.aliyuncs.com').replace(/\/+$/, '');
    const response = await fetch(`${base}/api/v1/services/aigc/multimodal-generation/generation`, {
      method: 'POST',
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { 'content-type': 'application/json', authorization: `Bearer ${this.setting('DASHSCOPE_API_KEY')}` },
      body: JSON.stringify({
        model,
        input: { messages: [{ role: 'user', content: [{ image: `data:${image.mimeType};base64,${image.data}` }, { text: prompt }] }] },
        parameters: { watermark: false },
      }),
    });
    const body = (await response.json().catch(() => null)) as any;
    if (!response.ok) throw new Error(`HTTP ${response.status} ${body?.message || body?.code || ''}`.trim());
    const url = body?.output?.choices?.[0]?.message?.content?.find?.((c: any) => c.image)?.image;
    if (!url) throw new Error('réponse sans image');
    return this.download(url);
  }

  private async seedream(image: ImageData, prompt: string, model: string): Promise<ImageData> {
    const base = this.setting('ARK_BASE_URL', 'https://ark.ap-southeast.bytepluses.com').replace(/\/+$/, '');
    const response = await fetch(`${base}/api/v3/images/generations`, {
      method: 'POST',
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { 'content-type': 'application/json', authorization: `Bearer ${this.setting('ARK_API_KEY')}` },
      body: JSON.stringify({
        model,
        prompt,
        image: `data:${image.mimeType};base64,${image.data}`,
        response_format: 'b64_json',
        watermark: false,
      }),
    });
    const body = (await response.json().catch(() => null)) as any;
    if (!response.ok) throw new Error(`HTTP ${response.status} ${body?.error?.message || ''}`.trim());
    const item = body?.data?.[0];
    if (item?.b64_json) return { data: item.b64_json, mimeType: 'image/jpeg' };
    if (item?.url) return this.download(item.url);
    throw new Error('réponse sans image');
  }

  private async download(url: string): Promise<ImageData> {
    const response = await fetch(url, { signal: AbortSignal.timeout(60_000) });
    if (!response.ok) throw new Error(`image générée illisible (HTTP ${response.status})`);
    const mimeType = (response.headers.get('content-type') || 'image/png').split(';')[0].trim();
    return { data: Buffer.from(await response.arrayBuffer()).toString('base64'), mimeType };
  }
}
