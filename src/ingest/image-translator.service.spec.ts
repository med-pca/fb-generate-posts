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

describe('IA d’image réglée depuis la plateforme', () => {
  const store = () => {
    const rows = new Map<string, any>();
    return {
      rows,
      aiProviderSetting: {
        findMany: async () => [...rows.values()],
        upsert: async ({ where, create, update }: any) => {
          const row = rows.get(where.provider);
          rows.set(where.provider, row ? { ...row, ...update, updatedAt: new Date() } : { apiKey: null, model: null, baseUrl: null, ...create, updatedAt: new Date() });
        },
      },
    };
  };

  it('la clé saisie passe avant celle du serveur, et n’est jamais renvoyée', async () => {
    const prisma = store();
    const s = new ImageTranslatorService({ get: (k: string) => ({ DASHSCOPE_API_KEY: 'server-key-1234' } as any)[k] } as never, prisma as never);
    const out = await s.configure('qwen', { apiKey: 'sk-ws-platform-key-WXYZ', model: 'qwen-image-edit-plus' }, 'admin');
    expect(out).toMatchObject({ configured: true, keySource: 'plateforme', keyHint: '…WXYZ', model: 'qwen-image-edit-plus' });
    expect(JSON.stringify(s.providers())).not.toContain('sk-ws-platform');

    const calls: any[] = [];
    global.fetch = jest.fn(async (url: string, init?: any) => {
      calls.push({ url, auth: init?.headers?.authorization, body: init?.body ? JSON.parse(init.body) : null });
      if (url.includes('aliyuncs')) return new Response(JSON.stringify({ output: { choices: [{ message: { content: [{ image: 'https://oss.test/o.png' }] } }] } }), { status: 200 });
      return new Response(Buffer.from('x'), { status: 200, headers: { 'content-type': 'image/png' } });
    }) as never;
    await s.translate(IMG, 'fr', [], 'qwen');
    expect(calls[0].auth).toBe('Bearer sk-ws-platform-key-WXYZ');
    expect(calls[0].body.model).toBe('qwen-image-edit-plus');
  });

  it('région réglable ; effacer la clé revient à celle du serveur', async () => {
    const prisma = store();
    const s = new ImageTranslatorService({ get: (k: string) => ({ DASHSCOPE_API_KEY: 'server-key-1234' } as any)[k] } as never, prisma as never);
    await s.configure('qwen', { apiKey: 'sk-ws-platform-key-WXYZ', baseUrl: 'https://dashscope.aliyuncs.com/' }, 'admin');
    expect(s.providers().find((p) => p.name === 'qwen')!.baseUrl).toBe('https://dashscope.aliyuncs.com');
    const back = await s.configure('qwen', { clearKey: true }, 'admin');
    expect(back).toMatchObject({ keySource: 'serveur', keyHint: '…1234' });
  });

  it('refuse une adresse non https, une clé douteuse, un fournisseur inconnu', async () => {
    const s = new ImageTranslatorService({ get: () => undefined } as never, store() as never);
    await expect(s.configure('qwen', { baseUrl: 'http://evil.test' }, null)).rejects.toThrow(/https/);
    await expect(s.configure('qwen', { apiKey: 'a b' }, null)).rejects.toThrow(/Clé invalide/);
    await expect(s.configure('midjourney', {}, null)).rejects.toThrow(/inconnue/);
  });
});
