import { BadGatewayException, BadRequestException } from '@nestjs/common';
import { SourceReaderService, normalizeText } from './source-reader.service';

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

const page = (extra = '') => `<!doctype html><html lang="fr"><head>
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
