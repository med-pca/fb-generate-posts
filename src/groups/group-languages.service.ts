import { BadRequestException, Injectable, Optional } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { CurrentUser } from '../auth/current-user';
import { groupManageWhere, groupWhere, scopeOf } from '../auth/scope';
import { LlmService } from '../llm/llm.service';
import { LANGUAGES } from '../ingest/image-translator.service';

const CODES = Object.keys(LANGUAGES);
/** Une écriture qui suffit à dire la langue, sans IA. */
const SCRIPTS: Array<[RegExp, string]> = [
  [/[؀-ۿ]/, 'ar'],
  [/[Ѐ-ӿ]/, 'ru'],
  [/[ऀ-ॿ]/, 'hi'],
];

/** La langue des groupes : c'est elle qui décide où partent les visuels
 * (posts « engagement »). Résumé, réglage en masse, et propositions d'après
 * le nom des groupes — jamais appliquées sans validation. */
@Injectable()
export class GroupLanguagesService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly llm?: LlmService,
  ) {}

  /** Combien de groupes par langue (et sans langue), parmi ceux qu'on voit. */
  async summary(acting: CurrentUser | null) {
    const rows = await this.prisma.group.groupBy({
      by: ['language'],
      where: { status: 'ACTIVE', ...groupWhere(scopeOf(acting)) },
      _count: { _all: true },
    });
    return {
      languages: LANGUAGES,
      counts: rows
        .map((r) => ({ code: r.language, groups: r._count._all }))
        .sort((a, b) => (a.code === null ? 1 : b.code === null ? -1 : b.groups - a.groups)),
    };
  }

  /** Une langue pour des groupes choisis, ou pour toute une catégorie
   * (éventuellement seulement ceux qui n'en ont pas encore). */
  async setMany(
    dto: { groupIds?: string[]; categoryId?: string; onlyMissing?: boolean; language: string | null },
    acting: CurrentUser | null,
  ) {
    if (dto.language !== null && !CODES.includes(dto.language)) throw new BadRequestException('Langue inconnue');
    if (!dto.groupIds?.length && !dto.categoryId) throw new BadRequestException('Choisissez des groupes ou une catégorie');
    const where: Prisma.GroupWhereInput = {
      ...groupManageWhere(scopeOf(acting)),
      ...(dto.groupIds?.length ? { id: { in: dto.groupIds } } : { categoryId: dto.categoryId }),
      ...(dto.onlyMissing ? { language: null } : {}),
    };
    const { count } = await this.prisma.group.updateMany({ where, data: { language: dto.language } });
    await this.prisma.activityLog.create({
      data: {
        eventType: 'GROUP_LANGUAGE',
        message: `Langue « ${dto.language ? LANGUAGES[dto.language] : 'aucune'} » appliquée à ${count} groupe(s)`,
        metadata: { ...dto, updated: count, by: acting?.username ?? null } as Prisma.InputJsonValue,
      },
    });
    return { updated: count };
  }

  /** Des propositions pour les groupes sans langue : l'écriture du nom quand
   * elle suffit (arabe, cyrillique…), sinon l'IA (DeepSeek d'abord). Rien
   * n'est enregistré : l'admin valide. */
  async suggest(acting: CurrentUser | null, categoryId?: string) {
    const groups = await this.prisma.group.findMany({
      where: { status: 'ACTIVE', language: null, ...(categoryId ? { categoryId } : {}), ...groupManageWhere(scopeOf(acting)) },
      select: { id: true, name: true },
      take: 150,
    });
    const out: Array<{ id: string; name: string; language: string | null; by: string }> = [];
    const unknown: Array<{ id: string; name: string }> = [];
    for (const g of groups) {
      const hit = SCRIPTS.find(([re]) => re.test(g.name));
      if (hit) out.push({ ...g, language: hit[1], by: 'écriture du nom' });
      else unknown.push(g);
    }
    if (unknown.length && this.llm) {
      try {
        const { value, provider } = await this.llm.completeJson<{ groups: Array<{ id: string; language: string }> }>({
          instructions:
            'You guess the main language of the members of Facebook groups from their names. ' +
            `Answer with one ISO 639-1 code among: ${CODES.join(', ')}; or "unknown" when the name does not tell. ` +
            'Use the language the name is written in (an English name about a French dish is English). ' +
            'Answer with a single JSON object: {"groups": [{"id": string, "language": string}]}.',
          input: unknown.map((g) => `${g.id}\t${g.name}`).join('\n'),
          schemaName: 'group_languages',
          schema: {
            type: 'object',
            additionalProperties: false,
            properties: {
              groups: {
                type: 'array',
                items: { type: 'object', additionalProperties: false, properties: { id: { type: 'string' }, language: { type: 'string' } }, required: ['id', 'language'] },
              },
            },
            required: ['groups'],
          },
          maxTokens: 3000,
          prefer: ['deepseek'],
        });
        const guessed = new Map((value.groups || []).map((g) => [g.id, String(g.language || '').toLowerCase()]));
        for (const g of unknown) {
          const code = guessed.get(g.id);
          out.push({ ...g, language: code && CODES.includes(code) ? code : null, by: code && CODES.includes(code) ? `IA (${provider})` : 'indécis' });
        }
      } catch {
        for (const g of unknown) out.push({ ...g, language: null, by: 'IA indisponible' });
      }
    } else {
      for (const g of unknown) out.push({ ...g, language: null, by: 'indécis' });
    }
    return { suggestions: out, languages: LANGUAGES };
  }
}
