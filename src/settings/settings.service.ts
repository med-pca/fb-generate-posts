import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ArticlesService } from '../articles/articles.service';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateSettingsDto } from './dto/update-settings.dto';

const DELAY_MIN = 10;
const DELAY_MAX = 60;
/** Plafond par exécution : un seuil mal réglé ne doit pas inonder la base. */
const MAX_POSTS_PER_RUN = 200;

type GroupStock = {
  groupId: string;
  name: string;
  available: number;
  missing: number;
};

type ArticleCandidate = {
  id: string;
  title: string;
  articleUrl: string;
  coverImageUrl: string | null;
  hashtags: string[];
  captions: Prisma.JsonValue;
};

@Injectable()
export class SettingsService {
  private readonly logger = new Logger(SettingsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly articles: ArticlesService,
  ) {}

  get() {
    return this.prisma.automationSetting.upsert({
      where: { id: 'global' },
      create: { id: 'global' },
      update: {},
    });
  }

  update(dto: UpdateSettingsDto) {
    return this.prisma.automationSetting.upsert({
      where: { id: 'global' },
      create: { id: 'global', ...dto },
      update: dto,
    });
  }

  async replenishAll() {
    const profiles = await this.prisma.profile.findMany({
      where: { status: 'ACTIVE' },
      select: { id: true },
    });
    const results = [];
    for (const { id } of profiles)
      results.push(await this.replenishProfile(id));
    return results;
  }

  /** Le stock se compte groupe par groupe : un groupe qui ne descend qu'à
   * trois posts doit être réalimenté même si le profil, tous groupes
   * confondus, paraît fourni. */
  async replenishProfile(profileId: string) {
    const settings = await this.get();
    if (!settings.autoReplenishEnabled) {
      return this.empty(profileId, 'automation_disabled');
    }
    const profile = await this.prisma.profile.findFirst({
      where: { id: profileId, status: 'ACTIVE' },
      select: {
        id: true,
        minimumAvailable: true,
        minimumAvailablePerGroup: true,
      },
    });
    if (!profile) return this.empty(profileId, 'inactive_profile');

    // Un seuil porté par le profil l'emporte ; NULL suit le réglage global.
    const perGroup =
      profile.minimumAvailablePerGroup ?? settings.minimumAvailablePerGroup;
    const perProfile =
      profile.minimumAvailable ?? settings.minimumAvailablePerProfile;

    const groups = await this.prisma.group.findMany({
      where: {
        status: 'ACTIVE',
        profiles: { some: { profileId, status: 'ACTIVE' } },
      },
      select: { id: true, name: true },
      orderBy: { createdAt: 'asc' },
    });
    if (!groups.length) return this.empty(profileId, 'no_active_group');

    const stocks = await this.groupStocks(profileId, groups, perGroup);
    const reused = await this.reuseExistingPosts(profileId, stocks);

    const profileAvailable = await this.countAvailablePosts(profileId);
    const profileMissing = Math.max(0, perProfile - profileAvailable);
    const missing = Math.max(
      profileMissing,
      ...stocks.map((stock) => stock.missing),
    );
    const thresholds = { perProfile, perGroup };
    const toCreate = Math.min(MAX_POSTS_PER_RUN, missing);
    if (toCreate === 0) {
      return this.report(
        profileId,
        profileAvailable,
        0,
        reused,
        stocks,
        undefined,
        thresholds,
      );
    }

    const { generated, skipped } = await this.generatePosts(
      profileId,
      stocks,
      groups.map(({ id }) => id),
      toCreate,
    );
    if (generated || reused) {
      await this.logReplenishment(profileId, generated, reused, stocks);
    }
    return this.report(
      profileId,
      profileAvailable + generated,
      generated,
      reused,
      stocks,
      skipped,
      thresholds,
    );
  }

  /** Cibles encore disponibles de chaque groupe pour ce profil. */
  private async groupStocks(
    profileId: string,
    groups: Array<{ id: string; name: string }>,
    minimum: number,
  ): Promise<GroupStock[]> {
    const counts = await this.prisma.postTarget.groupBy({
      by: ['groupId'],
      where: {
        groupId: { in: groups.map(({ id }) => id) },
        status: 'AVAILABLE',
        post: this.availablePostWhere(profileId),
      },
      _count: { _all: true },
    });
    const byGroup = new Map(
      counts.map((count) => [count.groupId, count._count._all]),
    );
    return groups.map(({ id, name }) => {
      const available = byGroup.get(id) ?? 0;
      return {
        groupId: id,
        name,
        available,
        missing: Math.max(0, minimum - available),
      };
    });
  }

  /** Avant d'écrire du contenu, distribuer celui qui existe déjà : un post
   * disponible qui ne vise pas encore ce groupe le remplit sans duplication. */
  private async reuseExistingPosts(profileId: string, stocks: GroupStock[]) {
    let reused = 0;
    for (const stock of stocks) {
      if (!stock.missing) continue;
      const posts = await this.prisma.post.findMany({
        where: {
          ...this.availablePostWhere(profileId),
          targets: { none: { groupId: stock.groupId } },
        },
        select: { id: true },
        orderBy: { createdAt: 'asc' },
        take: stock.missing,
      });
      if (!posts.length) continue;
      const { count } = await this.prisma.postTarget.createMany({
        data: posts.map(({ id }) => ({ postId: id, groupId: stock.groupId })),
        skipDuplicates: true,
      });
      this.fill(stock, count);
      reused += count;
    }
    return reused;
  }

  /** Crée `toCreate` posts en tournant sur les articles actifs. Quand le
   * catalogue est épuisé, les légendes déjà employées resservent sous forme de
   * variantes : mieux vaut un groupe alimenté par un article connu qu'un
   * groupe vide. */
  private async generatePosts(
    profileId: string,
    stocks: GroupStock[],
    allGroupIds: string[],
    toCreate: number,
  ) {
    const articles = (
      await this.prisma.article.findMany({
        where: { status: 'ACTIVE' },
        select: {
          id: true,
          title: true,
          articleUrl: true,
          coverImageUrl: true,
          hashtags: true,
          captions: true,
        },
        orderBy: { publishedAt: 'desc' },
      })
    ).filter((article) => this.articles.captionsOf(article).length > 0);
    if (!articles.length) return { generated: 0, skipped: 'no_article' };

    const taken = await this.takenSlots(profileId, articles);
    const ordered = [...articles].sort(
      (a, b) => (taken.get(a.id)?.size ?? 0) - (taken.get(b.id)?.size ?? 0),
    );
    const cursors = new Map<string, number>();

    let generated = 0;
    let attempts = 0;
    const maxAttempts = toCreate * 4 + ordered.length;
    while (generated < toCreate && attempts < maxAttempts) {
      for (const article of ordered) {
        if (generated >= toCreate || attempts >= maxAttempts) break;
        attempts += 1;
        const groupIds = this.groupsToFill(stocks, allGroupIds);
        const slot = this.nextFreeSlot(article, profileId, taken, cursors);
        const data = this.articles.postDataForSlot(article, slot, {
          profileId,
          delayMin: DELAY_MIN,
          delayMax: DELAY_MAX,
        });
        taken.get(article.id)?.add(data.externalId);
        try {
          await this.prisma.post.create({
            data: {
              ...data,
              targets: { create: groupIds.map((groupId) => ({ groupId })) },
            },
          });
        } catch (error) {
          // Deux automates peuvent réalimenter le même profil en même temps.
          // Le slot est alors déjà pris : on passe au suivant plutôt que de
          // faire échouer la réservation qui a déclenché l'alimentation.
          if (this.isUniqueViolation(error)) continue;
          throw error;
        }
        for (const groupId of groupIds) {
          const stock = stocks.find((item) => item.groupId === groupId);
          if (stock) this.fill(stock, 1);
        }
        generated += 1;
      }
    }
    if (generated < toCreate) {
      this.logger.warn(
        `Alimentation partielle du profil ${profileId} : ${generated}/${toCreate} post(s)`,
      );
    }
    return { generated, skipped: undefined };
  }

  /** `externalId` des posts déjà écrits, article par article : ils balisent
   * les slots occupés, y compris après une suppression en masse. */
  private async takenSlots(profileId: string, articles: ArticleCandidate[]) {
    const posts = await this.prisma.post.findMany({
      where: {
        profileId,
        sourceType: 'JSON',
        articleId: { in: articles.map(({ id }) => id) },
      },
      select: { articleId: true, externalId: true },
    });
    const taken = new Map<string, Set<string>>(
      articles.map(({ id }) => [id, new Set<string>()]),
    );
    for (const { articleId, externalId } of posts) {
      if (articleId && externalId) taken.get(articleId)?.add(externalId);
    }
    return taken;
  }

  private nextFreeSlot(
    article: ArticleCandidate,
    profileId: string,
    taken: Map<string, Set<string>>,
    cursors: Map<string, number>,
  ) {
    const captionCount = this.articles.captionsOf(article).length;
    const used = taken.get(article.id) ?? new Set<string>();
    let slot = cursors.get(article.id) ?? 0;
    while (
      used.has(
        this.articles.slotExternalId(article.id, profileId, slot, captionCount),
      )
    ) {
      slot += 1;
    }
    cursors.set(article.id, slot + 1);
    return slot;
  }

  /** Un post neuf sert tous les groupes encore en manque d'un coup. Sans
   * manque par groupe, c'est le seuil du profil qui a déclenché l'appel : le
   * post va alors à tous les groupes actifs. */
  private groupsToFill(stocks: GroupStock[], allGroupIds: string[]) {
    const starving = stocks
      .filter((stock) => stock.missing > 0)
      .map((stock) => stock.groupId);
    return starving.length ? starving : allGroupIds;
  }

  private countAvailablePosts(profileId: string) {
    return this.prisma.post.count({
      where: {
        ...this.availablePostWhere(profileId),
        targets: { some: { status: 'AVAILABLE', group: { status: 'ACTIVE' } } },
      },
    });
  }

  private availablePostWhere(profileId: string): Prisma.PostWhereInput {
    return {
      profileId,
      status: 'AVAILABLE',
      OR: [{ articleId: null }, { article: { status: 'ACTIVE' } }],
    };
  }

  private fill(stock: GroupStock, count: number) {
    stock.available += count;
    stock.missing = Math.max(0, stock.missing - count);
  }

  private isUniqueViolation(error: unknown) {
    return (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    );
  }

  private logReplenishment(
    profileId: string,
    generated: number,
    reused: number,
    stocks: GroupStock[],
  ) {
    return this.prisma.activityLog.create({
      data: {
        profileId,
        eventType: 'POSTS_REPLENISHED',
        message: `${generated} post(s) créé(s), ${reused} cible(s) réutilisée(s)`,
        metadata: {
          groups: stocks.map(({ groupId, name, available, missing }) => ({
            groupId,
            name,
            available,
            missing,
          })),
        },
      },
    });
  }

  private empty(profileId: string, skipped: string) {
    return {
      profileId,
      available: 0,
      generated: 0,
      reused: 0,
      skipped,
      thresholds: undefined as
        { perProfile: number; perGroup: number } | undefined,
      groups: [],
    };
  }

  private report(
    profileId: string,
    available: number,
    generated: number,
    reused: number,
    stocks: GroupStock[],
    skipped?: string,
    thresholds?: { perProfile: number; perGroup: number },
  ) {
    return {
      profileId,
      available,
      generated,
      reused,
      skipped,
      // Quels seuils ont réellement servi : sans ça, impossible de savoir si
      // un profil a suivi son propre réglage ou le réglage global.
      thresholds,
      groups: stocks,
      remaining: stocks.reduce((total, stock) => total + stock.missing, 0),
    };
  }
}
