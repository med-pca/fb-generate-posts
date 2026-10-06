import { VisualsService } from './visuals.service';

const IMG = { data: Buffer.from('jpeg').toString('base64'), mimeType: 'image/jpeg' };

function setup(read: any, groups: Array<{ id: string }> = [{ id: 'g-fr-1' }, { id: 'g-fr-2' }]) {
  const prisma: any = {
    group: { findMany: jest.fn(async () => groups) },
    automationSetting: { findUnique: jest.fn(async () => ({ imageProvider: 'qwen' })) },
    generatedImage: { create: jest.fn(async (a: any) => a) },
    visual: { create: jest.fn(async ({ data }: any) => ({ id: 'v1', ...data })) },
    post: { create: jest.fn(async () => ({ id: 'post-1' })) },
    activityLog: { create: jest.fn(async (a: any) => a) },
  };
  const rewriter = {
    readImageText: jest.fn(async () => read),
    engagementCaption: jest.fn(async () => ({ title: 'Bonjour', caption: 'Et vous, votre café du matin ?', hashtags: ['matin'], provider: 'deepseek' })),
  };
  const images = { translate: jest.fn(async () => ({ data: 'VFJBRA==', mimeType: 'image/png', provider: 'qwen:qwen-image-edit' })) };
  const service = new VisualsService(prisma, { get: () => 'https://post.test' } as never, rewriter as never, images as never);
  return { service, prisma, rewriter, images };
}

describe('Visuels : une image seule, publiée sans lien ni commentaire', () => {
  it('image capturée/importée avec texte : traduite, description par l’IA, un post SANS lien ni commentaire vers les groupes de la langue', async () => {
    const t = setup({ hasText: true, texts: [{ original: 'Good morning', translated: 'Bonjour' }], scene: 'A cup of coffee' });
    const r = await t.service.create({ image: IMG, language: 'fr', translate: true, categoryId: 'c1', createPosts: true, origin: 'upload' });
    expect(t.prisma.group.findMany.mock.calls[0][0].where).toMatchObject({ status: 'ACTIVE', language: 'fr', categoryId: 'c1' });
    expect(t.images.translate).toHaveBeenCalledWith(IMG, 'fr', ['"Good morning" → "Bonjour"'], 'qwen');
    const post = t.prisma.post.create.mock.calls[0][0].data;
    expect(post).toMatchObject({ url: null, noComment: true, visualId: 'v1', description: 'Et vous, votre café du matin ?\n\n#matin' });
    expect(post.imageUrl).toMatch(/^https:\/\/post\.test\/media\/g\/[A-Za-z0-9_-]{20,}\.png$/);
    expect(post.targets.create).toEqual([{ groupId: 'g-fr-1' }, { groupId: 'g-fr-2' }]);
    expect(r).toMatchObject({ postId: 'post-1', groups: 2 });
  });

  it('notre image avec notre description, sans traduction : aucune IA appelée', async () => {
    const t = setup({ hasText: false, texts: [], scene: '' });
    await t.service.create({ image: IMG, language: 'en', translate: false, caption: 'Our own words', title: 'Ours', createPosts: true, origin: 'upload', groupIds: ['g1'] });
    expect(t.rewriter.readImageText).not.toHaveBeenCalled();
    expect(t.rewriter.engagementCaption).not.toHaveBeenCalled();
    expect(t.images.translate).not.toHaveBeenCalled();
    expect(t.prisma.post.create.mock.calls[0][0].data.description).toBe('Our own words');
  });

  it('image sans texte : pas d’IA d’image (rien à payer), l’image d’origine part', async () => {
    const t = setup({ hasText: false, texts: [], scene: 'A sunset' });
    await t.service.create({ image: IMG, language: 'fr', translate: true, createPosts: true, origin: 'capture' });
    expect(t.images.translate).not.toHaveBeenCalled();
    expect(t.prisma.generatedImage.create.mock.calls[0][0].data.mimeType).toBe('image/jpeg');
  });

  it('aucun groupe visé : arrêt AVANT toute dépense d’IA, avec la raison', async () => {
    const t = setup({ hasText: true, texts: [], scene: '' }, []);
    await expect(t.service.create({ image: IMG, language: 'fr', translate: true, categoryId: 'c1', createPosts: true, origin: 'upload' })).rejects.toThrow(/Aucun groupe actif en French dans cette catégorie/);
    expect(t.rewriter.readImageText).not.toHaveBeenCalled();
  });

  it('refuse un format non image', async () => {
    const t = setup({ hasText: false, texts: [], scene: '' });
    await expect(t.service.create({ image: { data: 'eA==', mimeType: 'application/pdf' }, translate: false, createPosts: false, origin: 'upload' })).rejects.toThrow(/Type d’image non accepté/);
  });
});
