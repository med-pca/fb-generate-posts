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

type PostData = ReturnType<ArticlesService['postDataForSlot']> & {
  targets: { create: { groupId: string }[] };
};
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
      findUnique: jest.fn<Promise<{ id: string } | null>, unknown[]>(() =>
        Promise.resolve(null),
      ),
      create: jest.fn(({ data }: { data: { externalId: string } }) =>
        Promise.resolve({ id: 'article', ...data }),
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
      generated: 2,
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
    expect(data.description).toContain('lien en commentaire');
    expect(data.description).not.toContain(payload.articleUrl);
    expect(tx.post.create.mock.calls[1][0].data.targets.create).toEqual([]);
    expect(tx.$executeRaw).toHaveBeenCalled();
  });

  it('ignores repeated deliveries and later changes without touching existing posts', async () => {
    const { service, tx } = setup();
    tx.article.findUnique.mockResolvedValue({ id: 'existing' });
    expect(await service.publish({ ...payload, title: 'Changed' })).toEqual({
      articleId: 'existing',
      duplicate: true,
      generated: 0,
    });
    expect(tx.article.create).not.toHaveBeenCalled();
    expect(tx.post.create).not.toHaveBeenCalled();
    expect(tx.profile.findMany).not.toHaveBeenCalled();
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
