/** Les adresses de la plateforme : une par rubrique, sans préfixe. */
export type AppRoute = { view: string; tab?: string; title: string };

export const APP_ROUTES: Record<string, AppRoute> = {
  '/': { view: 'dashboard', title: 'Vue d’ensemble' },
  '/profils': { view: 'profiles', title: 'Profils' },
  '/groupes': { view: 'groups', title: 'Groupes' },
  '/categories': { view: 'categories', title: 'Catégories' },
  '/sites': { view: 'sites', title: 'Sites' },
  '/articles': { view: 'articles', title: 'Articles' },
  '/posts': { view: 'posts', tab: 'queue', title: 'Posts — file d’attente' },
  '/posts/tous': { view: 'posts', tab: 'all', title: 'Posts — tous' },
  '/journaux': { view: 'logs', title: 'Journaux' },
  '/pilotage': { view: 'runners', title: 'Pilotage' },
  '/parametres': { view: 'settings', title: 'Paramètres' },
  '/comptes': { view: 'users', title: 'Comptes' },
  '/actions-en-masse': { view: 'bulk', title: 'Actions en masse' },
};

/** Les pages qui portent un identifiant : la fiche d'un profil. */
export const DYNAMIC_ROUTES: Array<{ pattern: RegExp; fastify: string; view: string }> = [
  { pattern: /^\/profils\/[a-z0-9_-]{6,64}$/i, fastify: '/profils/:id', view: 'profile-page' },
];

/** Une adresse de la plateforme, sans barre finale ni paramètres. */
export function appPath(raw: string) {
  const path = (raw.split(/[?#]/)[0] || '/').replace(/\/+$/, '') || '/';
  return path.toLowerCase();
}

export const isAppRoute = (raw: string) => {
  const path = (raw.split(/[?#]/)[0] || '/').replace(/\/+$/, '') || '/';
  return Object.prototype.hasOwnProperty.call(APP_ROUTES, path.toLowerCase()) || DYNAMIC_ROUTES.some((r) => r.pattern.test(path));
};

/** Où revenir après la connexion. Seulement une page de la plateforme :
 * jamais une adresse externe (`//site`, `https://…`), qui ferait de la page
 * de connexion un tremplin vers un faux site. */
export function safeNext(raw: unknown) {
  const next = typeof raw === 'string' ? raw : '';
  if (!next.startsWith('/') || next.startsWith('//') || next.startsWith('/\\')) return '/';
  if (next.startsWith('/api/docs')) return '/api/docs';
  if (!isAppRoute(next)) return '/';
  // Un identifiant garde sa casse ; une rubrique se lit en minuscules.
  const path = (next.split(/[?#]/)[0] || '/').replace(/\/+$/, '') || '/';
  const clean = DYNAMIC_ROUTES.some((r) => r.pattern.test(path)) ? path : appPath(next);
  return clean + (next.includes('?') ? next.slice(next.indexOf('?')) : '');
}

/** Les anciennes adresses `/admin…` : vers la nouvelle page. */
export function legacyTarget(raw: string) {
  const path = appPath(raw);
  if (path !== '/admin' && !path.startsWith('/admin/')) return null;
  const rest = path.slice('/admin'.length) || '/';
  if (rest === '/' || rest === '/index.html') return '/';
  return isAppRoute(rest) ? rest : '/';
}

/** Les en-têtes de sécurité de chaque page. La politique de contenu n'autorise
 * que nos propres scripts : un script injecté dans une donnée ne s'exécute
 * pas. Les images viennent de partout en HTTPS (images des posts). */
export const SECURITY_HEADERS: Record<string, string> = {
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY',
  'referrer-policy': 'same-origin',
  'permissions-policy': 'camera=(), microphone=(), geolocation=(), payment=()',
  'cross-origin-opener-policy': 'same-origin',
};
export const PAGE_CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' https: data: blob:",
  "connect-src 'self'",
  "font-src 'self' data:",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');
