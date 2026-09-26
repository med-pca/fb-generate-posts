import { ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LlmProvider, LlmService, LlmTransport } from './llm.service';

const REQUEST = {
  instructions: 'consigne',
  input: 'entrée',
  schemaName: 'test',
  schema: { type: 'object' },
  maxTokens: 100,
};

const setup = (env: Record<string, string>, transport: LlmTransport) =>
  new LlmService(
    { get: (key: string) => env[key] } as unknown as ConfigService,
    transport,
  );

const never: LlmTransport = () => {
  throw new Error('ne devrait pas être appelé');
};

describe('LlmService.providers', () => {
  it('ne retient que les fournisseurs qui ont une clé', () => {
    const names = setup({ KIMI_API_KEY: 'k', GEMINI_API_KEY: 'g' }, never)
      .providers()
      .map((provider) => provider.name);
    expect(names).toEqual(['kimi', 'gemini']);
  });

  it('respecte l’ordre demandé', () => {
    const names = setup(
      {
        LLM_PROVIDERS: 'openai, kimi',
        KIMI_API_KEY: 'k',
        OPENAI_API_KEY: 'o',
        GEMINI_API_KEY: 'g',
      },
      never,
    )
      .providers()
      .map((provider) => provider.name);
    expect(names).toEqual(['openai', 'kimi']);
  });

  it('applique les valeurs par défaut de chaque fournisseur', () => {
    const [kimi] = setup({ KIMI_API_KEY: 'k' }, never).providers();
    expect(kimi).toMatchObject({
      baseURL: 'https://api.moonshot.ai/v1',
      model: 'kimi-k2.6',
      // Non vérifié sur ce compte : mode JSON libre par défaut.
      jsonSchema: false,
      timeoutMs: 90_000,
      // Les passerelles compatibles n'ont souvent que l'ancien nom.
      tokenParam: 'max_tokens',
    });
  });

  // Les modèles OpenAI récents refusent `max_tokens` : envoyer le mauvais
  // nom fait échouer l'appel en 400, sans repli utile.
  it('demande max_completion_tokens à OpenAI', () => {
    const [openai] = setup({ OPENAI_API_KEY: 'o' }, never).providers();
    expect(openai.tokenParam).toBe('max_completion_tokens');
  });

  it('laisse forcer le nom du paramètre', () => {
    const [openai] = setup(
      { OPENAI_API_KEY: 'o', OPENAI_TOKEN_PARAM: 'max_tokens' },
      never,
    ).providers();
    expect(openai.tokenParam).toBe('max_tokens');
  });

  it('ignore un nom de paramètre inconnu', () => {
    const [openai] = setup(
      { OPENAI_API_KEY: 'o', OPENAI_TOKEN_PARAM: 'nawak' },
      never,
    ).providers();
    expect(openai.tokenParam).toBe('max_completion_tokens');
  });

  // Un fournisseur qui ne répond pas fait perdre son délai à toute la
  // chaîne : il doit pouvoir être raccourci.
  it('laisse raccourcir le délai, globalement ou par fournisseur', () => {
    const [kimi] = setup(
      { KIMI_API_KEY: 'k', LLM_TIMEOUT_MS: '30000' },
      never,
    ).providers();
    expect(kimi.timeoutMs).toBe(30_000);
    const [precis] = setup(
      { KIMI_API_KEY: 'k', LLM_TIMEOUT_MS: '30000', KIMI_TIMEOUT_MS: '5000' },
      never,
    ).providers();
    expect(precis.timeoutMs).toBe(5_000);
  });

  it('laisse surcharger modèle, passerelle et mode structuré', () => {
    const [kimi] = setup(
      {
        KIMI_API_KEY: 'k',
        KIMI_MODEL: 'kimi-k2.7-code',
        KIMI_BASE_URL: 'https://proxy.test/v1',
        KIMI_JSON_SCHEMA: 'true',
      },
      never,
    ).providers();
    expect(kimi).toMatchObject({
      model: 'kimi-k2.7-code',
      baseURL: 'https://proxy.test/v1',
      jsonSchema: true,
    });
  });

  it('ignore un nom de fournisseur inconnu', () => {
    const names = setup(
      { LLM_PROVIDERS: 'inexistant,kimi', KIMI_API_KEY: 'k' },
      never,
    )
      .providers()
      .map((provider) => provider.name);
    expect(names).toEqual(['kimi']);
  });
});

describe('LlmService.completeJson', () => {
  const env = { KIMI_API_KEY: 'k', OPENAI_API_KEY: 'o', GEMINI_API_KEY: 'g' };

  it('s’arrête au premier fournisseur qui répond', async () => {
    const transport = jest.fn(() => Promise.resolve('{"ok":1}'));
    const result = await setup(env, transport).completeJson(REQUEST);
    expect(result).toEqual({ value: { ok: 1 }, provider: 'kimi' });
    expect(transport).toHaveBeenCalledTimes(1);
  });

  // Le cas qui motive toute la chaîne : compte suspendu, panne, quota.
  it('bascule sur le suivant quand le premier tombe', async () => {
    const transport = jest
      .fn<Promise<string>, [LlmProvider]>()
      .mockRejectedValueOnce(new Error('compte suspendu'))
      .mockResolvedValueOnce('{"ok":2}');
    const result = await setup(env, transport).completeJson(REQUEST);
    expect(result).toEqual({ value: { ok: 2 }, provider: 'openai' });
  });

  // Une réponse illisible vaut une panne : le fournisseur suivant a sa chance.
  it('bascule aussi quand la réponse n’est pas du JSON', async () => {
    const transport = jest
      .fn<Promise<string>, [LlmProvider]>()
      .mockResolvedValueOnce('désolé, je ne peux pas')
      .mockResolvedValueOnce('{"ok":3}');
    const result = await setup(env, transport).completeJson(REQUEST);
    expect(result.provider).toBe('openai');
  });

  it('accepte un JSON encadré d’un bloc de code', async () => {
    const transport = jest.fn(() => Promise.resolve('```json\n{"ok":4}\n```'));
    await expect(setup(env, transport).completeJson(REQUEST)).resolves.toEqual({
      value: { ok: 4 },
      provider: 'kimi',
    });
  });

  it('rend compte de chaque échec quand tous tombent', async () => {
    const transport = jest.fn(() => Promise.reject(new Error('panne')));
    await expect(setup(env, transport).completeJson(REQUEST)).rejects.toThrow(
      /kimi \(panne\).*openai \(panne\).*gemini \(panne\)/,
    );
    expect(transport).toHaveBeenCalledTimes(3);
  });

  it('le dit franchement quand aucune clé n’est configurée', async () => {
    await expect(setup({}, never).completeJson(REQUEST)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });
});
