/* La page Options quand le service de l'extension ne répond pas : un message
 * clair, pas des champs vides et un « Appairage en cours... » éternel. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { JSDOM } = require('../../../node_modules/jsdom');
const html = readFileSync(new URL('../src/options/options.html', import.meta.url), 'utf8').replace(/<script[^>]*><\/script>/g, '');
const code = readFileSync(new URL('../src/options/options.js', import.meta.url), 'utf8');

async function page(sendMessage) {
  const dom = new JSDOM(html, { runScripts: 'outside-only' });
  const w = dom.window;
  w.chrome = { runtime: { sendMessage }, permissions: { request: async () => true } };
  w.eval(code.replace(/^import .*$/gm, ''));
  await new Promise((r) => setTimeout(r, 50));
  return w;
}

test('service de l’extension en panne : la page le dit, avec quoi faire', async () => {
  const w = await page(() => Promise.reject(new Error('Could not establish connection. Receiving end does not exist.')));
  assert.match(w.document.getElementById('pairState').textContent, /ne repond pas.*Recharger/s);
});

test('« Connecter » ne reste pas sur « Appairage en cours »', async () => {
  const w = await page(() => Promise.reject(new Error('Receiving end does not exist.')));
  w.document.getElementById('pairCode').value = 'K7F2QMJH';
  w.document.getElementById('pair').click();
  await new Promise((r) => setTimeout(r, 50));
  const note = w.document.getElementById('pairNote').textContent;
  assert.doesNotMatch(note, /en cours/);
  assert.match(note, /ne repond pas/);
});
