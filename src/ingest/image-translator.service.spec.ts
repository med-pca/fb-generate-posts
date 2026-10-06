import { ImageTranslatorService, editPrompt } from './image-translator.service';

const IMG = { data: Buffer.from('fake-png').toString('base64'), mimeType: 'image/png' };
const service = (env: Record<string, string>) => new ImageTranslatorService({ get: (k: string) => env[k] } as never);

describe('IA d’image : traduire le texte d’une image', () => {
  it('la consigne : traduire seulement le texte, garder tout le reste', () => {
    const p = editPrompt('fr', ['"Good morning" → "Bonjour"']);
    expect(p).toMatch(/into French/);
    expect(p).toMatch(/Keep exactly the same layout/);
    expect(p).toMatch(/Do not add any new text/);
    expect(p).toMatch(/"Good morning" → "Bonjour"/);
  });

  it('ne montre que ce qui est configuré, jamais les clés', () => {
    const list = service({ DASHSCOPE_API_KEY: 'secret', QWEN_IMAGE_MODEL: 'qwen-image-edit-plus' }).providers();
    expect(list.find((p) => p.name === 'qwen')).toMatchObject({ configured: true, model: 'qwen-image-edit-plus' });
    expect(list.find((p) => p.name === 'openai')!.configured).toBe(false);
    expect(JSON.stringify(list)).not.toContain('secret');
  });

  it('le choix de la plateforme passe en premier', () => {
    const s = service({ OPENAI_API_KEY: 'a', DASHSCOPE_API_KEY: 'b', ARK_API_KEY: 'c' });
    expect(s.order('seedream').map((p) => p.name)).toEqual(['seedream', 'openai', 'qwen']);
    expect(s.order('auto').map((p) => p.name)).toEqual(['openai', 'qwen', 'seedream']);
  });

  it('Qwen (DashScope) : image + consigne, puis télécharge l’image rendue', async () => {
    const calls: Array<{ url: string; body?: any }> = [];
    global.fetch = jest.fn(async (url: string, init?: any) => {
      calls.push({ url, body: init?.body ? JSON.parse(init.body) : undefined });
      if (url.includes('dashscope')) return new Response(JSON.stringify({ output: { choices: [{ message: { content: [{ image: 'https://oss.test/out.png' }] } }] } }), { status: 200 });
      return new Response(Buffer.from('translated'), { status: 200, headers: { 'content-type': 'image/png' } });
    }) as never;
    const out = await service({ DASHSCOPE_API_KEY: 'k' }).translate(IMG, 'ar', [], 'qwen');
    expect(calls[0].url).toBe('https://dashscope-intl.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation');
    expect(calls[0].body.model).toBe('qwen-image-edit');
    expect(calls[0].body.input.messages[0].content[0].image).toMatch(/^data:image\/png;base64,/);
    expect(calls[0].body.input.messages[0].content[1].text).toMatch(/into Arabic/);
    expect(Buffer.from(out.data, 'base64').toString()).toBe('translated');
    expect(out.provider).toBe('qwen:qwen-image-edit');
  });

  it('Seedream (ModelArk) : image en base64, réponse en base64', async () => {
    global.fetch = jest.fn(async () => new Response(JSON.stringify({ data: [{ b64_json: Buffer.from('seed').toString('base64') }] }), { status: 200 })) as never;
    const out = await service({ ARK_API_KEY: 'k' }).translate(IMG, 'es', [], 'seedream');
    expect((global.fetch as jest.Mock).mock.calls[0][0]).toBe('https://ark.ap-southeast.bytepluses.com/api/v3/images/generations');
    expect(JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body)).toMatchObject({ model: 'seedream-4-0-250828', response_format: 'b64_json', watermark: false });
    expect(Buffer.from(out.data, 'base64').toString()).toBe('seed');
  });

  it('un fournisseur en panne : on passe au suivant', async () => {
    global.fetch = jest.fn(async (url: string) =>
      url.includes('dashscope') ? new Response('{"message":"quota"}', { status: 429 }) : new Response(JSON.stringify({ data: [{ b64_json: 'QQ==' }] }), { status: 200 }),
    ) as never;
    const out = await service({ DASHSCOPE_API_KEY: 'k', ARK_API_KEY: 'k2' }).translate(IMG, 'fr', [], 'qwen');
    expect(out.provider).toMatch(/^seedream/);
  });

  it('aucune IA d’image configurée : erreur claire', async () => {
    await expect(service({}).translate(IMG, 'fr')).rejects.toThrow(/Aucune IA d’image configurée/);
  });
});
