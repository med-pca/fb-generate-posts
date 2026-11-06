"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.GroupLanguagesService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
const scope_1 = require("../auth/scope");
const llm_service_1 = require("../llm/llm.service");
const languages_registry_1 = require("../languages/languages.registry");
const SCRIPTS = [
    [/[؀-ۿ]/, 'ar'],
    [/[Ѐ-ӿ]/, 'ru'],
    [/[ऀ-ॿ]/, 'hi'],
];
let GroupLanguagesService = class GroupLanguagesService {
    prisma;
    llm;
    constructor(prisma, llm) {
        this.prisma = prisma;
        this.llm = llm;
    }
    async summary(acting) {
        const rows = await this.prisma.group.groupBy({
            by: ['language'],
            where: { status: 'ACTIVE', ...(0, scope_1.groupWhere)((0, scope_1.scopeOf)(acting)) },
            _count: { _all: true },
        });
        return {
            languages: { ...languages_registry_1.LANGUAGES },
            counts: rows
                .map((r) => ({ code: r.language, groups: r._count._all }))
                .sort((a, b) => (a.code === null ? 1 : b.code === null ? -1 : b.groups - a.groups)),
        };
    }
    async setMany(dto, acting) {
        if (dto.language !== null && !(0, languages_registry_1.isKnownLanguage)(dto.language))
            throw new common_1.BadRequestException('Langue inconnue');
        if (!dto.groupIds?.length && !dto.categoryId)
            throw new common_1.BadRequestException('Choisissez des groupes ou une catégorie');
        const where = {
            ...(0, scope_1.groupManageWhere)((0, scope_1.scopeOf)(acting)),
            ...(dto.groupIds?.length ? { id: { in: dto.groupIds } } : { categoryId: dto.categoryId }),
            ...(dto.onlyMissing ? { language: null } : {}),
        };
        const { count } = await this.prisma.group.updateMany({ where, data: { language: dto.language } });
        await this.prisma.activityLog.create({
            data: {
                eventType: 'GROUP_LANGUAGE',
                message: `Langue « ${dto.language ? languages_registry_1.LANGUAGES[dto.language] : 'aucune'} » appliquée à ${count} groupe(s)`,
                metadata: { ...dto, updated: count, by: acting?.username ?? null },
            },
        });
        return { updated: count };
    }
    async suggest(acting, categoryId) {
        const groups = await this.prisma.group.findMany({
            where: { status: 'ACTIVE', language: null, ...(categoryId ? { categoryId } : {}), ...(0, scope_1.groupManageWhere)((0, scope_1.scopeOf)(acting)) },
            select: { id: true, name: true },
            take: 150,
        });
        const out = [];
        const unknown = [];
        for (const g of groups) {
            const hit = SCRIPTS.find(([re]) => re.test(g.name));
            if (hit)
                out.push({ ...g, language: hit[1], by: 'écriture du nom' });
            else
                unknown.push(g);
        }
        if (unknown.length && this.llm) {
            try {
                const { value, provider } = await this.llm.completeJson({
                    instructions: 'You guess the main language of the members of Facebook groups from their names. ' +
                        `Answer with one code among: ${Object.entries(languages_registry_1.LANGUAGES).map(([c, n]) => `${c} (${n})`).join(', ')}; or "unknown" when the name does not tell. ` +
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
                    out.push({ ...g, language: (0, languages_registry_1.isKnownLanguage)(code) ? code : null, by: (0, languages_registry_1.isKnownLanguage)(code) ? `IA (${provider})` : 'indécis' });
                }
            }
            catch {
                for (const g of unknown)
                    out.push({ ...g, language: null, by: 'IA indisponible' });
            }
        }
        else {
            for (const g of unknown)
                out.push({ ...g, language: null, by: 'indécis' });
        }
        return { suggestions: out, languages: { ...languages_registry_1.LANGUAGES } };
    }
};
exports.GroupLanguagesService = GroupLanguagesService;
exports.GroupLanguagesService = GroupLanguagesService = __decorate([
    (0, common_1.Injectable)(),
    __param(1, (0, common_1.Optional)()),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        llm_service_1.LlmService])
], GroupLanguagesService);
//# sourceMappingURL=group-languages.service.js.map