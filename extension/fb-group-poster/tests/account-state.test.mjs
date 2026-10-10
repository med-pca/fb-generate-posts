/* Reconnaître un compte suspendu ou une vérification demandée — sans
 * confondre avec un post qui en parle, ni avec une limite de publication. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadContentScript } from './helpers.mjs';

async function stateOf(text, href = 'https://www.facebook.com/groups/1') {
  const document = { body: { innerText: text }, querySelector: () => null, querySelectorAll: () => [], addEventListener() {} };
  const location = { href, pathname: new URL(href).pathname };
  const env = { document, location, window: { addEventListener() {} }, navigator: {} };
  globalThis.FBX = {};
  for (const file of ['helpers.js', 'interact.js', 'steps.js']) {
    const g = await loadContentScript(`../src/content/${file}`, env);
    globalThis.FBX = g.FBX;
  }
  return globalThis.FBX.steps.accountState();
}

test('« Nous avons suspendu votre compte » : suspendu', async () => {
  const r = await stateOf('Nous avons suspendu votre compte. Vous avez 180 jours pour faire appel.', 'https://www.facebook.com/checkpoint/1501092823525282/');
  assert.equal(r.state, 'disabled');
});

test('« We suspended your account » sur une page courte : suspendu', async () => {
  assert.equal((await stateOf('We suspended your account. Learn more')).state, 'disabled');
});

test('page de vérification : checkpoint, pas suspendu', async () => {
  const r = await stateOf('Confirm your identity. We need more information.', 'https://www.facebook.com/checkpoint/828281030927956/');
  assert.equal(r.state, 'checkpoint');
});

test('un post qui parle de suspension dans un long fil : rien', async () => {
  const feed = 'Recette du jour. '.repeat(400) + ' My friend wrote: your account has been disabled, what to do?';
  assert.equal((await stateOf(feed)).state, 'ok');
});

test('limite de publication : rien (traitée à part)', async () => {
  assert.equal((await stateOf('We limit how often you can post, comment or do other things in a given amount of time')).state, 'ok');
});
