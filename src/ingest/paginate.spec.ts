import { continueLabel, NEXT_PAGE, paginateByParagraphs, paginateHtml } from './paginate';

/** Un article de la forme que le réécriveur produit : des sections menées
 * par un <h2>, avec assez de texte pour mériter d'être coupé. */
const section = (title: string, paragraphs = 3) =>
  `<h2>${title}</h2>` +
  Array.from(
    { length: paragraphs },
    (_, index) =>
      `<p>${title} paragraphe ${index}. ${'Du texte de remplissage assez long pour compter. '.repeat(4)}</p>`,
  ).join('');

const ARTICLE = ['Origines', 'La cuisson', 'Les épices', 'Les variantes']
  .map((title) => section(title))
  .join('');

const pagesOf = (html: string) => html.split(NEXT_PAGE);

describe('continueLabel', () => {
  it('parle la langue de l’article', () => {
    expect(continueLabel('en')).toBe('Continued on the next page');
    expect(continueLabel('fr')).toBe('Suite à la page suivante');
    expect(continueLabel('es')).toContain('página siguiente');
  });

  it('accepte une étiquette régionale', () => {
    expect(continueLabel('pt-BR')).toContain('próxima página');
  });

  // Un texte anglais sous un article dans une autre langue se voit, mais
  // vaut mieux qu'une page sans invitation.
  it('retombe sur l’anglais pour une langue inconnue', () => {
    expect(continueLabel('xx')).toBe('Continued on the next page');
    expect(continueLabel(null)).toBe('Continued on the next page');
  });
});

describe('paginateHtml', () => {
  it('découpe en autant de pages que demandé', () => {
    expect(pagesOf(paginateHtml(ARTICLE, 3, 'fr'))).toHaveLength(3);
  });

  /** Couper au milieu d'un raisonnement donne une page qui commence dans le
   * vide : chaque page nouvelle s'ouvre sur un titre. */
  it('coupe au début d’une section', () => {
    for (const page of pagesOf(paginateHtml(ARTICLE, 3, 'fr')).slice(1)) {
      expect(page.trimStart().startsWith('<h2>')).toBe(true);
    }
  });

  it('place l’invitation avant chaque coupure, dans la bonne langue', () => {
    const paginated = paginateHtml(ARTICLE, 3, 'en');
    expect(paginated.split('Continued on the next page')).toHaveLength(3);
    for (const page of pagesOf(paginated).slice(0, -1)) {
      expect(page.trimEnd().endsWith('<p>Continued on the next page</p>')).toBe(
        true,
      );
    }
  });

  it('ne perd rien du texte au passage', () => {
    const plain = (html: string) =>
      html
        .replace(/<[^>]*>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    const paginated = paginateHtml(ARTICLE, 3, 'fr');
    expect(plain(paginated)).toContain(
      plain(section('Les variantes')).slice(0, 60),
    );
    for (const title of [
      'Origines',
      'La cuisson',
      'Les épices',
      'Les variantes',
    ]) {
      expect(paginated).toContain(`<h2>${title}</h2>`);
    }
  });

  it('laisse l’article entier quand on n’en demande qu’une page', () => {
    expect(paginateHtml(ARTICLE, 1, 'fr')).toBe(ARTICLE);
  });

  // Mieux vaut moins de pages que des pages vides.
  it('refuse de couper un article trop court', () => {
    const court =
      '<h2>Titre</h2><p>Trois mots.</p><h2>Autre</h2><p>Trois mots.</p>';
    expect(paginateHtml(court, 3, 'fr')).toBe(court);
  });

  it('réduit le nombre de pages plutôt que d’en faire de maigres', () => {
    const deux = section('Une', 3) + section('Deux', 3);
    expect(pagesOf(paginateHtml(deux, 4, 'fr')).length).toBeLessThanOrEqual(2);
  });

  it('se coupe sur une frontière de bloc quand il n’y a pas de titre', () => {
    const sansTitre = Array.from(
      { length: 8 },
      (_, i) =>
        `<p>Paragraphe ${i}. ${'Du texte assez long pour compter. '.repeat(5)}</p>`,
    ).join('');
    expect(pagesOf(paginateHtml(sansTitre, 2, 'fr'))).toHaveLength(2);
  });

  it('rend le texte inchangé quand il n’y a rien à découper', () => {
    expect(paginateHtml('<p>Seul.</p>', 3, 'fr')).toBe('<p>Seul.</p>');
    expect(paginateHtml('', 3, 'fr')).toBe('');
  });
});

describe('paginateByParagraphs', () => {
  const p = (words: number, label = 'mot') => `<p>${Array.from({ length: words }, (_, i) => `${label}${i}`).join(' ')}</p>`;
  const pages = (html: string) => html.split(NEXT_PAGE);

  it('met « page suivante » tous les 2 paragraphes : un article long fait beaucoup de pages', () => {
    const html = Array.from({ length: 20 }, () => p(40)).join('\n');
    const out = paginateByParagraphs(html, 2, 60, 'en');
    expect(pages(out)).toHaveLength(10);
    expect(pages(out)[0]).toContain('Continued on the next page');
    expect(pages(out).at(-1)).not.toContain('Continued on the next page');
  });

  it('regroupe des répliques d’une ligne jusqu’au minimum de mots', () => {
    const html = Array.from({ length: 30 }, () => p(5)).join('\n');
    const out = paginateByParagraphs(html, 2, 60, 'en');
    for (const page of pages(out)) {
      const words = page.replace(/<[^>]*>/g, ' ').split(/\s+/).filter((w) => /^mot/.test(w)).length;
      expect(words).toBeGreaterThanOrEqual(30); // la dernière peut être plus courte, jamais vide
    }
    expect(pages(out).length).toBeLessThan(15);
  });

  it('un intertitre ouvre une page, il ne la ferme jamais', () => {
    const html = [p(40), p(40), '<h2>Étape 2</h2>', p(40), p(40), '<h2>Étape 3</h2>', p(40), p(40)].join('\n');
    for (const page of pages(paginateByParagraphs(html, 2, 0, 'fr'))) {
      expect(page.trim()).not.toMatch(/<\/h2>\s*(<p>Suite à la page suivante<\/p>)?\s*$/);
    }
  });

  it('une dernière page trop maigre rejoint la précédente', () => {
    const html = [p(40), p(40), p(40), p(40), p(3)].join('\n');
    expect(pages(paginateByParagraphs(html, 2, 60, 'en'))).toHaveLength(2);
  });

  it('0 paragraphe ou un seul bloc : article inchangé', () => {
    const html = [p(40), p(40)].join('\n');
    expect(paginateByParagraphs(html, 0, 60, 'en')).toBe(html);
    expect(paginateByParagraphs(p(40), 2, 60, 'en')).toBe(p(40));
  });
});

describe('paginateByParagraphs — au plus N pages', () => {
  const p = (words: number) => `<p>${Array.from({ length: words }, (_, i) => `mot${i}`).join(' ')}</p>`;
  const count = (html: string) => html.split(NEXT_PAGE).length;

  it('un article très long est coupé en 5 pages équilibrées, pas en 30', () => {
    const html = Array.from({ length: 60 }, () => p(40)).join('\n');
    const out = paginateByParagraphs(html, 2, 60, 'en', 5);
    expect(count(out)).toBe(5);
    const sizes = out.split(NEXT_PAGE).map((page) => page.replace(/<[^>]*>/g, ' ').split(/\s+/).filter((w) => /^mot/.test(w)).length);
    expect(Math.max(...sizes) - Math.min(...sizes)).toBeLessThanOrEqual(80); // équilibrées, à 2 paragraphes près
  });

  it('un article court garde la logique « tous les 2 paragraphes »', () => {
    const html = Array.from({ length: 6 }, () => p(40)).join('\n');
    expect(count(paginateByParagraphs(html, 2, 60, 'en', 5))).toBe(3);
  });
});

it('au plus 3 pages : un article très long en 3 pages équilibrées', () => {
  const p = (words: number) => `<p>${Array.from({ length: words }, (_, i) => `mot${i}`).join(' ')}</p>`;
  const html = Array.from({ length: 60 }, () => p(40)).join('\n');
  expect(paginateByParagraphs(html, 2, 60, 'en', 3).split(NEXT_PAGE)).toHaveLength(3);
});
