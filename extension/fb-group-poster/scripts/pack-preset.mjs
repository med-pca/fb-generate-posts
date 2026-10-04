/* Le paquet préconfiguré : la même extension pour TOUS les profils
 * NSTBrowser, qui s'appairent seuls au démarrage — plus de code à copier.
 *
 * Les valeurs viennent du .env de l'agent local (fb-lyazidi/.env) :
 *   JOB_API_BASE_URL, JOB_API_KEY, NST_API_KEY
 * (surchargeables par PRESET_API_BASE, PRESET_API_KEY, PRESET_NST_API_KEY).
 *
 * Le dépôt n'est jamais modifié : on copie l'extension dans un dossier
 * temporaire, on y écrit le préréglage, et on zippe. Le paquet contient la
 * clé d'API : ne pas le partager hors de vos machines (dist/ est ignoré par git).
 *
 *   npm run pack:preset   ->  ../dist/fb-group-poster-preset.zip
 */
import { cp, mkdtemp, readFile, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';

const here = resolve(new URL('..', import.meta.url).pathname);
const envFile = resolve(here, '..', '.env');

function parseEnv(text) {
  const out = {};
  for (const line of text.split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    out[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return out;
}

const env = parseEnv(await readFile(envFile, 'utf8').catch(() => ''));
const preset = {
  apiBaseUrl: (process.env.PRESET_API_BASE || env.JOB_API_BASE_URL || 'https://post.pulserecipe.com/api').replace(/\/+$/, ''),
  apiKey: process.env.PRESET_API_KEY || env.JOB_API_KEY || '',
  nstApiKey: process.env.PRESET_NST_API_KEY || env.NST_API_KEY || '',
};
if (!preset.apiKey) {
  console.error(`Pas de clé d'API : renseigne JOB_API_KEY dans ${envFile} (ou PRESET_API_KEY).`);
  process.exit(1);
}
if (!preset.nstApiKey) {
  console.warn('Attention : pas de clé NSTBrowser (NST_API_KEY) — le profil ne pourra pas être détecté seul.');
}

const work = await mkdtemp(join(tmpdir(), 'fb-poster-preset-'));
try {
  await cp(join(here, 'manifest.json'), join(work, 'manifest.json'));
  await cp(join(here, 'src'), join(work, 'src'), { recursive: true });
  await cp(join(here, 'icons'), join(work, 'icons'), { recursive: true });
  await writeFile(
    join(work, 'src/common/preset.js'),
    `/* Généré par npm run pack:preset — contient la clé d'API, ne pas partager. */\nexport const PRESET = ${JSON.stringify(preset, null, 2)};\n`,
  );
  const dist = resolve(here, '..', 'dist');
  await mkdir(dist, { recursive: true });
  const out = join(dist, 'fb-group-poster-preset.zip');
  await rm(out, { force: true });
  execFileSync('zip', ['-r', '-q', out, 'manifest.json', 'src', 'icons', '-x', '*.DS_Store'], { cwd: work });
  const mask = (k) => (k ? `${k.slice(0, 4)}…${k.slice(-4)}` : '(vide)');
  console.log(`Paquet préconfiguré : ${out}`);
  console.log(`  API            ${preset.apiBaseUrl}`);
  console.log(`  clé d'API      ${mask(preset.apiKey)}`);
  console.log(`  clé NSTBrowser ${mask(preset.nstApiKey)}`);
  console.log('À installer dans tous les profils NSTBrowser : chacun s’appaire seul au démarrage.');
} finally {
  await rm(work, { recursive: true, force: true });
}
