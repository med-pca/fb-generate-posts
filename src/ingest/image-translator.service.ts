import { BadGatewayException, BadRequestException, Injectable, Logger, Optional, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import OpenAI, { toFile } from 'openai';

export type ImageData = { data: string; mimeType: string };
export const IMAGE_PROVIDER_NAMES = ['openai', 'qwen', 'seedream'] as const;
export type ImageProviderName = (typeof IMAGE_PROVIDER_NAMES)[number];

const TIMEOUT_MS = 180_000;

/** Par fournisseur : les variables d'environnement et les valeurs par défaut. */
const PROVIDERS = {
  openai: { label: 'OpenAI GPT Image', key: 'OPENAI_API_KEY', model: ['OPENAI_IMAGE_MODEL', 'gpt-image-1-mini'], base: null },
  qwen: { label: 'Alibaba Qwen Image', key: 'DASHSCOPE_API_KEY', model: ['QWEN_IMAGE_MODEL', 'qwen-image-edit'], base: ['DASHSCOPE_BASE_URL', 'https://dashscope-intl.aliyuncs.com'] },
  seedream: { label: 'ByteDance Seedream', key: 'ARK_API_KEY', model: ['SEEDREAM_MODEL', 'seedream-4-0-250828'], base: ['ARK_BASE_URL', 'https://ark.ap-southeast.bytepluses.com'] },
} as const;

type Override = { apiKey: string | null; model: string | null; baseUrl: string | null; updatedAt: Date; updatedBy: string | null };

/** Les noms des langues, pour la consigne. */
export { LANGUAGES, languageName } from '../languages/languages.registry';
import { languageName } from '../languages/languages.registry';

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
 * fournisseurs au choix, réglés dans la plateforme (Pilotage → Règles → IA
 * d'image) : clé, modèle et adresse saisis là passent avant l'environnement
 * du serveur, qui reste le repli :
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

  constructor(
    private readonly config: ConfigService,
    @Optional() private readonly prisma?: PrismaService,
  ) {}

  private setting(name: string, fallback = '') {
    return this.config.get<string>(name) || fallback;
  }

  /** Les réglages saisis dans la plateforme, relus toutes les 30 s. */
  private overrides = new Map<string, Override>();
  private loadedAt = 0;
  async load(force = false) {
    if (!this.prisma || (!force && Date.now() - this.loadedAt < 30_000)) return;
    const rows = await Promise.resolve(this.prisma.aiProviderSetting?.findMany()).catch(() => null);
    if (!rows) return;
    this.overrides = new Map(rows.map((r) => [r.provider, r]));
    this.loadedAt = Date.now();
  }

  /** La clé, le modèle et l'adresse en vigueur : plateforme, sinon serveur. */
  private resolved(name: ImageProviderName) {
    const def = PROVIDERS[name];
    const o = this.overrides.get(name);
    const envKey = this.setting(def.key);
    return {
      apiKey: o?.apiKey || envKey,
      keySource: o?.apiKey ? ('plateforme' as const) : envKey ? ('serveur' as const) : null,
      model: o?.model || this.setting(def.model[0], def.model[1]),
      baseUrl: (o?.baseUrl || (def.base ? this.setting(def.base[0], def.base[1]) : '')).replace(/\/+$/, ''),
    };
  }

  /** Ce qui est configuré — jamais les clés (seulement leur fin). */
  providers() {
    return IMAGE_PROVIDER_NAMES.map((name) => {
      const r = this.resolved(name);
      const o = this.overrides.get(name);
      return {
        name,
        label: PROVIDERS[name].label,
        model: r.model,
        configured: Boolean(r.apiKey),
        keySource: r.keySource,
        keyHint: r.apiKey ? `…${r.apiKey.slice(-4)}` : null,
        baseUrl: r.baseUrl || null,
        defaultModel: PROVIDERS[name].model[1],
        defaultBaseUrl: PROVIDERS[name].base?.[1] ?? null,
        updatedAt: o?.updatedAt ?? null,
        updatedBy: o?.updatedBy ?? null,
      };
    });
  }

  /** Régler un fournisseur depuis la plateforme (ADMIN). `apiKey` absent =
   * garder la clé, `clearKey` = l'effacer (retour à celle du serveur).
   * Modèle ou adresse vides = valeurs par défaut. */
  async configure(name: string, input: { apiKey?: string; clearKey?: boolean; model?: string | null; baseUrl?: string | null }, by: string | null) {
    if (!this.prisma) throw new ServiceUnavailableException('Base indisponible');
    if (!(IMAGE_PROVIDER_NAMES as readonly string[]).includes(name)) throw new BadRequestException(`IA d’image inconnue : ${name}`);
    const baseUrl = input.baseUrl?.trim() || null;
    if (baseUrl && !/^https:\/\/[\w.-]+(:\d+)?(\/.*)?$/i.test(baseUrl)) throw new BadRequestException('Adresse invalide : https://… attendu');
    const apiKey = input.apiKey?.trim();
    if (apiKey !== undefined && apiKey !== '' && (apiKey.length < 10 || /\s/.test(apiKey))) throw new BadRequestException('Clé invalide');
    const data = {
      ...(input.clearKey ? { apiKey: null } : apiKey ? { apiKey } : {}),
      ...(input.model !== undefined ? { model: input.model?.trim() || null } : {}),
      ...(input.baseUrl !== undefined ? { baseUrl } : {}),
      updatedBy: by,
    };
    await this.prisma.aiProviderSetting.upsert({ where: { provider: name }, create: { provider: name, ...data }, update: data });
    await this.load(true);
    return this.providers().find((p) => p.name === name);
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
    await this.load();
    const order = this.order(preferred);
    if (!order.length) {
      throw new ServiceUnavailableException('Aucune IA d’image configurée : saisir une clé dans Pilotage → Règles & priorités → IA d’image (ou OPENAI_API_KEY, DASHSCOPE_API_KEY, ARK_API_KEY sur le serveur)');
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
    const client = new OpenAI({ apiKey: this.resolved('openai').apiKey, maxRetries: 0, timeout: TIMEOUT_MS });
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
    const { baseUrl: base, apiKey } = this.resolved('qwen');
    const response = await fetch(`${base}/api/v1/services/aigc/multimodal-generation/generation`, {
      method: 'POST',
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
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
    const { baseUrl: base, apiKey } = this.resolved('seedream');
    const response = await fetch(`${base}/api/v3/images/generations`, {
      method: 'POST',
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
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
