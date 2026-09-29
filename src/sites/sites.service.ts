import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ContentSource, RecordStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CategoriesService } from '../categories/categories.service';
import type { CurrentUser } from '../auth/current-user';
import { CreateSiteDto, UpdateSiteDto } from './dto/site.dto';
import {
  scopeOf,
  seesEverything,
  siteManageWhere,
  siteWhere,
} from '../auth/scope';

/** L'adresse d'un site, réduite à ce qui l'identifie : ni identifiants, ni
 * paramètres, ni barre finale. La même normalisation que la réception
 * WordPress, sans quoi le même site existerait sous deux écritures. */
export function normalizeSiteUrl(value: string) {
  const url = new URL(value);
  if (url.protocol !== 'https:') {
    throw new BadRequestException('Un site doit être en HTTPS');
  }
  if (url.username || url.password || url.search || url.hash) {
    throw new BadRequestException(
      'L’adresse du site ne doit porter ni identifiants, ni paramètres',
    );
  }
  return url.origin + url.pathname.replace(/\/+$/, '');
}

/** Ce qu'on montre d'un site : jamais la clé, seulement le fait qu'il en ait
 * une. Elle ne ressort d'aucune lecture, y compris pour un administrateur. */
export function publicSite(
  site: ContentSource & {
    _count?: { articles: number };
    owner?: { username: string } | null;
    category?: { id: string; name: string } | null;
  },
) {
  return {
    id: site.id,
    name: site.name,
    originUrl: site.originUrl,
    status: site.status,
    ownerId: site.ownerId,
    owner: site.owner?.username ?? null,
    hasOwnKey: Boolean(site.depositKey),
    categoryId: site.categoryId,
    category: site.category?.name ?? null,
    // L'extension WordPress : branchée ou non, et depuis quand on le sait.
    plugin: {
      state: site.pluginState,
      version: site.pluginVersion,
      message: site.pluginMessage,
      checkedAt: site.pluginCheckedAt,
      lastDeliveryAt: site.lastDeliveryAt,
    },
    articles: site._count?.articles ?? 0,
    createdAt: site.createdAt,
  };
}

const SITE_INCLUDE = {
  _count: { select: { articles: true } },
  owner: { select: { username: true } },
  category: { select: { id: true, name: true } },
} as const;

@Injectable()
export class SitesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly categories: CategoriesService,
  ) {}

  async findAll(acting: CurrentUser | null) {
    const sites = await this.prisma.contentSource.findMany({
      where: siteWhere(scopeOf(acting)),
      include: SITE_INCLUDE,
      orderBy: [{ status: 'asc' }, { name: 'asc' }],
    });
    return sites.map(publicSite);
  }

  /** Ce que l'extension reçoit pour proposer une destination : de quoi
   * choisir, rien de plus. */
  /** Ce que l'extension d'un compte peut viser : ses sites, et rien de
   * plus. La clé globale, elle, les voit tous. */
  async targets(acting: CurrentUser | null) {
    const sites = await this.prisma.contentSource.findMany({
      where: { status: RecordStatus.ACTIVE, ...siteWhere(scopeOf(acting)) },
      select: { id: true, name: true, originUrl: true },
      orderBy: { name: 'asc' },
    });
    return {
      sites: sites.map(({ id, name, originUrl }) => ({
        id,
        name,
        siteUrl: originUrl,
      })),
    };
  }

  async findOne(id: string, acting: CurrentUser | null) {
    const site = await this.prisma.contentSource.findFirst({
      where: { id, ...siteWhere(scopeOf(acting)) },
      include: SITE_INCLUDE,
    });
    if (!site) throw new NotFoundException('Site introuvable');
    return publicSite(site);
  }

  async create(dto: CreateSiteDto, owner: CurrentUser | null) {
    const originUrl = normalizeSiteUrl(dto.originUrl);
    const existing = await this.prisma.contentSource.findUnique({
      where: { originUrl },
    });
    if (existing) {
      throw new ConflictException(
        `Ce site est déjà déclaré : ${existing.name}`,
      );
    }
    const site = await this.prisma.contentSource.create({
      data: {
        name: dto.name.trim(),
        originUrl,
        depositKey: dto.depositKey?.trim() || null,
        categoryId: (await this.categories.resolve(dto.categoryId)) ?? null,
        ownerId: owner?.id ?? null,
        status: dto.status ?? RecordStatus.ACTIVE,
      },
      include: SITE_INCLUDE,
    });
    return publicSite(site);
  }

  async update(id: string, dto: UpdateSiteDto, acting: CurrentUser | null) {
    await this.owned(id, acting);
    const category = await this.categories.resolve(dto.categoryId);
    const site = await this.prisma.contentSource.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.originUrl !== undefined
          ? { originUrl: normalizeSiteUrl(dto.originUrl) }
          : {}),
        // Une clé absente du corps laisse celle en place : l'interface ne la
        // relit jamais, donc elle ne peut pas la renvoyer.
        ...(dto.depositKey ? { depositKey: dto.depositKey.trim() } : {}),
        ...(dto.status !== undefined ? { status: dto.status } : {}),
        ...(category !== undefined ? { categoryId: category } : {}),
        // Chaîne vide : on retire le propriétaire. Absent : on n'y touche pas.
        ...(dto.ownerId !== undefined && seesEverything(scopeOf(acting))
          ? { ownerId: dto.ownerId || null }
          : {}),
      },
      // Sans cela la réponse annonce « sans propriétaire » juste après une
      // réattribution réussie : la relation n'est pas rechargée toute seule.
      include: SITE_INCLUDE,
    });
    return publicSite(site);
  }

  /** Un site qui porte des articles ne se supprime pas : la suppression
   * emporterait ses articles, et avec eux les posts qui en sont nés. Le
   * désactiver le retire des destinations sans rien détruire. */
  async remove(id: string, acting: CurrentUser | null) {
    const site = await this.owned(id, acting);
    const articles = await this.prisma.article.count({
      where: { sourceId: id },
    });
    if (articles) {
      throw new ConflictException(
        `${site.name} porte ${articles} article(s) : le désactiver plutôt que le supprimer`,
      );
    }
    await this.prisma.contentSource.delete({ where: { id } });
    return { deleted: true };
  }

  /** Un site qu'on n'a pas le droit de voir est introuvable, pas interdit :
   * répondre 403 confirmerait son existence. */
  private async load(id: string, acting: CurrentUser | null) {
    const site = await this.prisma.contentSource.findFirst({
      where: { id, ...siteWhere(scopeOf(acting)) },
    });
    if (!site) throw new NotFoundException('Site introuvable');
    return site;
  }

  /** Modifier suppose posséder : un site partagé sert à y déposer, pas à
   * le renommer ni à changer sa clé. */
  private async owned(id: string, acting: CurrentUser | null) {
    const site = await this.prisma.contentSource.findFirst({
      where: { id, ...siteManageWhere(scopeOf(acting)) },
    });
    if (site) return site;
    const shared = await this.prisma.contentSource.findFirst({
      where: { id, ...siteWhere(scopeOf(acting)) },
      select: { id: true },
    });
    throw shared
      ? new ForbiddenException(
          'Ce site vous est partagé pour y déposer : seul son propriétaire le modifie',
        )
      : new NotFoundException('Site introuvable');
  }
}
