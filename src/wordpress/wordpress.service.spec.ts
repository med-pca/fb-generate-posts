import { WordpressService, wordpressCaption } from './wordpress.service';
import { ArticlesService } from '../articles/articles.service';
import { PrismaService } from '../prisma/prisma.service';
import { WordpressArticleDto } from './wordpress.dto';
import { validate } from 'class-validator';

const payload: WordpressArticleDto = {
  siteUrl: 'https://example.com/',
  siteName: 'Mon site',
  postId: '42',
  title: 'Mon article',
  content: 'Voici le contenu de mon article.',
  articleUrl: 'https://example.com/article',
  publishedAt: '2026-09-20T10:00:00Z',
  imageUrl: 'https://example.com/image.jpg',
};

/** L'article tel qu'il est en base après une première réception. */
const stored = () => ({
  id: 'existing',
  title: payload.title,
  articleUrl: payload.articleUrl,
  coverImageUrl: payload.imageUrl ?? null,
  excerpt: null,
  publishedAt: new Date(payload.publishedAt),
  captions: [{ text: wordpressCaption(payload), angle: 'wordpress' }],
  hashtags: [] as string[],
});

type PostData = ReturnType<ArticlesService['postDataForSlot']> & {
  targets: { create: { groupId: string }[] };
};
type PostContent = ReturnType<ArticlesService['postContent']>;
type ArticleData = Record<string, unknown> & { title: string };
type ClaimFilter = { none: { status: string; claimExpiresAt: { gt: Date } } };
function setup() {
  const tx = {
    $executeRaw: jest.fn(() => Promise.resolve(1)),
    contentSource: {
      upsert: jest.fn((_args: { where: { originUrl: string } }) => {
        void _args;
        return Promise.resolve({ id: 'site' });
      }),
    },
    article: {
      findUnique: jest.fn<Promise<ReturnType<typeof stored> | null>, unknown[]>(
        () => Promise.resolve(null),
      ),
      create: jest.fn(({ data }: { data: { externalId: string } }) =>
        Promise.resolve({ id: 'article', ...data }),
      ),
      update: jest.fn(
        ({ where, data }: { where: { id: string }; data: ArticleData }) =>
          Promise.resolve({ ...stored(), id: where.id, ...data }),
      ),
    },
    profile: {
      findMany: jest.fn(() =>
        Promise.resolve([
          { id: 'p1', profileGroups: [{ groupId: 'g1' }] },
          { id: 'p2', profileGroups: [] },
        ]),
      ),
    },
    post: {
      create: jest.fn((_args: { data: PostData }) =>
        Promise.resolve({ id: _args.data.externalId }),
      ),
      updateMany: jest.fn(
        (_args: { where: Record<string, any>; data: PostContent }) => {
          void _args;
          return Promise.resolve({ count: 3 });
        },
      ),
      count: jest.fn(() => Promise.resolve(5)),
    },
  };
  const prisma = {
    $transaction: jest.fn((callback: (value: typeof tx) => Promise<unknown>) =>
      callback(tx),
    ),
  };
  const service = new WordpressService(
    prisma as unknown as PrismaService,
    new ArticlesService(prisma as unknown as PrismaService),
  );
  return { service, tx };
}

describe('WordPress publication', () => {
  it('creates one compatible post per active profile and targets only active memberships/groups', async () => {
    const { service, tx } = setup();
    expect(await service.publish(payload)).toEqual({
      articleId: 'article',
      duplicate: false,
      updated: false,
      generated: 2,
      synchronized: 0,
      skipped: 0,
    });
    expect(tx.profile.findMany).toHaveBeenCalledWith({
      where: { status: 'ACTIVE' },
      include: {
        profileGroups: {
          where: { status: 'ACTIVE', group: { status: 'ACTIVE' } },
        },
      },
    });
    const data = tx.post.create.mock.calls[0][0].data;
    expect(data).toMatchObject({
      articleId: 'article',
      profileId: 'p1',
      externalId: 'article:p1:0',
      url: payload.articleUrl,
      imageUrl: payload.imageUrl,
      targets: { create: [{ groupId: 'g1' }] },
    });
    expect(data.description).toContain('Link in the comments');
    expect(data.description).not.toContain(payload.articleUrl);
    expect(tx.post.create.mock.calls[1][0].data.targets.create).toEqual([]);
    expect(tx.$executeRaw).toHaveBeenCalled();
  });

  it('ignores a delivery that repeats what is already stored', async () => {
    const { service, tx } = setup();
    tx.article.findUnique.mockResolvedValue(stored());
    expect(await service.publish(payload)).toEqual({
      articleId: 'existing',
      duplicate: true,
      updated: false,
      generated: 0,
      synchronized: 0,
      skipped: 0,
    });
    expect(tx.article.create).not.toHaveBeenCalled();
    expect(tx.article.update).not.toHaveBeenCalled();
    expect(tx.post.updateMany).not.toHaveBeenCalled();
    expect(tx.profile.findMany).not.toHaveBeenCalled();
  });

  it('synchronizes title, text and image onto the posts that can still change', async () => {
    const { service, tx } = setup();
    tx.article.findUnique.mockResolvedValue(stored());
    expect(
      await service.publish({
        ...payload,
        title: 'Titre corrigé',
        content: 'Contenu corrigé.',
        imageUrl: 'https://example.com/autre.jpg',
      }),
    ).toEqual({
      articleId: 'existing',
      duplicate: true,
      updated: true,
      generated: 0,
      synchronized: 3,
      skipped: 2,
    });
    expect(tx.article.update.mock.calls[0][0].data).toMatchObject({
      title: 'Titre corrigé',
      coverImageUrl: 'https://example.com/autre.jpg',
    });
    const { data } = tx.post.updateMany.mock.calls[0][0];
    expect(data).toMatchObject({
      title: 'Titre corrigé',
      imageUrl: 'https://example.com/autre.jpg',
      url: payload.articleUrl,
    });
    expect(data.description).toContain('Contenu corrigé');
    // Ni le profil, ni le délai, ni l'identité du post ne sont réécrits.
    for (const field of ['profileId', 'delay', 'externalId', 'sourceType']) {
      expect(data).not.toHaveProperty(field);
    }
    expect(tx.post.create).not.toHaveBeenCalled();
  });

  it('leaves claimed, fully consumed and archived posts untouched', async () => {
    const { service, tx } = setup();
    tx.article.findUnique.mockResolvedValue(stored());
    await service.publish({ ...payload, title: 'Titre corrigé' });
    const { where } = tx.post.updateMany.mock.calls[0][0];
    expect(where).toMatchObject({
      articleId: 'existing',
      status: { not: 'ARCHIVED' },
    });
    const claim = (where.targets as ClaimFilter).none;
    expect(claim.status).toBe('CLAIMED');
    expect(claim.claimExpiresAt.gt).toBeInstanceOf(Date);
    expect(where.OR).toEqual([
      { targets: { none: {} } },
      { targets: { some: { status: { in: ['AVAILABLE', 'CLAIMED'] } } } },
    ]);
  });

  it('follows a removed featured image and a corrected publication date', async () => {
    const { service, tx } = setup();
    tx.article.findUnique.mockResolvedValue(stored());
    const { imageUrl, ...withoutImage } = payload;
    void imageUrl;
    await service.publish({
      ...withoutImage,
      publishedAt: '2026-09-21T08:30:00Z',
    });
    expect(tx.article.update.mock.calls[0][0].data).toMatchObject({
      coverImageUrl: null,
      publishedAt: new Date('2026-09-21T08:30:00Z'),
    });
    expect(tx.post.updateMany.mock.calls[0][0].data.imageUrl).toBeNull();
  });

  it('keeps installations in subdirectories separate and namespaces WordPress IDs', async () => {
    const { service, tx } = setup();
    await service.publish({ ...payload, siteUrl: 'https://example.com/blog/' });
    expect(tx.contentSource.upsert.mock.calls[0][0].where.originUrl).toBe(
      'https://example.com/blog',
    );
    expect(tx.article.create.mock.calls[0][0].data.externalId).toBe(
      'wordpress:42',
    );
  });

  it('rejects cross-domain articles before any database action', async () => {
    const { service, tx } = setup();
    await expect(
      service.publish({ ...payload, articleUrl: 'https://another.com/post' }),
    ).rejects.toThrow();
    expect(tx.$executeRaw).not.toHaveBeenCalled();
  });

  it('propagates failures so the transaction can roll back and WordPress retries', async () => {
    const { service, tx } = setup();
    tx.post.create.mockRejectedValueOnce(new Error('database unavailable'));
    await expect(service.publish(payload)).rejects.toThrow(
      'database unavailable',
    );
  });

  it('still imports when there are no active profiles', async () => {
    const { service, tx } = setup();
    tx.profile.findMany.mockResolvedValue([]);
    expect(await service.publish(payload)).toMatchObject({ generated: 0 });
    expect(tx.article.create).toHaveBeenCalled();
  });

  it('uses a short plain-text teaser, no URLs, and falls back from empty excerpts', () => {
    const caption = wordpressCaption({
      ...payload,
      excerpt: ' ',
      content:
        '<script>secret()</script><p>' +
        'Texte '.repeat(100) +
        'https://example.com</p>',
    });
    expect(caption.length).toBeLessThan(350);
    expect(caption).not.toMatch(/secret|https:|<p>/);
    expect(caption).toContain('Texte');
    expect(
      wordpressCaption({ ...payload, excerpt: 'Extrait choisi' }),
    ).toContain('Extrait choisi');
  });

  it('validates IDs, HTTPS, dates and payload size', async () => {
    expect(
      await validate(Object.assign(new WordpressArticleDto(), payload)),
    ).toEqual([]);
    for (const change of [
      { postId: 'abc' },
      { articleUrl: 'http://example.com' },
      { publishedAt: 'invalid' },
      { content: 'x'.repeat(100001) },
    ]) {
      expect(
        (
          await validate(
            Object.assign(new WordpressArticleDto(), payload, change),
          )
        ).length,
      ).toBeGreaterThan(0);
    }
  });
});
