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
exports.CategoriesService = void 0;
exports.categoryName = categoryName;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
function categoryName(raw) {
    const name = raw.trim().replace(/\s+/g, ' ');
    if (!name)
        throw new common_1.BadRequestException('Le nom de la catégorie est vide');
    return name;
}
let CategoriesService = class CategoriesService {
    prisma;
    constructor(prisma) {
        this.prisma = prisma;
    }
    async findAll() {
        const categories = await this.prisma.category.findMany({
            include: { _count: { select: { groups: true, sites: true } } },
            orderBy: { name: 'asc' },
        });
        return categories.map(({ _count, ...category }) => ({
            ...category,
            groups: _count.groups,
            sites: _count.sites,
        }));
    }
    async create(raw) {
        const name = categoryName(raw);
        await this.assertFree(name);
        return this.prisma.category.create({ data: { name } });
    }
    async rename(id, raw) {
        await this.load(id);
        const name = categoryName(raw);
        await this.assertFree(name, id);
        return this.prisma.category.update({ where: { id }, data: { name } });
    }
    async remove(id) {
        await this.load(id);
        const [groups, sites] = await Promise.all([
            this.prisma.group.count({ where: { categoryId: id } }),
            this.prisma.contentSource.count({ where: { categoryId: id } }),
        ]);
        await this.prisma.category.delete({ where: { id } });
        return { deleted: true, released: { groups, sites } };
    }
    async resolve(categoryId) {
        if (categoryId === undefined)
            return undefined;
        if (categoryId === '')
            return null;
        await this.load(categoryId);
        return categoryId;
    }
    async load(id) {
        const category = await this.prisma.category.findUnique({ where: { id } });
        if (!category)
            throw new common_1.NotFoundException('Catégorie introuvable');
        return category;
    }
    async assertFree(name, exceptId) {
        const taken = await this.prisma.category.findFirst({
            where: {
                name: { equals: name, mode: 'insensitive' },
                ...(exceptId ? { id: { not: exceptId } } : {}),
            },
        });
        if (taken) {
            throw new common_1.ConflictException(`La catégorie « ${taken.name} » existe déjà`);
        }
    }
};
exports.CategoriesService = CategoriesService;
exports.CategoriesService = CategoriesService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], CategoriesService);
//# sourceMappingURL=categories.service.js.map