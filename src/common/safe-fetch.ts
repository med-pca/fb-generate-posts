import { BadGatewayException, BadRequestException } from '@nestjs/common';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

/** Une adresse que le serveur ne doit jamais atteindre pour le compte d'un
 * tiers : boucle locale, réseau privé, lien local. Ce qui n'est pas une
 * adresse IP reconnue est refusé aussi — mieux vaut écarter une résolution
 * inattendue que la suivre. */
export function isPrivateIp(address: string) {
  if (!isIP(address)) return true;
  const normalized = address.toLowerCase();
  return (
    normalized === '::1' ||
    normalized.startsWith('fc') ||
    normalized.startsWith('fd') ||
    normalized.startsWith('fe80:') ||
    normalized.startsWith('127.') ||
    normalized.startsWith('10.') ||
    normalized.startsWith('192.168.') ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(normalized) ||
    /^169\.254\./.test(normalized)
  );
}

/** Garde-fou commun à toutes les lectures distantes : HTTPS obligatoire, et un
 * nom qui ne résout que vers des adresses publiques. Rend l'URL analysée,
 * prête pour `fetch`.
 *
 * La résolution ici ne lie pas celle de `fetch` : entre les deux, le nom peut
 * changer de réponse. Elle ferme la porte à une URL pointant ouvertement vers
 * l'intérieur, pas à un DNS hostile. */
export async function assertSafeRemoteUrl(value: string) {
  const url = new URL(value);
  if (url.protocol !== 'https:') {
    throw new BadRequestException('Seules les sources HTTPS sont acceptées');
  }
  let addresses: Array<{ address: string; family: number }>;
  try {
    addresses = await lookup(url.hostname, { all: true });
  } catch {
    throw new BadGatewayException(
      'Le nom de domaine de la source est temporairement inaccessible',
    );
  }
  if (
    !addresses.length ||
    addresses.some(({ address }) => isPrivateIp(address))
  ) {
    throw new BadRequestException(
      'Les adresses locales ou privées sont interdites',
    );
  }
  return url;
}
