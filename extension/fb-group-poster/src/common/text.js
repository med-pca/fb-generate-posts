/* Turning an API post into the exact text that goes into the composer.
 * Port of app/facebook/content.py. */

const ENTITIES = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  eacute: 'é', egrave: 'è', agrave: 'à', ccedil: 'ç',
  ecirc: 'ê', ocirc: 'ô', ugrave: 'ù', icirc: 'î',
  laquo: '«', raquo: '»', hellip: '…', rsquo: '’',
  lsquo: '‘', ldquo: '“', rdquo: '”', deg: '°',
  euro: '€', mdash: '—', ndash: '–',
};

/* Content imported from a web page keeps its entities ("&amp;" for "&") and
 * Facebook shows text verbatim -- a post went out reading "Mango-Poblano Salsa
 * &amp; Coconut Rice". This is the last step before the composer, so it is the
 * right place to catch them whatever the source. */
export function unescapeHtml(text) {
  return String(text || '')
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number(dec)))
    .replace(/&([a-z]+);/gi, (whole, name) => {
      const hit = ENTITIES[name.toLowerCase()];
      return hit === undefined ? whole : hit;
    });
}

/* What goes in the post: the description alone, beside the image. No title and
 * no link. The link reaches the post later, by editing the first comment once
 * everything is verified -- a post that carries an outbound link when Facebook
 * decides who sees it is shown to fewer people. */
export function composePostBody(description) {
  return unescapeHtml(description).trim();
}

/* The source link on its own. Empty when the post carries no link. */
export function composeFirstComment(url) {
  return unescapeHtml(url).trim();
}
