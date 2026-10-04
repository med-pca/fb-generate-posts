/** Une adresse d'article comparable : hôte sans www, chemin sans barre
 * finale, sans paramètres ni ancre. `https://www.site.com/tarte/?utm=x` et
 * `https://site.com/tarte` désignent le même article. */
export function articleUrlKey(raw: string | null | undefined): string | null {
  if (!raw) return null;
  try {
    const url = new URL(raw);
    const host = url.hostname.toLowerCase().replace(/^www\./, '');
    const path = decodeURI(url.pathname).replace(/\/+$/, '').toLowerCase();
    return `${host}${path}`;
  } catch {
    return null;
  }
}

/** L'article est-il sur ce site ? (même hôte, www ou non) */
export function isOnSite(articleUrl: string, siteUrl: string): boolean {
  const article = articleUrlKey(articleUrl);
  const site = articleUrlKey(siteUrl);
  if (!article || !site) return false;
  // Un site peut vivre dans un sous-dossier (https://x.com/blog).
  return article !== site && article.startsWith(`${site}/`);
}
