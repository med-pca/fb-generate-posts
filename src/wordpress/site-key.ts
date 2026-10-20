import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  hkdfSync,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';

/**
 * Les clés de site du plugin WordPress (v2).
 *
 * Une clé par site, générée par la plateforme : `dfb_<idSite>_<secret>`.
 * L'identifiant dit à quel site elle appartient — le serveur n'a plus à se
 * fier au `siteUrl` du corps, que n'importe quel détenteur de la clé globale
 * pouvait remplacer par l'adresse d'un autre site.
 *
 * La clé ne circule jamais : chaque requête, dans les deux sens, est signée
 * (HMAC-SHA256 du secret) avec un horodatage et un nonce. Une requête
 * interceptée ne peut être ni rejouée, ni modifiée.
 */

const KEY_PATTERN = /^dfb_([a-z0-9]{8,40})_([0-9a-f]{64})$/;
const SEALED_PREFIX = 'enc:v1:';

/** Écart toléré entre l'horloge du site et celle du serveur. */
export const SIGNATURE_WINDOW_SECONDS = 300;

export const SIGNATURE_HEADERS = {
  site: 'x-dfb-site',
  timestamp: 'x-dfb-timestamp',
  nonce: 'x-dfb-nonce',
  signature: 'x-dfb-signature',
} as const;

export type ParsedSiteKey = { siteId: string; secret: string };

export function generateSiteKey(siteId: string) {
  return `dfb_${siteId}_${randomBytes(32).toString('hex')}`;
}

export function parseSiteKey(
  key: string | null | undefined,
): ParsedSiteKey | null {
  const match = KEY_PATTERN.exec(String(key ?? '').trim());
  return match ? { siteId: match[1], secret: match[2] } : null;
}

/** Les 4 derniers caractères : de quoi reconnaître une clé sans la montrer. */
export function keyHint(key: string) {
  return `dfb_…${key.slice(-4)}`;
}

const sha256 = (body: string | Buffer) =>
  createHash('sha256').update(body).digest('hex');

/** Ce qui est signé. Le plugin PHP construit exactement la même chaîne. */
export function canonical(
  siteId: string,
  timestamp: string,
  nonce: string,
  method: string,
  body: string | Buffer,
) {
  return [
    'DFB1',
    siteId,
    timestamp,
    nonce,
    method.toUpperCase(),
    sha256(body),
  ].join('\n');
}

export function sign(secret: string, payload: string) {
  return createHmac('sha256', secret).update(payload).digest('hex');
}

/** Les en-têtes d'une requête signée vers (ou depuis) un site. */
export function signedHeaders(
  key: ParsedSiteKey,
  method: string,
  body: string | Buffer = '',
  now = Date.now(),
) {
  const timestamp = String(Math.floor(now / 1000));
  const nonce = randomBytes(16).toString('hex');
  return {
    [SIGNATURE_HEADERS.site]: key.siteId,
    [SIGNATURE_HEADERS.timestamp]: timestamp,
    [SIGNATURE_HEADERS.nonce]: nonce,
    [SIGNATURE_HEADERS.signature]: sign(
      key.secret,
      canonical(key.siteId, timestamp, nonce, method, body),
    ),
  };
}

export type SignatureCheck =
  | { ok: true }
  | { ok: false; reason: 'expired' | 'bad_signature' | 'malformed' };

export function verifySignature(
  key: ParsedSiteKey,
  input: {
    timestamp: string;
    nonce: string;
    signature: string;
    method: string;
    body: string | Buffer;
  },
  now = Date.now(),
): SignatureCheck {
  if (
    !/^\d{9,12}$/.test(input.timestamp) ||
    !/^[0-9a-f]{16,64}$/.test(input.nonce) ||
    !/^[0-9a-f]{64}$/.test(input.signature)
  ) {
    return { ok: false, reason: 'malformed' };
  }
  if (
    Math.abs(Math.floor(now / 1000) - Number(input.timestamp)) >
    SIGNATURE_WINDOW_SECONDS
  ) {
    return { ok: false, reason: 'expired' };
  }
  const expected = Buffer.from(
    sign(
      key.secret,
      canonical(
        key.siteId,
        input.timestamp,
        input.nonce,
        input.method,
        input.body,
      ),
    ),
    'hex',
  );
  const provided = Buffer.from(input.signature, 'hex');
  return expected.length === provided.length &&
    timingSafeEqual(expected, provided)
    ? { ok: true }
    : { ok: false, reason: 'bad_signature' };
}

/** Les nonces déjà vus, le temps de la fenêtre de signature : une requête
 * signée ne passe qu'une fois. En mémoire — une seule instance de l'API. */
export class NonceCache {
  private readonly seen = new Map<string, number>();
  constructor(
    private readonly ttlMs = SIGNATURE_WINDOW_SECONDS * 2 * 1000,
    private readonly max = 100_000,
  ) {}

  /** `true` si le nonce est nouveau (et le retient), `false` s'il a déjà servi. */
  remember(scope: string, nonce: string, now = Date.now()) {
    const id = `${scope}:${nonce}`;
    const expires = this.seen.get(id);
    if (expires && expires > now) return false;
    if (this.seen.size >= this.max) this.prune(now);
    this.seen.set(id, now + this.ttlMs);
    return true;
  }

  private prune(now: number) {
    for (const [id, expires] of this.seen)
      if (expires <= now) this.seen.delete(id);
    // Toujours plein : on lâche les plus anciens plutôt que de grossir sans fin.
    for (const id of this.seen.keys()) {
      if (this.seen.size < this.max * 0.9) break;
      this.seen.delete(id);
    }
  }
}

/** Chiffrement au repos (AES-256-GCM). La plateforme doit pouvoir signer ses
 * propres appels avec la clé : une empreinte ne suffirait pas. */
export class KeyVault {
  private readonly key: Buffer;

  constructor(masterSecret: string) {
    if (!masterSecret || masterSecret.length < 16) {
      throw new Error(
        'SITE_KEY_SECRET (ou AUTH_SECRET) doit faire au moins 16 caractères',
      );
    }
    this.key = Buffer.from(
      hkdfSync('sha256', masterSecret, 'dfb-site-keys', 'aes-256-gcm', 32),
    );
  }

  static isSealed(value: string | null | undefined) {
    return String(value ?? '').startsWith(SEALED_PREFIX);
  }

  seal(plain: string) {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
    return `${SEALED_PREFIX}${iv.toString('base64')}:${cipher.getAuthTag().toString('base64')}:${data.toString('base64')}`;
  }

  /** La clé en clair. Une valeur non chiffrée (clé saisie avant la v2) est
   * rendue telle quelle ; une valeur chiffrée illisible donne `null`. */
  open(stored: string | null | undefined): string | null {
    if (!stored) return null;
    if (!KeyVault.isSealed(stored)) return stored;
    const [iv, tag, data] = stored.slice(SEALED_PREFIX.length).split(':');
    try {
      const decipher = createDecipheriv(
        'aes-256-gcm',
        this.key,
        Buffer.from(iv, 'base64'),
      );
      decipher.setAuthTag(Buffer.from(tag, 'base64'));
      return Buffer.concat([
        decipher.update(Buffer.from(data, 'base64')),
        decipher.final(),
      ]).toString('utf8');
    } catch {
      return null;
    }
  }
}
