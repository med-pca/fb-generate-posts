import { NewsService, headlinesText, parseFeed } from './news.service';
import { RewriterService } from './rewriter.service';

const RSS = `<?xml version="1.0"?><rss><channel>
<item><title><![CDATA[Oil prices jump as Gulf tensions rise]]></title><description><![CDATA[<p>Brent up 4%</p>]]></description><pubDate>Mon, 05 Oct 2026 08:00:00 GMT</pubDate></item>
<item><title>Inflation eases to 2.4% &amp; rents still climb</title><pubDate>Mon, 05 Oct 2026 07:00:00 GMT</pubDate></item>
</channel></rss>`;

describe('Actualité du moment', () => {
  it('lit un flux RSS : titres, résumés nettoyés, dates', () => {
    const items = parseFeed(RSS, 'bbc.co.uk');
    expect(items.map((i) => i.title)).toEqual(['Oil prices jump as Gulf tensions rise', 'Inflation eases to 2.4% & rents still climb']);
    expect(items[0].summary).toBe('Brent up 4%');
    expect(items[0].publishedAt).toBe('2026-10-05T08:00:00.000Z');
    expect(headlinesText(items)).toMatch(/^1\. Oil prices jump.*\(bbc\.co\.uk, 2026-10-05\)/);
  });

  it('plusieurs flux, doublons retirés, les plus récents d’abord ; un flux en panne n’arrête rien', async () => {
    const service = new NewsService({ get: () => 'https://a.test/rss,https://b.test/rss' } as never);
    global.fetch = jest.fn(async (url: string) =>
      url.includes('b.test') ? Promise.reject(new Error('down')) : new Response(RSS, { status: 200 }),
    ) as never;
    const h = await service.headlines(Date.parse('2026-10-05T12:00:00Z'));
    expect(h).toHaveLength(2);
    expect(h[0].title).toMatch(/Oil prices/);
  });
});

describe('Notre article depuis une image et l’actualité', () => {
  function rewriter(value: Record<string, unknown>) {
    const llm = { completeJson: jest.fn(async () => ({ value, provider: 'openai' })) };
    return { service: new RewriterService(llm as never), llm };
  }
  const answer = {
    newsHook: 'Oil prices jump as Gulf tensions rise',
    titles: ['“Why This Empty Gas Station Says Everything About 2026”', 'The Price of Fuel', 'A Quiet Pump, A Loud Crisis'],
    slug: 'empty-gas-station-2026',
    excerpt: 'An empty pump, a full crisis.',
    metaDescription: 'What an empty gas station tells us about the oil price surge.',
    contentHtml: '<h2>An image of our times</h2><p>Body…</p><script>x()</script>',
    caption: 'This picture explains the oil crisis better than any chart. #oil https://x.test',
    hashtags: ['#oil', 'inflation', 'costofliving'],
  };

  it('montre l’image au modèle, et lui interdit d’inventer l’actualité', async () => {
    const { service, llm } = rewriter(answer);
    await service.fromNews({ image: { data: 'AAAA', mimeType: 'image/jpeg' }, headlines: '1. Oil prices jump', language: 'auto' });
    const req = (llm.completeJson.mock.calls[0] as any)[0];
    expect(req.image).toEqual({ data: 'AAAA', mimeType: 'image/jpeg' });
    expect(req.instructions).toMatch(/expert journalist specialised in viral content/);
    expect(req.instructions).toMatch(/ONLY from the headlines list/);
    expect(req.instructions).toMatch(/Never invent events, figures, quotes/);
    expect(req.input).toMatch(/this language: en/);
    expect(req.input).toMatch(/1\. Oil prices jump/);
  });

  it('3 titres (le premier devient le titre), corps nettoyé, amorce sans lien ni hashtag', async () => {
    const { service } = rewriter(answer);
    const a = await service.fromNews({ image: { data: 'A', mimeType: 'image/png' }, headlines: 'x', language: 'en' });
    expect(a.titles).toHaveLength(3);
    expect(a.title).toBe('Why This Empty Gas Station Says Everything About 2026');
    expect(a.contentHtml).not.toMatch(/script/);
    expect(a.caption).toBe('This picture explains the oil crisis better than any chart.');
    expect(a.hashtags).toEqual(['oil', 'inflation', 'costofliving']);
    expect(a.newsHook).toMatch(/Oil prices/);
  });
});
