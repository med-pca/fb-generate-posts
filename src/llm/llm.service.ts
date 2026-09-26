import {
  Inject,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';

/** Un fournisseur joignable en « Chat Completions ». C'est la seule interface
 * que Kimi, OpenAI et Gemini exposent tous les trois : l'API Responses est
 * propre à OpenAI, s'y tenir interdirait tout repli. */
export type LlmProvider = {
  name: string;
  apiKey: string;
  baseURL?: string;
  model: string;
  /** Le fournisseur accepte un schéma strict. Sinon, mode JSON libre et le
   * schéma part dans la consigne : la sortie est de toute façon renormalisée. */
  jsonSchema: boolean;
  /** Une réécriture honnête prend déjà une bonne minute ; au-delà, c'est le
   * fournisseur qui ne répondra pas, et la chaîne perd ce délai avant
   * d'essayer le suivant. */
  timeoutMs: number;
  /** Les modèles OpenAI récents refusent `max_tokens` et veulent
   * `max_completion_tokens` ; les passerelles compatibles, elles, n'ont
   * souvent que l'ancien nom. */
  tokenParam: 'max_tokens' | 'max_completion_tokens';
  /** Budget de sortie. Les modèles à raisonnement consomment plusieurs
   * milliers de tokens avant d'écrire la première phrase : leur laisser le
   * budget d'un modèle ordinaire tronque la réponse. 0 = celui de l'appel. */
  maxTokens: number;
};

export type JsonRequest = {
  instructions: string;
  input: string;
  schemaName: string;
  schema: Record<string, unknown>;
  maxTokens: number;
};

export type LlmTransport = (
  provider: LlmProvider,
  request: JsonRequest,
) => Promise<string>;

export const LLM_TRANSPORT = Symbol('LLM_TRANSPORT');

/** Réglages par fournisseur. Seule la clé décide de sa présence : un
 * fournisseur sans clé est simplement absent de la chaîne. */
const DEFAULTS = {
  kimi: {
    baseURL: 'https://api.moonshot.ai/v1',
    model: 'kimi-k2.6',
    // Non vérifié sur ce compte : le mode JSON libre marche partout.
    jsonSchema: false,
    tokenParam: 'max_tokens',
    maxTokens: 0,
    timeoutMs: 0,
  },
  openai: {
    baseURL: undefined,
    model: 'gpt-4.1-mini',
    jsonSchema: true,
    tokenParam: 'max_completion_tokens',
    maxTokens: 0,
    timeoutMs: 0,
  },
  deepseek: {
    baseURL: 'https://api.deepseek.com/v1',
    // `deepseek-v4-pro` rend le même article que `deepseek-flash` pour un
    // tiers de tokens en moins, à latence égale.
    model: 'deepseek-v4-pro',
    // Vérifié : le schéma strict est refusé (« response_format type is
    // unavailable »), le mode JSON libre passe.
    jsonSchema: false,
    tokenParam: 'max_tokens',
    // Mesuré : ~2 500 tokens de raisonnement avant la première phrase.
    maxTokens: 8000,
    // Mesuré : 75 s pour un article complet, trop près du délai commun.
    timeoutMs: 180_000,
  },
  gemini: {
    baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai/',
    model: 'gemini-2.5-flash',
    jsonSchema: true,
    tokenParam: 'max_tokens',
    maxTokens: 0,
    timeoutMs: 0,
  },
} as const;

const DEFAULT_ORDER = 'openai,deepseek,gemini,kimi';
const DEFAULT_TIMEOUT_MS = 90_000;

/** Le transport réel. Le SDK OpenAI parle à n'importe quelle passerelle
 * compatible : seule l'URL de base change. */
export const chatCompletionsTransport: LlmTransport = async (
  provider,
  request,
) => {
  const client = new OpenAI({
    apiKey: provider.apiKey,
    baseURL: provider.baseURL,
    maxRetries: 0,
    timeout: provider.timeoutMs,
  });
  const response = await client.chat.completions.create({
    model: provider.model,
    [provider.tokenParam]: provider.maxTokens || request.maxTokens,
    messages: [
      { role: 'system', content: request.instructions },
      { role: 'user', content: request.input },
    ],
    response_format: provider.jsonSchema
      ? {
          type: 'json_schema',
          json_schema: {
            name: request.schemaName,
            strict: true,
            schema: request.schema,
          },
        }
      : { type: 'json_object' },
  });
  const choice = response.choices[0];
  if (choice?.finish_reason === 'length') {
    throw new Error('réponse tronquée : max_tokens atteint');
  }
  const content = choice?.message?.content;
  if (!content) throw new Error('réponse vide');
  return content;
};

@Injectable()
export class LlmService {
  private readonly logger = new Logger(LlmService.name);

  constructor(
    private readonly config: ConfigService,
    @Inject(LLM_TRANSPORT) private readonly transport: LlmTransport,
  ) {}

  /** Les fournisseurs configurés, dans l'ordre demandé. */
  providers(): LlmProvider[] {
    const order = (this.config.get<string>('LLM_PROVIDERS') || DEFAULT_ORDER)
      .split(',')
      .map((name) => name.trim().toLowerCase())
      .filter((name): name is keyof typeof DEFAULTS => name in DEFAULTS);
    return [...new Set(order)]
      .map((name): LlmProvider | null => {
        const prefix = name.toUpperCase();
        const apiKey = this.config.get<string>(`${prefix}_API_KEY`);
        if (!apiKey) return null;
        const flag = this.config.get<string>(`${prefix}_JSON_SCHEMA`);
        const tokenParam = this.config.get<string>(`${prefix}_TOKEN_PARAM`);
        const budget = Number(
          this.config.get<string>(`${prefix}_MAX_TOKENS`) ||
            this.config.get<string>('LLM_MAX_TOKENS'),
        );
        const timeout = Number(
          this.config.get<string>(`${prefix}_TIMEOUT_MS`) ||
            this.config.get<string>('LLM_TIMEOUT_MS'),
        );
        return {
          name,
          apiKey,
          baseURL:
            this.config.get<string>(`${prefix}_BASE_URL`) ||
            DEFAULTS[name].baseURL,
          model:
            this.config.get<string>(`${prefix}_MODEL`) || DEFAULTS[name].model,
          jsonSchema:
            flag === undefined || flag === ''
              ? DEFAULTS[name].jsonSchema
              : flag === 'true',
          timeoutMs:
            Number.isFinite(timeout) && timeout > 0
              ? timeout
              : DEFAULTS[name].timeoutMs || DEFAULT_TIMEOUT_MS,
          tokenParam:
            tokenParam === 'max_tokens' ||
            tokenParam === 'max_completion_tokens'
              ? tokenParam
              : DEFAULTS[name].tokenParam,
          maxTokens:
            Number.isFinite(budget) && budget > 0
              ? budget
              : DEFAULTS[name].maxTokens,
        };
      })
      .filter((provider): provider is LlmProvider => provider !== null);
  }

  /** Interroge les fournisseurs dans l'ordre et rend le premier JSON
   * exploitable. Un fournisseur à court de crédit, en panne ou qui répond
   * n'importe quoi fait simplement passer au suivant ; on ne s'arrête que
   * quand la liste est épuisée. */
  async completeJson<T>(request: JsonRequest) {
    const providers = this.providers();
    if (!providers.length) {
      throw new ServiceUnavailableException(
        'Aucun fournisseur configuré : renseigner KIMI_API_KEY, OPENAI_API_KEY ou GEMINI_API_KEY',
      );
    }
    const failures: string[] = [];
    for (const provider of providers) {
      try {
        const raw = await this.transport(provider, request);
        const value = this.parse<T>(raw);
        if (failures.length) {
          this.logger.warn(
            `Repli sur ${provider.name} après ${failures.join(' ; ')}`,
          );
        }
        return { value, provider: provider.name };
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'erreur inconnue';
        this.logger.warn(`${provider.name} indisponible : ${message}`);
        failures.push(`${provider.name} (${message})`);
      }
    }
    throw new ServiceUnavailableException(
      `Aucun fournisseur n’a répondu — ${failures.join(' ; ')}`,
    );
  }

  /** Un modèle en mode JSON libre encadre parfois sa réponse d'un bloc de
   * code ou d'une phrase : isoler l'objet évite de perdre une réponse
   * correcte pour un habillage. */
  private parse<T>(raw: string): T {
    const text = raw.trim().replace(/^```(?:json)?\s*|\s*```$/g, '');
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start === -1 || end <= start)
      throw new Error('réponse sans objet JSON');
    return JSON.parse(text.slice(start, end + 1)) as T;
  }
}
