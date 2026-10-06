import { BadRequestException } from '@nestjs/common';
import { GroupLanguagesService } from './group-languages.service';

const manager = { id: 'u1', username: 'gest', role: 'MANAGER' } as any;

function setup(llm?: any) {
  const prisma: any = {
    group: {
      groupBy: jest.fn().mockResolvedValue([
        { language: null, _count: { _all: 3 } },
        { language: 'fr', _count: { _all: 2 } },
        { language: 'en', _count: { _all: 7 } },
      ]),
      updateMany: jest.fn().mockResolvedValue({ count: 4 }),
      findMany: jest.fn().mockResolvedValue([
        { id: 'g1', name: 'وصفات مغربية' },
        { id: 'g2', name: 'Recettes faciles de mamie' },
        { id: 'g3', name: 'Easy Dinner Ideas' },
        { id: 'g4', name: 'XYZ 2024' },
      ]),
    },
    activityLog: { create: jest.fn().mockResolvedValue({}) },
  };
  return { prisma, service: new GroupLanguagesService(prisma, llm) };
}

describe('GroupLanguagesService', () => {
  it('counts active groups per language, the biggest first and « sans langue » last', async () => {
    const { prisma, service } = setup();
    const r = await service.summary(manager);
    expect(r.counts.map((c) => c.code)).toEqual(['en', 'fr', null]);
    const where = prisma.group.groupBy.mock.calls[0][0].where;
    expect(where.status).toBe('ACTIVE');
    expect(where.OR).toBeDefined(); // un gestionnaire ne compte que ses groupes
  });

  it('applies a language to a category, only to groups without one, within what the user manages', async () => {
    const { prisma, service } = setup();
    const r = await service.setMany({ categoryId: 'c1', onlyMissing: true, language: 'fr' }, manager);
    expect(r.updated).toBe(4);
    const { where, data } = prisma.group.updateMany.mock.calls[0][0];
    expect(where).toMatchObject({ categoryId: 'c1', language: null, ownerId: 'u1' });
    expect(data).toEqual({ language: 'fr' });
    expect(prisma.activityLog.create).toHaveBeenCalled();
  });

  it('can remove the language of chosen groups', async () => {
    const { prisma, service } = setup();
    await service.setMany({ groupIds: ['g1', 'g2'], language: null }, null);
    expect(prisma.group.updateMany.mock.calls[0][0]).toEqual({ where: { id: { in: ['g1', 'g2'] } }, data: { language: null } });
  });

  it('refuses an unknown language or an empty target', async () => {
    const { service } = setup();
    await expect(service.setMany({ groupIds: ['g1'], language: 'xx' }, null)).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.setMany({ language: 'fr' }, null)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('suggests from the script first, asks the AI for the rest, and saves nothing', async () => {
    const llm = {
      completeJson: jest.fn().mockResolvedValue({
        provider: 'deepseek',
        value: { groups: [{ id: 'g2', language: 'FR' }, { id: 'g3', language: 'en' }, { id: 'g4', language: 'unknown' }] },
      }),
    };
    const { prisma, service } = setup(llm);
    const r = await service.suggest(manager);
    const by = Object.fromEntries(r.suggestions.map((s) => [s.id, s]));
    expect(by.g1).toMatchObject({ language: 'ar', by: 'écriture du nom' });
    expect(by.g2).toMatchObject({ language: 'fr', by: 'IA (deepseek)' });
    expect(by.g3.language).toBe('en');
    expect(by.g4).toMatchObject({ language: null, by: 'indécis' });
    const asked = llm.completeJson.mock.calls[0][0];
    expect(asked.prefer).toEqual(['deepseek']);
    expect(asked.input).not.toContain('g1'); // l'arabe n'a pas besoin de l'IA
    expect(prisma.group.updateMany).not.toHaveBeenCalled();
  });

  it('still answers when the AI fails', async () => {
    const { service } = setup({ completeJson: jest.fn().mockRejectedValue(new Error('down')) });
    const r = await service.suggest(null);
    expect(r.suggestions.find((s) => s.id === 'g1')!.language).toBe('ar');
    expect(r.suggestions.find((s) => s.id === 'g2')!.by).toBe('IA indisponible');
  });
});
