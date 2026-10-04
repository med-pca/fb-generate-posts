/* What Chrome checks at load time, checked here instead: a missing file or an
 * `import` in a content script fails silently in the page, and the first sign of
 * it is a post that never goes out. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { access } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');
const exists = async (path) => access(new URL(path, root)).then(() => true, () => false);

const manifest = JSON.parse(await read('manifest.json'));

test('tous les fichiers cites par le manifeste existent', async () => {
  const declared = [
    manifest.background.service_worker,
    manifest.action.default_popup,
    manifest.options_page,
    ...manifest.content_scripts.flatMap((entry) => entry.js),
  ];
  for (const file of declared) {
    assert.ok(await exists(file), `${file} est cite par le manifeste mais absent`);
  }
});

test('les content scripts sont des scripts classiques : aucun import/export', async () => {
  for (const file of manifest.content_scripts.flatMap((entry) => entry.js)) {
    const source = await read(file);
    assert.doesNotMatch(source, /^\s*(import|export)\s/m, `${file} utilise un module ES, que Chrome n'injecte pas`);
  }
});

test('le service worker est un module et ses imports resolvent', async () => {
  assert.equal(manifest.background.type, 'module');
  const seen = new Set();
  const walk = async (file) => {
    if (seen.has(file)) return;
    seen.add(file);
    const source = await read(file);
    const dir = new URL(file, root);
    for (const match of source.matchAll(/from\s+'([^']+)'/g)) {
      const target = new URL(match[1], dir);
      const relative = target.href.replace(root.href, '');
      assert.ok(await exists(relative), `${file} importe ${match[1]}, introuvable`);
      await walk(relative);
    }
  };
  await walk(manifest.background.service_worker);
  assert.ok(seen.size > 5, 'le graphe de modules du worker parait incomplet');
});

test('les pages HTML ne portent pas de script en ligne (interdit par la CSP)', async () => {
  for (const page of [manifest.action.default_popup, manifest.options_page]) {
    const source = await read(page);
    assert.doesNotMatch(source, /<script(?![^>]*\ssrc=)[^>]*>[\s\S]*?\S[\s\S]*?<\/script>/i, `${page} contient un script en ligne`);
    assert.doesNotMatch(source, /\son\w+=/i, `${page} contient un gestionnaire d'evenement en ligne`);
  }
});

test('les permissions declarent ce dont le worker se sert', () => {
  for (const permission of ['storage', 'tabs', 'alarms', 'scripting']) {
    assert.ok(manifest.permissions.includes(permission), `permission manquante : ${permission}`);
  }
  assert.ok(manifest.host_permissions.some((h) => h.includes('facebook.com')), 'Facebook doit etre dans host_permissions');
});

test('la cloture du job declenche automatiquement la modification des commentaires', async () => {
  const source = await read('src/background/orchestrator.js');
  assert.match(source, /case 'link': await doLink\(config, api, state\)/);
  assert.match(source, /placeLinks\(working\.id, api, config, \{ jobId: job\.jobId \}\)/);
});
