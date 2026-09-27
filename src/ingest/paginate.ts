/** Découpage d'un article en pages WordPress.
 *
 * WordPress coupe un article sur `<!--nextpage-->` et rend un lien « page
 * suivante ». Chaque page vue est une page de plus pour la régie
 * publicitaire, et c'est le format des articles déjà en ligne sur le site.
 *
 * La coupure est décidée ici, pas par le modèle : on veut un nombre de
 * pages prévisible, et un modèle qui oublie la consigne rendrait un article
 * d'une seule page sans qu'on le sache.
 */

/** Le marqueur que WordPress reconnaît. */
export const NEXT_PAGE = '<!--nextpage-->';

/** L'invitation à poursuivre, dans la langue de l'article. Un texte anglais
 * sous un article espagnol se voit tout de suite. */
const CONTINUE_LABEL: Record<string, string> = {
  en: 'Continued on the next page',
  fr: 'Suite à la page suivante',
  es: 'Continúa en la página siguiente',
  pt: 'Continua na próxima página',
  it: 'Continua nella pagina successiva',
  de: 'Fortsetzung auf der nächsten Seite',
  nl: 'Lees verder op de volgende pagina',
  ar: 'يتبع في الصفحة التالية',
};

/** En deçà, une page n'a pas de quoi retenir un lecteur : mieux vaut moins
 * de pages que des pages vides. */
const MIN_PAGE_CHARS = 350;
/** Les blocs de premier niveau que le réécriveur produit. */
const BLOCK = /<(h2|h3|p|ul|ol|blockquote)\b[^>]*>[\s\S]*?<\/\1>/gi;

export function continueLabel(language: string | null | undefined) {
  const code = (language || '').trim().slice(0, 2).toLowerCase();
  return CONTINUE_LABEL[code] || CONTINUE_LABEL.en;
}

const textLength = (html: string) =>
  html
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim().length;

/** Les points de coupure, choisis au plus près d'un découpage régulier.
 *
 * Un `<h2>` est préféré : couper au début d'une section donne une page qui
 * commence par un titre, pas au milieu d'un raisonnement. À défaut, toute
 * frontière de bloc fait l'affaire. */
function cutPoints(blocks: string[], pages: number) {
  const lengths = blocks.map(textLength);
  const total = lengths.reduce((sum, value) => sum + value, 0);
  if (!total) return [];
  const headings = blocks
    .map((block, index) => (/^<h2\b/i.test(block) ? index : -1))
    .filter((index) => index > 0);

  const cuts: number[] = [];
  let consumed = 0;
  for (let page = 1; page < pages; page += 1) {
    const target = (total * page) / pages;
    const after = cuts.length ? cuts[cuts.length - 1] : 0;
    const usable = (
      headings.length ? headings : blocks.map((_, i) => i).slice(1)
    ).filter((index) => index > after);
    if (!usable.length) break;
    // Le bloc dont la frontière tombe au plus près de la cible.
    let best = usable[0];
    let closest = Infinity;
    for (const index of usable) {
      const upTo = lengths
        .slice(0, index)
        .reduce((sum, value) => sum + value, 0);
      const distance = Math.abs(upTo - target);
      if (distance < closest) {
        closest = distance;
        best = index;
      }
    }
    const pageLength = lengths
      .slice(after, best)
      .reduce((sum, value) => sum + value, 0);
    const remaining = lengths
      .slice(best)
      .reduce((sum, value) => sum + value, 0);
    // Ni une page trop maigre, ni un reste qui ne tiendrait pas debout.
    if (pageLength < MIN_PAGE_CHARS || remaining < MIN_PAGE_CHARS) break;
    cuts.push(best);
    consumed = best;
  }
  void consumed;
  return cuts;
}

/** Rend l'article découpé en `pages` pages, invitation comprise. Rend le
 * texte inchangé quand il n'y a pas de quoi couper. */
export function paginateHtml(
  html: string,
  pages: number,
  language?: string | null,
) {
  if (!Number.isFinite(pages) || pages < 2) return html;
  const blocks = html.match(BLOCK);
  if (!blocks || blocks.length < 2) return html;
  // Ce qui n'est pas un bloc reconnu (texte nu) n'a pas à disparaître au
  // recollage : on ne découpe que si les blocs couvrent tout.
  if (blocks.join('') !== html.replace(/\s+(?=<)/g, '')) {
    const rebuilt = blocks.join('\n');
    if (textLength(rebuilt) !== textLength(html)) return html;
  }
  const cuts = cutPoints(blocks, pages);
  if (!cuts.length) return html;

  const teaser = `<p>${continueLabel(language)}</p>`;
  const out: string[] = [];
  blocks.forEach((block, index) => {
    if (cuts.includes(index)) out.push(teaser, NEXT_PAGE);
    out.push(block);
  });
  return out.join('\n');
}
