/* Retrouver les ANCIENNES versions de nos extensions et les ranger dans
 * extension/archive/ : la plateforme les importe (rubrique Extensions →
 * Archives).
 *
 * Sources :
 *   - l'historique git de ce dépôt (dossiers et anciens ZIP) ;
 *   - des paquets ZIP posés à la main (option --zip <clé> <fichier>).
 *
 * Les clés trouvées (apiKey, nstApiKey…) sont VIDÉES avant archivage.
 *
 *   node scripts/collect-extension-history.mjs [--zip publication ../fb-lyazidi/dist/fb-group-poster.zip]...
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { deflateRawSync, inflateRawSync } from 'node:zlib';

const ROOT = process.cwd();
const ARCHIVE = join(ROOT, 'extension', 'archive');
const SOURCES = [
  { key: 'capture', dir: 'extension/fb-catch-post', zip: 'extension/fb-catch-post.zip' },
  { key: 'moderateur', dir: 'extension/fb-post-checker', zip: 'extension/fb-post-checker.zip' },
  { key: 'publication', dir: 'extension/fb-group-poster' },
  { key: 'adhesion', dir: 'extension/fb-group-joiner' },
];
const EXCLUDE = /(^|\/)(tests?|node_modules|dist|scripts)(\/|$)|\.DS_Store$|\.zip$|(^|\/)README\.md$|(^|\/)package(-lock)?\.json$|(^|\/)build\.sh$|^__MACOSX\//;
const git = (...args) => execFileSync('git', args, { cwd: ROOT, maxBuffer: 64 * 1024 * 1024 });

/** Vider toute clé écrite en dur. */
function sanitize(path, data) {
  if (!/\.(js|json|mjs)$/.test(path)) return data;
  let t = data.toString('utf8');
  t = t.replace(/(\b(?:apiKey|nstApiKey)\s*:\s*)(['"])[^'"]*\2/g, '$1$2$2');
  t = t.replace(/("(?:apiKey|nstApiKey)"\s*:\s*)"[^"]*"/g, '$1""');
  return Buffer.from(t, 'utf8');
}

function readZip(buf) {
  let eocd = -1;
  for (let i = buf.length - 22; i >= 0; i -= 1) if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const out = [];
  for (let n = 0; n < count; n += 1) {
    const method = buf.readUInt16LE(p + 10), comp = buf.readUInt32LE(p + 20), nl = buf.readUInt16LE(p + 28), el = buf.readUInt16LE(p + 30), cl = buf.readUInt16LE(p + 32), local = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nl);
    p += 46 + nl + el + cl;
    if (name.endsWith('/')) continue;
    const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    const raw = buf.subarray(start, start + comp);
    out.push({ path: name, data: method === 8 ? inflateRawSync(raw) : Buffer.from(raw) });
  }
  return out;
}

/** Les fichiers d'une version, ramenés à la racine de l'extension. */
function normalize(files) {
  const manifest = files.find((f) => /(^|\/)manifest\.json$/.test(f.path));
  if (!manifest) return null;
  const prefix = manifest.path.slice(0, -'manifest.json'.length);
  const kept = files
    .filter((f) => f.path.startsWith(prefix))
    .map((f) => ({ path: f.path.slice(prefix.length), data: f.data }))
    .filter((f) => f.path && !EXCLUDE.test(f.path))
    .map((f) => ({ path: f.path, data: sanitize(f.path, f.data) }))
    .sort((a, b) => a.path.localeCompare(b.path));
  const version = String(JSON.parse(kept.find((f) => f.path === 'manifest.json').data.toString('utf8')).version || '0.0.0');
  const hash = createHash('sha256');
  for (const f of kept) hash.update(f.path).update('\0').update(f.data.toString('base64'));
  return { version, files: kept, sha256: hash.digest('hex') };
}

const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = (b) => { let c = 0xffffffff; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
function buildZip(files) {
  const parts = [], central = []; let off = 0;
  for (const f of files) {
    const name = Buffer.from(f.path), comp = deflateRawSync(f.data), crc = crc32(f.data);
    const h = Buffer.alloc(30); h.writeUInt32LE(0x04034b50, 0); h.writeUInt16LE(20, 4); h.writeUInt16LE(0x0800, 6); h.writeUInt16LE(8, 8); h.writeUInt32LE(crc, 14); h.writeUInt32LE(comp.length, 18); h.writeUInt32LE(f.data.length, 22); h.writeUInt16LE(name.length, 26);
    parts.push(h, name, comp);
    const c = Buffer.alloc(46); c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(20, 4); c.writeUInt16LE(20, 6); c.writeUInt16LE(0x0800, 8); c.writeUInt16LE(8, 10); c.writeUInt32LE(crc, 16); c.writeUInt32LE(comp.length, 20); c.writeUInt32LE(f.data.length, 24); c.writeUInt16LE(name.length, 28); c.writeUInt32LE(off, 42);
    central.push(c, name); off += 30 + name.length + comp.length;
  }
  const size = central.reduce((n, b) => n + b.length, 0);
  const e = Buffer.alloc(22); e.writeUInt32LE(0x06054b50, 0); e.writeUInt16LE(files.length, 8); e.writeUInt16LE(files.length, 10); e.writeUInt32LE(size, 12); e.writeUInt32LE(off, 16);
  return Buffer.concat([...parts, ...central, e]);
}

const indexFile = join(ARCHIVE, 'index.json');
const index = existsSync(indexFile) ? JSON.parse(readFileSync(indexFile, 'utf8')) : [];
const known = new Set(index.map((e) => `${e.key}:${e.sha256}`));
const add = (key, snap, date, notes, source) => {
  if (!snap || known.has(`${key}:${snap.sha256}`)) return;
  const taken = index.some((e) => e.key === key && e.version === snap.version);
  const version = taken ? `${snap.version}+${snap.sha256.slice(0, 7)}` : snap.version;
  mkdirSync(join(ARCHIVE, key), { recursive: true });
  const file = `${key}/${key}-${version}.zip`;
  writeFileSync(join(ARCHIVE, file), buildZip(snap.files));
  index.push({ key, version, date, notes, source, sha256: snap.sha256, file });
  known.add(`${key}:${snap.sha256}`);
  console.log(`  + ${key} ${version}  (${date.slice(0, 10)}, ${source})`);
};

// 1. L'historique git : chaque commit qui a touché le dossier ou son ZIP,
//    du plus ancien au plus récent.
for (const src of SOURCES) {
  const paths = [src.dir, ...(src.zip ? [src.zip] : [])];
  let commits = [];
  try {
    commits = git('log', '--reverse', '--format=%H|%aI|%s', '--', ...paths).toString().trim().split('\n').filter(Boolean);
  } catch { /* pas d'historique */ }
  for (const line of commits) {
    const [hash, date, ...msg] = line.split('|');
    const subject = msg.join('|');
    let files = [];
    try {
      const list = git('ls-tree', '-r', '--name-only', hash, '--', src.dir).toString().trim().split('\n').filter(Boolean);
      files = list.map((p) => ({ path: p.slice(src.dir.length + 1), data: git('show', `${hash}:${p}`) }));
    } catch { /* absent à ce commit */ }
    if (files.length) add(src.key, normalize(files), date, subject, `git ${hash.slice(0, 8)}`);
    if (src.zip) {
      try {
        const zip = git('show', `${hash}:${src.zip}`);
        add(src.key, normalize(readZip(zip)), date, `${subject} (paquet ZIP)`, `git ${hash.slice(0, 8)} zip`);
      } catch { /* pas de ZIP à ce commit */ }
    }
  }
}

// 2. Des paquets posés à la main : --zip <clé> <fichier>
const args = process.argv.slice(2);
for (let i = 0; i < args.length; i += 1) {
  if (args[i] !== '--zip') continue;
  const key = args[i + 1], file = args[i + 2];
  i += 2;
  const { mtime } = await import('node:fs').then((fs) => fs.statSync(file));
  add(key, normalize(readZip(readFileSync(file))), mtime.toISOString(), `paquet retrouvé : ${file.split('/').pop()}`, `fichier ${file.split('/').pop()}`);
}

index.sort((a, b) => a.key.localeCompare(b.key) || a.date.localeCompare(b.date));
mkdirSync(ARCHIVE, { recursive: true });
writeFileSync(indexFile, JSON.stringify(index, null, 2) + '\n');
console.log(`${index.length} version(s) archivée(s) dans extension/archive/`);
