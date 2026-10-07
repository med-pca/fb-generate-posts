import { BadRequestException, ConflictException, Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { CurrentUser } from '../auth/current-user';
import { LANGUAGES, loadLanguages } from './languages.registry';

export const CODE_RE = /^[a-z]{2,3}(-[a-z0-9]{2,4})?$/;
/** Un nom en anglais, en lettres latines : « Swedish », « Brazilian Portuguese ». */
export const NAME_RE = /^[A-Za-z][A-Za-z '()-]{1,39}$/;

@Injectable()
export class LanguagesService implements OnModuleInit {
  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    try {
      await this.refresh();
    } catch {
      // Base pas encore migrée : on garde la liste par défaut.
    }
  }

  private async refresh() {
    loadLanguages(await this.prisma.language.findMany({ orderBy: { name: 'asc' } }));
  }

  /** Les langues, avec combien de groupes et de visuels les utilisent. */
  async list() {
    const [rows, groups, visuals] = await Promise.all([
      this.prisma.language.findMany({ orderBy: { name: 'asc' } }),
      this.prisma.group.groupBy({ by: ['language'], _count: { _all: true } }),
      this.prisma.visual.groupBy({ by: ['language'], _count: { _all: true } }),
    ]);
    const count = (list: Array<{ language: string | null; _count: { _all: number } }>, code: string) =>
      list.find((r) => r.language === code)?._count._all ?? 0;
    return rows.map((r) => ({ code: r.code, name: r.name, groups: count(groups, r.code), visuals: count(visuals, r.code) }));
  }

  private clean(dto: { code?: string; name?: string }) {
    const code = dto.code?.trim().toLowerCase();
    const name = dto.name?.trim().replace(/\s+/g, ' ');
    if (code !== undefined && !CODE_RE.test(code)) throw new BadRequestException('Code ISO attendu : 2 ou 3 lettres minuscules (sv, pt-br…)');
    if (name !== undefined && !NAME_RE.test(name)) throw new BadRequestException('Nom en anglais, en lettres latines : « Swedish », pas « Suédois » ni « svenska »');
    return { code, name: name ? name[0].toUpperCase() + name.slice(1) : name };
  }

  private async log(message: string, metadata: Record<string, unknown>, acting: CurrentUser | null) {
    await this.prisma.activityLog.create({
      data: { eventType: 'LANGUAGE', message, metadata: { ...metadata, by: acting?.username ?? null } as Prisma.InputJsonValue },
    });
  }

  private async unique(fn: () => Promise<unknown>) {
    try {
      return await fn();
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') throw new ConflictException('Ce code ou ce nom existe déjà');
      throw e;
    }
  }

  async create(dto: { code: string; name: string }, acting: CurrentUser | null) {
    const { code, name } = this.clean(dto);
    await this.unique(() => this.prisma.language.create({ data: { code: code!, name: name! } }));
    await this.refresh();
    await this.log(`Langue ajoutée : ${name} (${code})`, { code, name }, acting);
    return { code, name };
  }

  /** Renommer, ou changer le code : les groupes, visuels et captures qui
   * portaient l'ancien code suivent, dans la même transaction. */
  async update(code: string, dto: { code?: string; name?: string }, acting: CurrentUser | null) {
    const current = await this.prisma.language.findUnique({ where: { code } });
    if (!current) throw new NotFoundException('Langue introuvable');
    const next = this.clean(dto);
    const newCode = next.code ?? code;
    await this.unique(() =>
      this.prisma.$transaction(async (tx) => {
        await tx.language.update({ where: { code }, data: { code: newCode, name: next.name ?? current.name } });
        if (newCode !== code) {
          await tx.group.updateMany({ where: { language: code }, data: { language: newCode } });
          await tx.visual.updateMany({ where: { language: code }, data: { language: newCode } });
          await tx.sourceIngest.updateMany({ where: { targetLanguage: code }, data: { targetLanguage: newCode } });
        }
      }),
    );
    await this.refresh();
    await this.log(`Langue modifiée : ${current.name} (${code}) → ${next.name ?? current.name} (${newCode})`, { from: code, to: newCode }, acting);
    return { code: newCode, name: next.name ?? current.name };
  }

  /** Supprimer une langue encore portée par des groupes ou des visuels les
   * laisserait « sans langue » sans qu'on le voie : on refuse, sauf demande
   * explicite (`detach`), qui la leur retire. */
  async remove(code: string, detach: boolean, acting: CurrentUser | null) {
    const current = await this.prisma.language.findUnique({ where: { code } });
    if (!current) throw new NotFoundException('Langue introuvable');
    const [groups, visuals] = await Promise.all([
      this.prisma.group.count({ where: { language: code } }),
      this.prisma.visual.count({ where: { language: code } }),
    ]);
    if ((groups || visuals) && !detach)
      throw new ConflictException(`${current.name} est utilisée par ${groups} groupe(s) et ${visuals} visuel(s)`);
    await this.prisma.$transaction([
      this.prisma.group.updateMany({ where: { language: code }, data: { language: null } }),
      this.prisma.visual.updateMany({ where: { language: code }, data: { language: null } }),
      this.prisma.language.delete({ where: { code } }),
    ]);
    await this.refresh();
    await this.log(`Langue supprimée : ${current.name} (${code})`, { code, groups, visuals }, acting);
    return { deleted: code, groups, visuals };
  }

  names() {
    return { ...LANGUAGES };
  }
}
