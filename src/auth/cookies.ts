import type { IncomingHttpHeaders } from 'node:http';

/** Le cookie de session. `__Host-` en HTTPS : le navigateur exige alors
 * Secure, Path=/ et aucun Domain — le cookie ne peut ni fuir vers un
 * sous-domaine, ni être posé par un autre. */
export const SESSION_COOKIE = 'pf_session';
export const SECURE_SESSION_COOKIE = '__Host-pf_session';

export function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of (header || '').split(';')) {
    const index = part.indexOf('=');
    if (index < 0) continue;
    const name = part.slice(0, index).trim();
    if (!name) continue;
    try {
      out[name] = decodeURIComponent(part.slice(index + 1).trim());
    } catch {
      out[name] = part.slice(index + 1).trim();
    }
  }
  return out;
}

/** La requête est-elle arrivée en HTTPS ? Derrière le proxy (nginx), c'est
 * lui qui le dit. En production, on le considère acquis. */
export function isSecure(headers: IncomingHttpHeaders) {
  const forwarded = String(headers['x-forwarded-proto'] || '').split(',')[0].trim();
  return forwarded === 'https' || process.env.NODE_ENV === 'production';
}

export function sessionTokenFrom(headers: IncomingHttpHeaders) {
  const cookies = parseCookies(headers.cookie);
  return cookies[SECURE_SESSION_COOKIE] || cookies[SESSION_COOKIE] || '';
}

/** HttpOnly : aucun script de la page ne peut le lire. SameSite=Strict : il
 * ne part jamais avec une requête venue d'un autre site. */
export function sessionCookie(token: string, maxAgeSeconds: number, secure: boolean) {
  const name = secure ? SECURE_SESSION_COOKIE : SESSION_COOKIE;
  return `${name}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAgeSeconds}${secure ? '; Secure' : ''}`;
}

export function clearSessionCookies(secure: boolean) {
  return [
    `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0`,
    ...(secure ? [`${SECURE_SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0; Secure`] : []),
  ];
}

/** L'adresse du client, derrière le proxy. */
export function clientIp(headers: IncomingHttpHeaders, fallback?: string) {
  const forwarded = String(headers['x-forwarded-for'] || '').split(',')[0].trim();
  return (forwarded || String(headers['x-real-ip'] || '') || fallback || '').slice(0, 100) || null;
}
