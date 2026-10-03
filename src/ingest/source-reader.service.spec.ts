import { BadGatewayException, BadRequestException } from '@nestjs/common';
import { SourceReaderService, normalizeText, pageOf } from './source-reader.service';

jest.mock('node:dns/promises', () => ({
  lookup: jest.fn(() =>
    Promise.resolve([{ address: '93.184.216.34', family: 4 }]),
  ),
}));

const BODY = Array.from(
  { length: 12 },
  (_, index) =>
    `<p>Phrase numéro ${index} du corps de l'article, assez longue pour que l'extraction la retienne comme du contenu réel.</p>`,
).join('');

const page = (
  extra = '',
  lang = 'fr',
) => `<!doctype html><html lang="${lang}"><head>
  <title>Ma recette de couscous | Exemple</title>
  <meta property="og:image" content="/images/couverture.jpg">
  <meta property="og:site_name" content="Exemple">
  ${extra}
</head><body>
  <nav>Accueil Contact Mentions légales</nav>
  <article><h1>Ma recette de couscous</h1>${BODY}</article>
  <footer>Tous droits réservés</footer>
</body></html>`;

const html = (body: string, status = 200, type = 'text/html; charset=utf-8') =>
  new Response(body, { status, headers: { 'content-type': type } });

const redirect = (location: string, status = 301) =>
  new Response('', { status, headers: { location } });

let fetchMock: jest.Mock;
beforeEach(() => {
  fetchMock = jest.fn();
  global.fetch = fetchMock;
});

const read = (url = 'https://exemple.test/recette') =>
  new SourceReaderService().read(url);

describe('normalizeText', () => {
  it('resserre les espaces sans effacer les paragraphes', () => {
    expect(normalizeText('  Un\t \ttexte  \n\n\n\n  suivant  ')).toBe(
      'Un texte\n\nsuivant',
    );
  });
});

describe('SourceReaderService', () => {
  it('extrait le titre, le texte et l’image mise en avant', async () => {
    fetchMock.mockResolvedValue(html(page()));
    const article = await read();
    // Readability retient le <title> du document et en retire le suffixe
    // du site : c'est le titre que porterait l'article, pas celui du menu.
    expect(article.title).toBe('Ma recette de couscous');
    expect(article.text).toContain('Phrase numéro 0');
    expect(article.siteName).toBe('Exemple');
    // Résolue contre l'URL finale : le chemin relatif ne sert à rien plus loin.
    expect(article.leadImageUrl).toBe(
      'https://exemple.test/images/couverture.jpg',
    );
    // Le menu et le pied de page ne font pas partie de l'article.
    expect(article.text).not.toContain('Mentions légales');
  });

  // Un titre qui contient un tiret sans rapport avec le site doit rester
  // entier : seul le suffixe correspondant au nom déclaré est retiré.
  it('garde un séparateur qui n’annonce pas le nom du site', async () => {
    fetchMock.mockResolvedValue(
      html(page().replace('| Exemple', '- la version express')),
    );
    await expect(read()).resolves.toMatchObject({
      title: 'Ma recette de couscous - la version express',
    });
  });

  it('garde le titre tel quel quand le site ne se déclare pas', async () => {
    fetchMock.mockResolvedValue(
      html(page().replace(/<meta property="og:site_name"[^>]*>/, '')),
    );
    await expect(read()).resolves.toMatchObject({
      title: 'Ma recette de couscous | Exemple',
    });
  });

  /** Réécrire n'est pas traduire : la langue déclarée par la page décide de
   * celle de l'article. */
  it('relève la langue déclarée par la page', async () => {
    fetchMock.mockResolvedValue(html(page('', 'en-GB')));
    await expect(read()).resolves.toMatchObject({ language: 'en' });
  });

  it('se rabat sur og:locale quand <html> ne dit rien', async () => {
    fetchMock.mockResolvedValue(
      html(
        page('<meta property="og:locale" content="es_ES">').replace(
          '<html lang="fr">',
          '<html>',
        ),
      ),
    );
    await expect(read()).resolves.toMatchObject({ language: 'es' });
  });

  // Mieux vaut le dire au modèle que lui imposer une langue au hasard.
  it('rend null quand la page ne déclare aucune langue', async () => {
    fetchMock.mockResolvedValue(
      html(page().replace('<html lang="fr">', '<html>')),
    );
    await expect(read()).resolves.toMatchObject({ language: null });
  });

  it('suit une redirection et rend l’URL réellement lue', async () => {
    fetchMock
      .mockResolvedValueOnce(redirect('https://exemple.test/final'))
      .mockResolvedValueOnce(html(page()));
    await expect(read()).resolves.toMatchObject({
      url: 'https://exemple.test/final',
    });
  });

  // Laisser `fetch` suivre les redirections ne contrôlerait que la première
  // URL : un hôte public peut renvoyer vers l'intérieur.
  it('refuse une redirection qui quitte HTTPS', async () => {
    fetchMock.mockResolvedValueOnce(redirect('http://exemple.test/final'));
    await expect(read()).rejects.toBeInstanceOf(BadRequestException);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('abandonne après une chaîne de redirections trop longue', async () => {
    fetchMock.mockResolvedValue(redirect('https://exemple.test/encore'));
    await expect(read()).rejects.toBeInstanceOf(BadGatewayException);
  });

  it('refuse une réponse qui n’est pas du HTML', async () => {
    fetchMock.mockResolvedValue(html('%PDF-1.4', 200, 'application/pdf'));
    await expect(read()).rejects.toBeInstanceOf(BadRequestException);
  });

  it('remonte le statut d’une source en erreur', async () => {
    fetchMock.mockResolvedValue(html('', 503));
    await expect(read()).rejects.toBeInstanceOf(BadGatewayException);
  });

  it('signale une page sans article plutôt que d’en réécrire trois mots', async () => {
    fetchMock.mockResolvedValue(
      html('<html><body><p>Connexion</p></body></html>'),
    );
    await expect(read()).rejects.toBeInstanceOf(BadRequestException);
  });

  // Un serveur qui annonce une taille honnête puis déverse sans fin doit
  // être arrêté en cours de lecture, pas après.
  it('arrête la lecture d’un corps trop volumineux', async () => {
    fetchMock.mockResolvedValue(html('<p>' + 'x'.repeat(2_100_000) + '</p>'));
    await expect(read()).rejects.toBeInstanceOf(BadRequestException);
  });

  it('refuse une taille annoncée au-delà de la limite', async () => {
    fetchMock.mockResolvedValue(
      new Response(page(), {
        headers: { 'content-type': 'text/html', 'content-length': '9000000' },
      }),
    );
    await expect(read()).rejects.toBeInstanceOf(BadRequestException);
  });

  it('traite une source injoignable comme une panne de la source', async () => {
    fetchMock.mockRejectedValue(new Error('ECONNREFUSED'));
    await expect(read()).rejects.toBeInstanceOf(BadGatewayException);
  });

  it('ignore une image mise en avant qui n’est pas en HTTPS', async () => {
    fetchMock.mockResolvedValue(
      html(
        page().replace('/images/couverture.jpg', 'http://ailleurs.test/i.jpg'),
      ),
    );
    await expect(read()).resolves.toMatchObject({ leadImageUrl: null });
  });
});

describe('SourceReaderService — article en plusieurs pages', () => {
  const part = (n: number, nav: string) => `<!doctype html><html lang="en"><head>
    <title>Easy lasagna | Food</title></head><body>
    <article><h1>Easy lasagna</h1>${Array.from(
      { length: 8 },
      (_, i) => `<p>Page ${n}, paragraph ${i}: a long enough sentence for the extraction to keep it as real content.</p>`,
    ).join('')}${nav}</article>
    <aside><a href="https://food.test/other-recipe/" rel="next">Next post: other recipe</a></aside></body></html>`;

  it('suit « page suivante » jusqu’à la dernière page, sans passer à l’article suivant', async () => {
    const pages: Record<string, string> = {
      'https://food.test/lasagna/': part(1, '<div class="page-links"><a class="post-page-numbers" href="https://food.test/lasagna/2/">2</a><a class="post-page-numbers" href="https://food.test/lasagna/3/">3</a></div>'),
      'https://food.test/lasagna/2/': part(2, '<a href="/lasagna/3/">Next Page »</a>'),
      'https://food.test/lasagna/3/': part(3, '<a href="/lasagna/2/">Previous page</a>'),
    };
    fetchMock.mockImplementation(async (url: URL) => html(pages[url.toString()] ?? '', pages[url.toString()] ? 200 : 404));
    const article = await read('https://food.test/lasagna/');
    expect(article.pageUrls).toEqual([
      'https://food.test/lasagna/',
      'https://food.test/lasagna/2/',
      'https://food.test/lasagna/3/',
    ]);
    expect(article.text).toContain('Page 1, paragraph 0');
    expect(article.text).toContain('Page 3, paragraph 7');
    expect(fetchMock.mock.calls.map((c) => c[0].toString())).not.toContain('https://food.test/other-recipe/');
  });

  it('reconnaît ?page=2 et un libellé arabe', async () => {
    const pages: Record<string, string> = {
      'https://food.test/recette': part(1, '<a href="?page=2">الصفحة التالية</a>'),
      'https://food.test/recette?page=2': part(2, ''),
    };
    fetchMock.mockImplementation(async (url: URL) => html(pages[url.toString()] ?? '', pages[url.toString()] ? 200 : 404));
    const article = await read('https://food.test/recette');
    expect(article.pageUrls).toHaveLength(2);
    expect(article.text).toContain('Page 2, paragraph 0');
  });

  it('une page suivante illisible n’annule pas les pages déjà lues', async () => {
    fetchMock.mockImplementation(async (url: URL) =>
      url.toString().endsWith('/2/')
        ? html('', 500)
        : html(part(1, '<a href="https://food.test/lasagna/2/">Page suivante</a>')),
    );
    const article = await read('https://food.test/lasagna/');
    expect(article.pageUrls).toEqual(['https://food.test/lasagna/']);
    expect(article.text).toContain('Page 1');
  });

  it('s’arrête quand le site renvoie toujours la même page', async () => {
    fetchMock.mockImplementation(async () => html(part(1, '<a href="/lasagna/2/">Next page</a>')));
    const article = await read('https://food.test/lasagna/');
    expect(article.pageUrls).toHaveLength(1);
  });
});

describe('pageOf', () => {
  it('sépare le socle et le numéro de page', () => {
    expect(pageOf('https://a.test/recette/2/')).toEqual({ base: 'a.test/recette', page: 2 });
    expect(pageOf('https://a.test/recette/page/3')).toEqual({ base: 'a.test/recette', page: 3 });
    expect(pageOf('https://a.test/recette?page=4')).toEqual({ base: 'a.test/recette', page: 4 });
    expect(pageOf('https://a.test/recette-page-5.html')).toEqual({ base: 'a.test/recette', page: 5 });
    expect(pageOf('https://a.test/recette/')).toEqual({ base: 'a.test/recette', page: 1 });
    // Un identifiant d'article n'est pas un numéro de page.
    expect(pageOf('https://a.test/recipes/48213').page).toBe(1);
  });
});
