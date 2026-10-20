import { randomBytes } from 'node:crypto';

/** La clé du plugin d'un site : 256 bits aléatoires, reconnaissables à leur
 * préfixe. Elle n'ouvre que ce site (voir WordpressGuard). */
export function generateSiteKey() {
  return `dfb_site_${randomBytes(32).toString('base64url')}`;
}
