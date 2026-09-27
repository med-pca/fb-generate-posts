import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

/** Les mots de passe ne sont jamais stockés : seulement `sel:empreinte`.
 *
 * scrypt vient de Node, sans dépendance à installer, et coûte assez cher
 * pour qu'une empreinte volée ne se retourne pas en quelques heures. */
const KEY_LENGTH = 64;

export function hashPassword(password: string) {
  const salt = randomBytes(16).toString('hex');
  return `${salt}:${scryptSync(password, salt, KEY_LENGTH).toString('hex')}`;
}

/** Comparaison en temps constant : une comparaison ordinaire laisse
 * deviner l'empreinte caractère par caractère. */
export function verifyPassword(password: string, stored: string) {
  const [salt, digest] = stored.split(':');
  if (!salt || !digest) return false;
  const expected = Buffer.from(digest, 'hex');
  const actual = scryptSync(password, salt, KEY_LENGTH);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export function newAutomationKey() {
  return randomBytes(32).toString('hex');
}
