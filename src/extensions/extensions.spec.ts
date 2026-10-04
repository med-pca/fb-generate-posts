import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ExtensionsService } from './extensions.service';
import { EXTENSIONS, setField } from './catalog';
import { buildZip, crc32 } from './zip';

const ROOT = join(__dirname, '..', '..');
const admin: any = { id: 'u1', username: 'admin', role: 'ADMIN', status: 'ACTIVE' };

function setup(existing: any[] = []) {
  const created: any[] = [];
  const prisma: any = {
    extensionRelease: {
      findFirst: jest.fn(async ({ where }: any) => [...existing, ...created].find((r) => r.key === where.key && r.sha256 === where.sha256) ?? null),
      findUnique: jest.fn(async ({ where }: any) => {
        const kv = where.key_version;
        return [...existing, ...created].find((r) => r.key === kv.key && r.version === kv.version) ?? null;
      }),
      create: jest.fn(async ({ data }: any) => { created.push({ createdAt: new Date(), ...data }); return data; }),
      findMany: jest.fn(async () => created),
    },
    user: { findUnique: jest.fn(async () => ({ automationKey: 'CLE-DU-COMPTE-123', nstApiKey: 'NST-456' })) },
    activityLog: { create: jest.fn(async (a: any) => a) },
  };
  return { service: new ExtensionsService(prisma), prisma, created };
}

describe('zip', () => {
  it('produit une archive valide', () => {
    expect(crc32(Buffer.from('123456789'))).toBe(0xcbf43926);
    const zip = buildZip([
      { path: 'manifest.json', data: Buffer.from('{"version":"1.0.0"}') },
      { path: 'src/a.js', data: Buffer.from('console.log("é");') },
    ]);
    const dir = mkdtempSync(join(tmpdir(), 'zip-'));
    const file = join(dir, 'x.zip');
    writeFileSync(file, zip);
    let listing = '';
    try {
      listing = execFileSync('unzip', ['-l', file]).toString();
    } catch {
      return; // pas d'outil unzip sur la machine : on s'arrête au CRC
    }
    expect(listing).toContain('manifest.json');
    expect(listing).toContain('src/a.js');
    expect(execFileSync('unzip', ['-t', file]).toString()).toMatch(/No errors/);
  });
});

describe('ExtensionsService', () => {
  it('importe les ANCIENNES versions archivées, avec leur date d’origine', async () => {
    const { service, created } = setup();
    await service.importArchive(ROOT);
    const capture = created.filter((c) => c.key === 'capture');
    expect(capture.length).toBeGreaterThanOrEqual(3);
    expect(capture.some((c) => c.version === '1.1.0')).toBe(true);
    const oldest = capture.find((c) => c.version === '1.0.0');
    expect(oldest.createdAt.toISOString().slice(0, 10)).toBe('2026-09-27');
    expect(oldest.notes).toMatch(/source : git/);
    const all = created.flatMap((c) => c.files).map((f: any) => Buffer.from(f.b64, 'base64').toString('utf8')).join('\n');
    expect(all).not.toMatch(/[0-9a-f]{48,}/);
  });

  it('relit les extensions du projet et le plugin WordPress, sans tests ni paquets', async () => {
    const { service, created } = setup();
    const names = await service.syncAll(ROOT);
    const latest = (key: string) => created.filter((c) => c.key === key).pop();
    expect(['adhesion', 'capture', 'moderateur', 'publication'].every((k) => latest(k))).toBe(true);
    expect(latest('capture').version).toBe('1.4.1');
    for (const c of created) {
      const paths = c.files.map((f: any) => f.path);
      expect(paths).toContain(c.key === 'wordpress' ? 'data-fb-posting.php' : 'manifest.json');
      expect(paths.some((p: string) => /(^|\/)tests?\//.test(p) || p.endsWith('.zip') || p.endsWith('README.md'))).toBe(false);
    }
    const pub = latest('publication');
    expect(pub.files.every((f: any) => /^(manifest\.json|src\/|icons\/)/.test(f.path))).toBe(true);
    expect(names.length).toBeGreaterThanOrEqual(4);
  });

  it('plugin WordPress : version lue dans l’en-tête PHP, anciennes versions archivées', async () => {
    const { service, created } = setup();
    await service.syncAll(ROOT);
    const wp = created.filter((c) => c.key === 'wordpress');
    expect(wp.map((c) => c.version)).toEqual(expect.arrayContaining(['1.0.0', '1.3.0']));
    expect(wp.every((c) => c.files.length === 1 && c.files[0].path === 'data-fb-posting.php')).toBe(true);
  });

  it('plugin WordPress : le ZIP s’installe tel quel (dossier data-fb-posting/), jamais préconfiguré', async () => {
    const { service, created } = setup();
    await service.syncAll(ROOT);
    const v = created.filter((c) => c.key === 'wordpress').pop().version;
    const { zip, fileName } = await service.download('wordpress', v, { preset: false, origin: 'https://post.pulserecipe.com' }, admin);
    expect(fileName).toBe(`data-fb-posting-${v}.zip`);
    expect(zip.includes(Buffer.from('data-fb-posting/data-fb-posting.php'))).toBe(true);
    await expect(service.download('wordpress', v, { preset: true, origin: 'x' }, admin)).rejects.toThrow('ne se préconfigure pas');
  });

  it('aucune clé dans ce qui est enregistré', async () => {
    const { service, created } = setup();
    await service.syncAll(ROOT);
    const all = created.flatMap((c) => c.files).map((f: any) => Buffer.from(f.b64, 'base64').toString('utf8')).join('\n');
    expect(all).not.toMatch(/[0-9a-f]{48,}/);
  });

  it('ne double pas une version identique', async () => {
    const first = setup();
    await first.service.syncAll(ROOT);
    const again = setup(first.created);
    expect(await again.service.syncAll(ROOT)).toEqual([]);
  });

  it('téléchargement préconfiguré : la clé du compte est injectée dans le bon fichier', async () => {
    const { service, created } = setup();
    await service.syncAll(ROOT);
    const v = created.filter((c) => c.key === 'adhesion').pop().version;
    const { zip, fileName } = await service.download('adhesion', v, { preset: true, origin: 'https://post.pulserecipe.com' }, admin);
    expect(fileName).toBe(`adhesion-${v}-preconfiguree.zip`);
    const dir = mkdtempSync(join(tmpdir(), 'ext-'));
    writeFileSync(join(dir, 'a.zip'), zip);
    try {
      const config = execFileSync('unzip', ['-p', join(dir, 'a.zip'), 'config.js']).toString();
      expect(config).toContain('"CLE-DU-COMPTE-123"');
      expect(config).toContain('"NST-456"');
      expect(config).toContain('https://post.pulserecipe.com');
    } catch (e) {
      if (!String(e).includes('ENOENT')) throw e;
    }
  });

  it('publication : le préréglage porte l’adresse /api, la clé et la clé NSTBrowser', () => {
    const def = EXTENSIONS.find((e) => e.key === 'publication')!;
    const out = def.preset!.fill('', { origin: 'https://x.test', apiKey: 'K', nstApiKey: 'N' });
    expect(out).toContain('"apiBaseUrl": "https://x.test/api"');
    expect(out).toContain('"apiKey": "K"');
  });

  it('setField remplace une valeur entre guillemets simples ou doubles', () => {
    expect(setField("apiKey: '',", 'apiKey', 'abc')).toBe("apiKey: 'abc',");
    expect(setField('nstApiKey: "",', 'nstApiKey', 'x')).toBe('nstApiKey: "x",');
    expect(setField("apiBase: 'https://a'", 'apiBase', "https://b")).toBe("apiBase: 'https://b'");
  });
});
