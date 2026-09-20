import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ArticlesService } from '../articles/articles.service';
import { WordpressArticleDto } from './wordpress.dto';

export function wordpressCaption(dto: WordpressArticleDto) {
  const clean = (value: string) =>
    value
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]*>/g, ' ')
      .replace(/(?:https?:\/\/|www\.)\S+/gi, '')
      .replace(/\s+/g, ' ')
      .trim();
  const text =
    clean(dto.excerpt || '') || clean(dto.content) || clean(dto.title);
  const excerpt =
    text.length > 280 ? text.slice(0, 277).replace(/\s+\S*$/, '') + '…' : text;
  return `${excerpt}\n\n📖 Read more on our website 👉 Link in the comments 👇`;
}

@Injectable()
export class WordpressService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly articles: ArticlesService,
  ) {}

  async publish(dto: WordpressArticleDto) {
    const site = new URL(dto.siteUrl);
    const articleUrl = new URL(dto.articleUrl);
    if (
      site.username ||
      site.password ||
      site.search ||
      site.hash ||
      articleUrl.username ||
      articleUrl.password ||
      site.origin !== articleUrl.origin
    ) {
      throw new BadRequestException(
        'Le site et l’article doivent appartenir au même domaine, sans identifiants dans les URL',
      );
    }
    const siteUrl = site.origin + site.pathname.replace(/\/+$/, '');
    const externalId = `wordpress:${dto.postId}`;
    return this.prisma.$transaction(
      async (tx) => {
        // Lock per site, including source creation, so simultaneous deliveries are atomic.
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${siteUrl}))`;
        const source = await tx.contentSource.upsert({
          where: { originUrl: siteUrl },
          create: { originUrl: siteUrl, name: dto.siteName },
          update: {},
        });
        const existing = await tx.article.findUnique({
          where: { sourceId_externalId: { sourceId: source.id, externalId } },
        });
        if (existing)
          return { articleId: existing.id, duplicate: true, generated: 0 };
        const article = await tx.article.create({
          data: {
            sourceId: source.id,
            externalId,
            slug: externalId,
            jsonUrl: `${siteUrl}/?rest_route=/wp/v2/posts/${dto.postId}`,
            title: dto.title,
            articleUrl: dto.articleUrl,
            coverImageUrl: dto.imageUrl,
            excerpt: dto.excerpt,
            publishedAt: new Date(dto.publishedAt),
            captions: [{ text: wordpressCaption(dto), angle: 'wordpress' }],
            hashtags: [],
            rawData: { ...dto },
          },
        });
        const profiles = await tx.profile.findMany({
          where: { status: 'ACTIVE' },
          include: {
            profileGroups: {
              where: { status: 'ACTIVE', group: { status: 'ACTIVE' } },
            },
          },
        });
        for (const profile of profiles) {
          await tx.post.create({
            data: {
              ...this.articles.postDataForSlot(article, 0, {
                profileId: profile.id,
                delayMin: 10,
                delayMax: 60,
              }),
              targets: {
                create: profile.profileGroups.map(({ groupId }) => ({
                  groupId,
                })),
              },
            },
          });
        }
        return {
          articleId: article.id,
          duplicate: false,
          generated: profiles.length,
        };
      },
      { timeout: 30000 },
    );
  }
}
