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
Object.defineProperty(exports, "__esModule", { value: true });
exports.LanguagesService = exports.NAME_RE = exports.CODE_RE = void 0;
const common_1 = require("@nestjs/common");
const client_1 = require("@prisma/client");
const prisma_service_1 = require("../prisma/prisma.service");
const languages_registry_1 = require("./languages.registry");
exports.CODE_RE = /^[a-z]{2,3}(-[a-z0-9]{2,4})?$/;
exports.NAME_RE = /^[A-Za-z][A-Za-z '()-]{1,39}$/;
let LanguagesService = class LanguagesService {
    prisma;
    constructor(prisma) {
        this.prisma = prisma;
    }
    async onModuleInit() {
        try {
            await this.refresh();
        }
        catch {
        }
    }
    async refresh() {
        (0, languages_registry_1.loadLanguages)(await this.prisma.language.findMany({ orderBy: { name: 'asc' } }));
    }
    async list() {
        const [rows, groups, visuals] = await Promise.all([
            this.prisma.language.findMany({ orderBy: { name: 'asc' } }),
            this.prisma.group.groupBy({ by: ['language'], _count: { _all: true } }),
            this.prisma.visual.groupBy({ by: ['language'], _count: { _all: true } }),
        ]);
        const count = (list, code) => list.find((r) => r.language === code)?._count._all ?? 0;
        return rows.map((r) => ({ code: r.code, name: r.name, groups: count(groups, r.code), visuals: count(visuals, r.code) }));
    }
    clean(dto) {
        const code = dto.code?.trim().toLowerCase();
        const name = dto.name?.trim().replace(/\s+/g, ' ');
        if (code !== undefined && !exports.CODE_RE.test(code))
            throw new common_1.BadRequestException('Code ISO attendu : 2 ou 3 lettres minuscules (sv, pt-br…)');
        if (name !== undefined && !exports.NAME_RE.test(name))
            throw new common_1.BadRequestException('Nom en anglais, en lettres latines : « Swedish », pas « Suédois » ni « svenska »');
        return { code, name: name ? name[0].toUpperCase() + name.slice(1) : name };
    }
    async log(message, metadata, acting) {
        await this.prisma.activityLog.create({
            data: { eventType: 'LANGUAGE', message, metadata: { ...metadata, by: acting?.username ?? null } },
        });
    }
    async unique(fn) {
        try {
            return await fn();
        }
        catch (e) {
            if (e instanceof client_1.Prisma.PrismaClientKnownRequestError && e.code === 'P2002')
                throw new common_1.ConflictException('Ce code ou ce nom existe déjà');
            throw e;
        }
    }
    async create(dto, acting) {
        const { code, name } = this.clean(dto);
        await this.unique(() => this.prisma.language.create({ data: { code: code, name: name } }));
        await this.refresh();
        await this.log(`Langue ajoutée : ${name} (${code})`, { code, name }, acting);
        return { code, name };
    }
    async update(code, dto, acting) {
        const current = await this.prisma.language.findUnique({ where: { code } });
        if (!current)
            throw new common_1.NotFoundException('Langue introuvable');
        const next = this.clean(dto);
        const newCode = next.code ?? code;
        await this.unique(() => this.prisma.$transaction(async (tx) => {
            await tx.language.update({ where: { code }, data: { code: newCode, name: next.name ?? current.name } });
            if (newCode !== code) {
                await tx.group.updateMany({ where: { language: code }, data: { language: newCode } });
                await tx.visual.updateMany({ where: { language: code }, data: { language: newCode } });
                await tx.sourceIngest.updateMany({ where: { targetLanguage: code }, data: { targetLanguage: newCode } });
            }
        }));
        await this.refresh();
        await this.log(`Langue modifiée : ${current.name} (${code}) → ${next.name ?? current.name} (${newCode})`, { from: code, to: newCode }, acting);
        return { code: newCode, name: next.name ?? current.name };
    }
    async remove(code, detach, acting) {
        const current = await this.prisma.language.findUnique({ where: { code } });
        if (!current)
            throw new common_1.NotFoundException('Langue introuvable');
        const [groups, visuals] = await Promise.all([
            this.prisma.group.count({ where: { language: code } }),
            this.prisma.visual.count({ where: { language: code } }),
        ]);
        if ((groups || visuals) && !detach)
            throw new common_1.ConflictException(`${current.name} est utilisée par ${groups} groupe(s) et ${visuals} visuel(s)`);
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
        return { ...languages_registry_1.LANGUAGES };
    }
};
exports.LanguagesService = LanguagesService;
exports.LanguagesService = LanguagesService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], LanguagesService);
//# sourceMappingURL=languages.service.js.map