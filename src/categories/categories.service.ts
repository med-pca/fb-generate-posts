import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/** « Recettes », « recettes » et « Recettes  » sont une seule catégorie :
 * c'est tout l'intérêt d'une liste gérée. */
export function categoryName(raw: string) {
  const name = raw.trim().replace(/\s+/g, ' ');
  if (!name) throw new BadRequestException('Le nom de la catégorie est vide');
  return name;
}

@Injectable()
export class CategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  /** La liste est commune à tous les comptes : deux comptes qui parlent de
   * « Recettes » parlent du même thème. Les compteurs sont globaux. */
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

  async create(raw: string) {
    const name = categoryName(raw);
    await this.assertFree(name);
    return this.prisma.category.create({ data: { name } });
  }

  async rename(id: string, raw: string) {
    await this.load(id);
    const name = categoryName(raw);
    await this.assertFree(name, id);
    return this.prisma.category.update({ where: { id }, data: { name } });
  }

  /** Les groupes et sites de la catégorie la perdent (`SET NULL`) : rien
   * d'autre n'est touché, mais leurs articles ne trouveront plus de groupe. */
  async remove(id: string) {
    await this.load(id);
    const [groups, sites] = await Promise.all([
      this.prisma.group.count({ where: { categoryId: id } }),
      this.prisma.contentSource.count({ where: { categoryId: id } }),
    ]);
    await this.prisma.category.delete({ where: { id } });
    return { deleted: true, released: { groups, sites } };
  }

  /** L'identifiant d'une catégorie qui existe, `null` pour « aucune », et
   * `undefined` quand le champ n'a pas été envoyé (on n'y touche pas). */
  async resolve(categoryId: string | undefined) {
    if (categoryId === undefined) return undefined;
    if (categoryId === '') return null;
    await this.load(categoryId);
    return categoryId;
  }

  private async load(id: string) {
    const category = await this.prisma.category.findUnique({ where: { id } });
    if (!category) throw new NotFoundException('Catégorie introuvable');
    return category;
  }

  private async assertFree(name: string, exceptId?: string) {
    const taken = await this.prisma.category.findFirst({
      where: {
        name: { equals: name, mode: 'insensitive' },
        ...(exceptId ? { id: { not: exceptId } } : {}),
      },
    });
    if (taken) {
      throw new ConflictException(`La catégorie « ${taken.name} » existe déjà`);
    }
  }
}
