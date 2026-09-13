import { Injectable } from '@nestjs/common';
import { ArticlesService } from '../articles/articles.service';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateSettingsDto } from './dto/update-settings.dto';

@Injectable()
export class SettingsService {
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
    return Promise.all(profiles.map(({ id }) => this.replenishProfile(id)));
  }

  async replenishProfile(profileId: string) {
    const settings = await this.get();
    if (!settings.autoReplenishEnabled) {
      return { profileId, generated: 0, skipped: 'automation_disabled' };
    }
    const profile = await this.prisma.profile.findFirst({
      where: { id: profileId, status: 'ACTIVE' },
    });
    if (!profile) return { profileId, generated: 0, skipped: 'inactive_profile' };

    const available = await this.prisma.post.count({
      where: {
        profileId,
        status: 'AVAILABLE',
        OR: [{ articleId: null }, { article: { status: 'ACTIVE' } }],
        targets: {
          some: { status: 'AVAILABLE', group: { status: 'ACTIVE' } },
        },
      },
    });
    if (available >= settings.minimumAvailablePerProfile) {
      return { profileId, available, generated: 0 };
    }

    const groups = await this.prisma.group.findMany({
      where: {
        status: 'ACTIVE',
        profiles: { some: { profileId, status: 'ACTIVE' } },
      },
      select: { id: true },
    });
    if (!groups.length) return { profileId, available, generated: 0, skipped: 'no_active_group' };

    const candidates = await this.prisma.article.findMany({
      where: {
        status: 'ACTIVE',
        posts: { none: { profileId } },
      },
      orderBy: { publishedAt: 'desc' },
    });
    let generated = 0;
    for (const article of candidates) {
      if (available + generated >= settings.minimumAvailablePerProfile) break;
      const posts = await this.articles.generatePosts(article.id, {
        profileId,
        groupIds: groups.map(({ id }) => id),
        delayMin: 10,
        delayMax: 60,
      });
      generated += posts.length;
    }
    return {
      profileId,
      available,
      generated,
      remaining: Math.max(0, settings.minimumAvailablePerProfile - available - generated),
    };
  }
}
