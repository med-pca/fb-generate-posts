import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import {
  KeyVault,
  NonceCache,
  generateSiteKey,
  parseSiteKey,
  signedHeaders,
  verifySignature,
} from './site-key';

const headers = (h: Record<string, string>) => ({
  timestamp: h['x-dfb-timestamp'],
  nonce: h['x-dfb-nonce'],
  signature: h['x-dfb-signature'],
});

describe('Clés de site 2.x', () => {
  const key = generateSiteKey('clsite0001');
  const parts = parseSiteKey(key)!;

  it('une clé porte l’identifiant de son site', () => {
    expect(parts.siteId).toBe('clsite0001');
    expect(parts.secret).toMatch(/^[0-9a-f]{64}$/);
    expect(parseSiteKey('cle-globale-1x')).toBeNull();
  });

  it('accepte une requête signée, refuse un corps modifié ou une autre clé', () => {
    const body = JSON.stringify({ title: 'Été à Fès' });
    const h = signedHeaders(parts, 'POST', body);
    expect(
      verifySignature(parts, { ...headers(h), method: 'POST', body }),
    ).toEqual({ ok: true });
    expect(
      verifySignature(parts, {
        ...headers(h),
        method: 'POST',
        body: body + ' ',
      }).ok,
    ).toBe(false);
    const other = parseSiteKey(generateSiteKey('clsite0001'))!;
    expect(
      verifySignature(other, { ...headers(h), method: 'POST', body }).ok,
    ).toBe(false);
    expect(
      verifySignature(parts, { ...headers(h), method: 'GET', body }).ok,
    ).toBe(false);
  });

  it('refuse une signature trop ancienne', () => {
    const h = signedHeaders(parts, 'GET', '', Date.now() - 3_600_000);
    expect(
      verifySignature(parts, { ...headers(h), method: 'GET', body: '' }),
    ).toEqual({ ok: false, reason: 'expired' });
  });

  it('un nonce ne sert qu’une fois', () => {
    const cache = new NonceCache();
    expect(cache.remember('site', 'abc')).toBe(true);
    expect(cache.remember('site', 'abc')).toBe(false);
    expect(cache.remember('autre', 'abc')).toBe(true);
  });

  it('chiffre au repos et refuse un autre secret maître', () => {
    const vault = new KeyVault('secret-maitre-de-test-assez-long');
    const sealed = vault.seal(key);
    expect(sealed.startsWith('enc:v1:')).toBe(true);
    expect(sealed).not.toContain(parts.secret);
    expect(vault.open(sealed)).toBe(key);
    expect(new KeyVault('un-autre-secret-maitre-123').open(sealed)).toBeNull();
    expect(vault.open('ancienne-cle-en-clair')).toBe('ancienne-cle-en-clair');
  });

  // Le plugin PHP doit signer et vérifier exactement comme la plateforme.
  const php = (() => {
    try {
      execFileSync('php', ['-v']);
      return true;
    } catch {
      return false;
    }
  })();
  (php ? it : it.skip)(
    'interopère avec le plugin PHP dans les deux sens',
    () => {
      const body = JSON.stringify({ title: 'Été à Fès', text: 'a\\nb « c »' });
      const h = signedHeaders(parts, 'POST', body);
      const plugin = join(
        __dirname,
        '../../wordpress/data-fb-posting/data-fb-posting.php',
      );
      const script = `
      define('ABSPATH', '/');
      function add_action(...$a) {} function add_filter(...$a) {}
      function get_transient($k) { return false; } function set_transient(...$a) { return true; }
      class WP_Error { public $code; function __construct($c = '', $m = '', $d = array()) { $this->code = $c; } }
      $in = json_decode(stream_get_contents(STDIN), true);
      function get_option($n, $d) { global $in; return array('key' => $in['key']); }
      require $in['plugin'];
      $h = $in['h'];
      $ok = DFB_Posting::verify('POST', $in['body'], $h['x-dfb-site'], $h['x-dfb-timestamp'], $h['x-dfb-nonce'], $h['x-dfb-signature'], true);
      echo json_encode(array('verified' => $ok === true, 'signed' => DFB_Posting::signed_headers(DFB_Posting::key_parts(), 'POST', $in['body'])));
    `;
      const out = JSON.parse(
        execFileSync('php', ['-r', script], {
          input: JSON.stringify({ key, body, h, plugin }),
        }).toString(),
      ) as { verified: boolean; signed: Record<string, string> };
      expect(out.verified).toBe(true);
      expect(out.signed['x-dfb-site']).toBe('clsite0001');
      expect(
        verifySignature(parts, {
          ...headers(out.signed),
          method: 'POST',
          body,
        }),
      ).toEqual({ ok: true });
    },
  );
});
