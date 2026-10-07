import { ServiceUnavailableException } from '@nestjs/common';
import { LlmService } from '../llm/llm.service';
import {
  cleanCaption,
  normalizeGenerated,
  normalizeHashtags,
  normalizeSlug,
  RewriterService,
  sanitizeArticleHtml, guessLanguage, writingLanguage } from './rewriter.service';

describe('normalizeSlug', () => {
  it('réduit un titre latin à des mots séparés par un tiret', () => {
    expect(normalizeSlug('Crème Brûlée : la Recette !', '')).toBe(
      'creme-brulee-la-recette',
    );
  });

  // Effacer les écritures non latines réduirait tout un titre à « article ».
  it('conserve une écriture non latine', () => {
    expect(normalizeSlug('وصفة الكسكس', '')).toBe('وصفة-الكسكس');
  });

  it('retombe sur le titre quand le modèle ne rend rien d’utilisable', () => {
    expect(normalizeSlug('!!!', 'Mon Article')).toBe('mon-article');
  });

  it('rend un identifiant même sans rien d’exploitable', () => {
    expect(normalizeSlug('', '???')).toBe('article');
  });

  it('ne laisse pas de tiret en fin de coupe', () => {
    const slug = normalizeSlug('a'.repeat(78) + ' mot suivant', '');
    expect(slug).toHaveLength(78);
    expect(slug.endsWith('-')).toBe(false);
  });
});

describe('cleanCaption', () => {
  // Le lien arrive plus tard dans le commentaire, et les hashtags sont
  // recollés à la fabrication du post : les laisser les doublerait.
  it('retire les URL et les hashtags', () => {
    expect(
      cleanCaption(
        'Une recette simple https://exemple.test/x #recette #facile',
      ),
    ).toBe('Une recette simple');
  });

  it('garde les emojis et les sauts de paragraphe', () => {
    expect(cleanCaption('Première ligne 🍰\n\n\n\nSeconde ligne')).toBe(
      'Première ligne 🍰\n\nSeconde ligne',
    );
  });

  it('coupe sur un mot entier au-delà de la limite', () => {
    const caption = cleanCaption('mot '.repeat(500));
    expect(caption.length).toBeLessThanOrEqual(1200);
    expect(caption.endsWith('…')).toBe(true);
  });
});

describe('sanitizeArticleHtml', () => {
  it('garde les balises de structure et jette leurs attributs', () => {
    expect(
      sanitizeArticleHtml('<h2 id="x">Titre</h2><p class="y">Texte</p>'),
    ).toBe('<h2>Titre</h2><p>Texte</p>');
  });

  // Retirer la seule balise laisserait le code en clair dans l'article.
  it('retire un bloc exécutable avec son contenu', () => {
    expect(sanitizeArticleHtml('<p>Avant</p><script>alert(1)</script>')).toBe(
      '<p>Avant</p>',
    );
  });

  it('déballe une balise hors liste en gardant son texte', () => {
    expect(sanitizeArticleHtml('<p>Voir <a href="http://x">ici</a></p>')).toBe(
      '<p>Voir ici</p>',
    );
  });

  /** Le modèle écrit parfois « \n » en toutes lettres au lieu du saut de
   * ligne que le JSON aurait porté. Laissé tel quel, WordPress lui mange
   * l'antislash et l'article se retrouve parsemé de « n » isolés. */
  it('convertit un saut de ligne écrit en toutes lettres', () => {
    const html = sanitizeArticleHtml('<p>Avant</p>\\n\\n<p>Après</p>');
    expect(html).not.toMatch(/\\n|(^|>)n(<|$)/);
    expect(html).toContain('<p>Avant</p>');
    expect(html).toContain('<p>Après</p>');
  });

  it('convertit aussi les tabulations et retours chariot littéraux', () => {
    expect(
      sanitizeArticleHtml('<p>A</p>\\t<p>B</p>\\r\\n<p>C</p>'),
    ).not.toMatch(/\\[trn]/);
  });

  it('neutralise un gestionnaire d’événement', () => {
    const html = sanitizeArticleHtml('<p onclick="voler()">Texte</p>');
    expect(html).toBe('<p>Texte</p>');
    expect(html).not.toContain('onclick');
  });

  it('ne laisse pas une balise imbriquée se reformer', () => {
    expect(
      sanitizeArticleHtml('<scr<script>ipt>alert(1)</script>'),
    ).not.toMatch(/<script/i);
  });
});

describe('normalizeHashtags', () => {
  it('retire le dièse, la ponctuation et les doublons', () => {
    expect(
      normalizeHashtags(['#Recette', 'recette', 'sans gluten!', '#']),
    ).toEqual(['Recette', 'recette', 'sansgluten']);
  });

  it('plafonne la liste', () => {
    const tags = normalizeHashtags(
      Array.from({ length: 30 }, (_, index) => `tag${index}`),
    );
    expect(tags).toHaveLength(10);
  });
});

describe('normalizeGenerated', () => {
  const raw = {
    title: '  Ma recette  ',
    slug: 'Ma Recette Idéale',
    excerpt: 'Un résumé https://exemple.test',
    metaDescription: 'Une description #seo',
    contentHtml: '<h2>Étapes</h2><script>x()</script><p>Mélanger</p>',
    caption: 'Découvrez la recette #cuisine',
    hashtags: ['#cuisine', 'recette'],
  };

  it('nettoie chaque champ rendu par le modèle', () => {
    expect(normalizeGenerated(raw, 'Repli')).toEqual({
      title: 'Ma recette',
      slug: 'ma-recette-ideale',
      excerpt: 'Un résumé',
      metaDescription: 'Une description',
      contentHtml: '<h2>Étapes</h2><p>Mélanger</p>',
      caption: 'Découvrez la recette',
      hashtags: ['cuisine', 'recette'],
    });
  });

  it('retombe sur le titre de la source quand le modèle n’en rend pas', () => {
    expect(
      normalizeGenerated({ ...raw, title: '' }, 'Titre source').title,
    ).toBe('Titre source');
  });
});

describe('RewriterService', () => {
  const source = {
    url: 'https://exemple.test/a',
    title: 'Titre source',
    text: 'x'.repeat(400),
    excerpt: null,
    leadImageUrl: null,
    siteName: null,
    language: null,
  };

  const GOOD = {
    title: 'T',
    slug: 't',
    excerpt: 'e',
    metaDescription: 'm',
    contentHtml: '<p>Corps</p>',
    caption: 'Une légende',
    hashtags: [],
  };

  const llmReturning = (value: unknown) =>
    ({
      completeJson: jest.fn(() => Promise.resolve({ value, provider: 'kimi' })),
    }) as unknown as LlmService;

  /** Ce que le modèle reçoit décide du résultat : on le lit plutôt que de
   * le supposer. */
  const askedWith = async (
    language: string,
    sourceLanguage: string | null = null,
  ) => {
    const completeJson = jest.fn(() =>
      Promise.resolve({ value: GOOD, provider: 'kimi' }),
    );
    await new RewriterService({
      completeJson,
    } as unknown as LlmService).rewrite({
      source: { ...source, language: sourceLanguage },
      language,
    });
    const [request] = completeJson.mock.calls[0] as unknown as [
      { instructions: string; input: string },
    ];
    return request;
  };

  // Imposer une langue ferait traduire l'article au passage : réécrire n'est
  // pas traduire.
  it('garde la langue de la source par défaut, nommée en toutes lettres', async () => {
    const { input } = await askedWith('auto', 'en');
    expect(input).toContain('Writing language: English');
  });

  /** Une consigne en français tirait le modèle vers le français, même pour
   * un article anglais : elle est en anglais. */
  it('donne une consigne en anglais', async () => {
    const { instructions } = await askedWith('auto', 'en');
    expect(instructions).toContain('You rewrite an article');
    expect(instructions).not.toMatch(/Tu réécris|Réponds/);
  });

  /** Énumérer les champs en laissait passer un : metaDescription sortait en
   * français pendant que le reste était en anglais. */
  it('étend la langue à tous les champs', async () => {
    const { input } = await askedWith('auto', 'en');
    expect(input).toContain('EVERY field of the JSON');
    expect(input).toContain('metaDescription');
  });

  it('sans langue déclarée ni texte reconnaissable : anglais', async () => {
    const { input } = await askedWith('auto', null);
    expect(input).toContain('Writing language: English');
  });

  it('accepte malgré tout une langue imposée', async () => {
    const { input } = await askedWith('fr', 'en');
    expect(input).toContain('Writing language: French');
  });

  it('traite une langue absente comme « auto »', async () => {
    const { input } = await askedWith('', 'es');
    expect(input).toContain('Writing language: Spanish');
  });

  /** L'objectif est de réécrire l'article de la source, pas d'en produire
   * un autre sur le même thème : la consigne doit demander de suivre les
   * notes, pas de repartir d'un plan neuf. */
  it('demande une réécriture fidèle, pas un article neuf', async () => {
    const { instructions } = await askedWith('auto');
    expect(instructions).toContain('same order');
    expect(instructions).toContain('do not pad');
  });

  it('renormalise ce que le fournisseur rend', async () => {
    const generated = await new RewriterService(
      llmReturning({
        title: '  Ma recette  ',
        slug: 'Ma Recette',
        excerpt: 'Résumé',
        metaDescription: 'Description',
        contentHtml: '<p>Corps</p><script>x()</script>',
        caption: 'Légende #cuisine',
        hashtags: ['#cuisine'],
      }),
    ).rewrite({ source, language: 'fr' });
    expect(generated).toMatchObject({
      title: 'Ma recette',
      slug: 'ma-recette',
      contentHtml: '<p>Corps</p>',
      caption: 'Légende',
      hashtags: ['cuisine'],
    });
  });

  // Un JSON bien formé mais vide n'est pas une réécriture : le laisser
  // passer déposerait un article sans corps sur WordPress.
  it('refuse une réécriture sans corps ni légende', async () => {
    await expect(
      new RewriterService(
        llmReturning({
          title: 'T',
          slug: 't',
          excerpt: '',
          metaDescription: '',
          contentHtml: '',
          caption: '',
          hashtags: [],
        }),
      ).rewrite({ source, language: 'fr' }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});

describe('writingLanguage', () => {
  const english = 'Preheat the oven and mix the flour with the sugar. This is the cake that your family will love, and it is ready in an hour with the best butter for you.';
  const french = 'Préchauffez le four et mélangez la farine avec le sucre. Voici le gâteau que toute la famille adore, prêt en une heure dans votre cuisine pour les fêtes et pour vous.';

  /** Le cas réel : un WordPress réglé en fr-FR qui publie en anglais. */
  it('suit le texte de l’article plutôt que la langue déclarée par la page', () => {
    expect(writingLanguage('auto', 'fr', english)).toBe('en');
    expect(writingLanguage('auto', 'en', french)).toBe('fr');
  });

  it('garde la langue déclarée quand le texte ne tranche pas, puis l’anglais', () => {
    expect(writingLanguage('auto', 'de', 'Kurz.')).toBe('de');
    expect(writingLanguage(null, null, 'ok')).toBe('en');
  });

  it('une langue imposée l’emporte toujours', () => {
    expect(writingLanguage('es', 'fr', english)).toBe('es');
  });

  it('reconnaît l’arabe à son écriture', () => {
    expect(guessLanguage('وصفة الكعكة السهلة')).toBe('ar');
  });
});
