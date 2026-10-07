import { BadRequestException, ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { LanguagesService } from './languages.service';
import { LANGUAGES, isKnownLanguage, loadLanguages } from './languages.registry';

const DEFAULTS = { ...LANGUAGES };

function setup(rows = [{ code: 'en', name: 'English' }, { code: 'fr', name: 'French' }]) {
  const db = rows.map((r) => ({ ...r }));
  const prisma: any = {
    language: {
      findMany: jest.fn(async () => db.map((r) => ({ ...r }))),
      findUnique: jest.fn(async ({ where }) => db.find((r) => r.code === where.code) ?? null),
      create: jest.fn(async ({ data }) => {
        if (db.some((r) => r.code === data.code || r.name === data.name))
          throw new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: 'x' });
        db.push(data);
        return data;
      }),
      update: jest.fn(async ({ where, data }) => Object.assign(db.find((r) => r.code === where.code)!, data)),
      delete: jest.fn(async ({ where }) => db.splice(db.findIndex((r) => r.code === where.code), 1)[0]),
    },
    group: {
      groupBy: jest.fn().mockResolvedValue([{ language: 'fr', _count: { _all: 3 } }]),
      count: jest.fn().mockResolvedValue(0),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    visual: {
      groupBy: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    sourceIngest: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
    activityLog: { create: jest.fn().mockResolvedValue({}) },
  };
  prisma.$transaction = jest.fn(async (arg) => (typeof arg === 'function' ? arg(prisma) : Promise.all(arg)));
  return { prisma, service: new LanguagesService(prisma) };
}

describe('LanguagesService', () => {
  afterEach(() => loadLanguages(Object.entries(DEFAULTS).map(([code, name]) => ({ code, name }))));

  it('loads the registry from the database at start-up', async () => {
    const { service } = setup();
    await service.onModuleInit();
    expect(LANGUAGES).toEqual({ en: 'English', fr: 'French' });
    expect(isKnownLanguage('ar')).toBe(false);
  });

  it('adds a language with an English name and makes it valid at once', async () => {
    const { service, prisma } = setup();
    await service.create({ code: ' SV ', name: 'swedish' }, null);
    expect(prisma.language.create).toHaveBeenCalledWith({ data: { code: 'sv', name: 'Swedish' } });
    expect(isKnownLanguage('sv')).toBe(true);
    expect(prisma.activityLog.create).toHaveBeenCalled();
  });

  it('refuses a name that is not written in English letters, a bad code, or a duplicate', async () => {
    const { service } = setup();
    await expect(service.create({ code: 'sv', name: 'svenska språk' }, null)).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.create({ code: 'ar', name: 'العربية' }, null)).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.create({ code: 'swedish', name: 'Swedish' }, null)).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.create({ code: 'fr', name: 'Francais' }, null)).rejects.toBeInstanceOf(ConflictException);
  });

  it('changing a code carries the groups, visuals and captures along', async () => {
    const { service, prisma } = setup();
    await service.update('fr', { code: 'fr-ca', name: 'Canadian French' }, null);
    expect(prisma.group.updateMany).toHaveBeenCalledWith({ where: { language: 'fr' }, data: { language: 'fr-ca' } });
    expect(prisma.visual.updateMany).toHaveBeenCalledWith({ where: { language: 'fr' }, data: { language: 'fr-ca' } });
    expect(prisma.sourceIngest.updateMany).toHaveBeenCalledWith({ where: { targetLanguage: 'fr' }, data: { targetLanguage: 'fr-ca' } });
    expect(LANGUAGES['fr-ca']).toBe('Canadian French');
    expect(isKnownLanguage('fr')).toBe(false);
  });

  it('refuses to delete a language in use unless asked to detach it', async () => {
    const { service, prisma } = setup();
    prisma.group.count.mockResolvedValue(3);
    await expect(service.remove('fr', false, null)).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.language.delete).not.toHaveBeenCalled();
    const r = await service.remove('fr', true, null);
    expect(r.groups).toBe(3);
    expect(prisma.group.updateMany).toHaveBeenCalledWith({ where: { language: 'fr' }, data: { language: null } });
    expect(isKnownLanguage('fr')).toBe(false);
  });

  it('lists languages with how many groups use them', async () => {
    const { service } = setup();
    expect(await service.list()).toEqual([
      { code: 'en', name: 'English', groups: 0, visuals: 0 },
      { code: 'fr', name: 'French', groups: 3, visuals: 0 },
    ]);
  });
});
